/**
 * gameManager.js - Authoritative Server-Side Game State Manager
 *
 * This class manages the entire lifecycle and state of a game round. It is the
 * single source of truth for all game objects (lines, map settings, etc.).
 * It processes player actions, validates them, updates the state, and broadcasts
 * the authoritative results to all clients.
 */

const { v4: uuidv4 } = require("uuid");

// Standardized, camelCase event names for consistency across the stack.
const EVENTS = {
  // Game Flow
  START_GAME: "startGame",
  GAME_UPDATE: "gameUpdate",
  END_GAME: "endGame",
  GAME_SNAPSHOT: "gameSnapshot", // For late-joiners
  GAME_IN_PROGRESS: "gameInProgress",

  // Line Events (Server -> Client)
  LINE_CREATED: "lineCreated",
  LINE_UPDATED: "lineUpdated", // Unified event for all modifications
  LINE_DELETED: "lineDeleted",
  LINES_REORDERED: "linesReordered",

  // Map Object Events (Server -> Client)
  SPAWN_CIRCLE_UPDATED: "spawnCircleUpdated",
  CAP_ZONE_UPDATED: "capZoneUpdated",
  MAP_SIZE_UPDATED: "mapSizeUpdated",

  // Chat
  CLEAR_CHAT: "clearChat",
};

class GameManager {
  constructor(io, lobby) {
    this.io = io;
    this.lobby = lobby;
    this.reset();
  }

  reset() {
    this.active = false;
    this.lines = []; // Stores all line objects
    this.participants = []; // Array of socket IDs in the current game
    this.votes = {}; // { socketId: boolean } for ending the game

    // --- FIX ---
    // Initialize game objects with default values instead of null.
    // This prevents sending null to the client, which causes the crash.
    this.capZone = { x: 385, y: 400, width: 30, height: 18.5 };
    this.spawnCircle = { x: 400, y: 300, diameter: 18 };

    this.mapSize = 9; // Default map size
    this._lastEventTs = new Map(); // For rate limiting player actions
  }

  // --- Game Lifecycle ---

  start() {
    this.active = true;
    this.lines = [];
    this.participants = Object.keys(this.lobby.players).filter(
      (id) => this.lobby.players[id]?.ready,
    );

    if (this.participants.length < 2) {
      this.active = false;
      return; // Not enough ready players
    }

    // Since reset() now handles defaults, we don't need to initialize here.

    this.votes = this.participants.reduce(
      (acc, id) => ({ ...acc, [id]: false }),
      {},
    );
    this.participants.forEach((id) => {
      if (this.lobby.players[id]) this.lobby.players[id].inGame = true;
    });

    this.io.emit(EVENTS.CLEAR_CHAT);
    const payload = this.getStartPayload();
    // Use `to` for targeted emission to participants
    this.io.to(this.participants).emit(EVENTS.START_GAME, payload);

    this.broadcastGameState();
    this.lobby.broadcastLobby();
  }

  endGame(reason = "unknown") {
    this.io.emit(EVENTS.END_GAME, { reason });
    Object.values(this.lobby.players).forEach((p) => {
      if (p) p.inGame = false;
    });
    this.lobby.resetReady();
    this.reset(); // Reset game state after notifying players
    this.lobby.broadcastLobby();
  }

  // --- Player Management ---

  addParticipant(playerId) {
    if (
      !this.active ||
      this.participants.includes(playerId) ||
      !this.lobby.players[playerId]
    )
      return;

    this.participants.push(playerId);
    this.votes[playerId] = false;
    if (this.lobby.players[playerId])
      this.lobby.players[playerId].inGame = true;

    // Send the full game state to the new participant
    this.io
      .to(playerId)
      .emit(EVENTS.GAME_SNAPSHOT, this.getSnapshotFor(playerId));

    this.broadcastGameState();
    this.lobby.broadcastLobby();
  }

  handleDisconnect(playerId) {
    const wasParticipant = this.participants.includes(playerId);
    if (!this.active || !wasParticipant) return;

    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.votes[playerId];

    if (this.participants.length < 2 && this.active) {
      this.endGame("player_left");
    } else {
      this.broadcastGameState();
    }
  }

  voteFinish(playerId, vote) {
    if (!this.active || !(playerId in this.votes)) return;
    this.votes[playerId] = !!vote;

    const total = this.participants.length;
    const yesVotes = Object.values(this.votes).filter(Boolean).length;

    if (total > 1 && yesVotes === total) {
      this.endGame("voted");
    } else {
      this.broadcastGameState();
    }
  }

  // --- State Broadcasting ---

  broadcastGameState() {
    if (!this.active) return;
    const players = this.getGamePlayers();
    const votesCount = Object.values(this.votes).filter(Boolean).length;
    this.io.emit(EVENTS.GAME_UPDATE, {
      players,
      votes: votesCount,
      totalParticipants: this.participants.length,
    });
  }

  getGamePlayers() {
    return this.participants
      .map((id) => this.lobby.players[id])
      .filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, symbol: p.symbol }));
  }

  getStartPayload() {
    return {
      lines: this.lines,
      players: this.getGamePlayers(),
      capZone: this.capZone,
      spawnCircle: this.spawnCircle,
      mapSize: this.mapSize,
    };
  }

  getSnapshotFor(playerId) {
    return {
      ...this.getStartPayload(),
      votesCount: Object.values(this.votes).filter(Boolean).length,
      totalParticipants: this.participants.length,
      lobbyPayload: this.lobby.getLobbyPayload(),
    };
  }

  // --- Authoritative Action Handlers ---

  handleLineCreation(playerId, lineData) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._allow(playerId, "createLine", 200)
    )
      return;
    if (
      !lineData ||
      !this._validPoint(lineData.start) ||
      !this._validPoint(lineData.end)
    )
      return;

    const dx = lineData.end.x - lineData.start.x;
    const dy = lineData.end.y - lineData.start.y;
    if (dx * dx + dy * dy < 25) return; // Min length check

    const player = this.lobby.players[playerId];
    const newLine = {
      id: uuidv4(),
      playerId,
      username: player.name,
      symbol: player.symbol,
      start: lineData.start,
      end: lineData.end,
      type: "none",
      width: Math.hypot(dx, dy),
      height: 4,
      angle: this._computeAngle(lineData.start, lineData.end),
    };

    this.lines.push(newLine);
    this.io.emit(EVENTS.LINE_CREATED, newLine);
  }

  handleLineDeletion(playerId, lineId) {
    if (!this._canModifyLine(playerId, lineId)) return;

    this.lines = this.lines.filter((l) => l.id !== lineId);
    this.io.emit(EVENTS.LINE_DELETED, { id: lineId });
  }

  handleLineReorder(playerId, { id, toBack }) {
    if (!this._canPlayerAct(playerId) || !this._allow(playerId, "reorder", 250))
      return;

    const index = this.lines.findIndex((l) => l.id === id);
    if (index === -1) return;

    const [line] = this.lines.splice(index, 1);
    if (toBack) {
      this.lines.unshift(line);
    } else {
      this.lines.push(line);
    }

    this.io.emit(EVENTS.LINES_REORDERED, this.lines);
  }

  /**
   * The single, unified handler for all line modifications.
   * It processes a flexible payload and emits one 'lineUpdated' event.
   */
  handleLineUpdate(playerId, payload) {
    if (
      !payload?.id ||
      !this._canModifyLine(playerId, payload.id) ||
      !this._allow(playerId, "updateLine", 50)
    )
      return;

    const lineIndex = this.lines.findIndex((l) => l.id === payload.id);
    if (lineIndex === -1) return;

    let currentLine = this.lines[lineIndex];
    let updatedLine = { ...currentLine };

    // Determine if position is changing to recalculate center later
    const isMoving =
      (payload.nudge && (payload.nudge.x || payload.nudge.y)) ||
      (this._validPoint(payload.start) && this._validPoint(payload.end));
    const isResizing =
      typeof payload.width === "number" ||
      typeof payload.angle === "number" ||
      payload.widthDelta ||
      payload.angleDelta;

    // 1. Apply nudges (modifies start/end)
    if (payload.nudge && (payload.nudge.x || payload.nudge.y)) {
      const dx = (payload.nudge.x || 0) * 2; // Nudge amount
      const dy = (payload.nudge.y || 0) * 2;
      updatedLine.start = {
        x: updatedLine.start.x + dx,
        y: updatedLine.start.y + dy,
      };
      updatedLine.end = {
        x: updatedLine.end.x + dx,
        y: updatedLine.end.y + dy,
      };
    }

    // 2. Apply absolute moves (overwrites start/end)
    if (this._validPoint(payload.start) && this._validPoint(payload.end)) {
      updatedLine.start = payload.start;
      updatedLine.end = payload.end;
    }

    // 3. Apply deltas and absolute properties
    if (payload.widthDelta)
      updatedLine.width = (updatedLine.width || 0) + payload.widthDelta;
    if (payload.heightDelta)
      updatedLine.height = (updatedLine.height || 0) + payload.heightDelta;
    if (payload.angleDelta)
      updatedLine.angle = (updatedLine.angle || 0) + payload.angleDelta;

    if (typeof payload.width === "number") updatedLine.width = payload.width;
    if (typeof payload.height === "number") updatedLine.height = payload.height;
    if (typeof payload.angle === "number") updatedLine.angle = payload.angle;
    if (typeof payload.type === "string") updatedLine.type = payload.type;

    // 4. Clamp and normalize values
    updatedLine.width = Math.max(1, Math.min(10000, updatedLine.width || 0));
    updatedLine.height = Math.max(1, Math.min(1000, updatedLine.height || 0));
    updatedLine.angle = ((updatedLine.angle || 0 % 360) + 360) % 360;

    // 5. Recalculate derived properties
    if (isMoving && !isResizing) {
      // Just moved, recalculate width/angle
      const dx = updatedLine.end.x - updatedLine.start.x;
      const dy = updatedLine.end.y - updatedLine.start.y;
      updatedLine.width = Math.hypot(dx, dy);
      updatedLine.angle = this._computeAngle(
        updatedLine.start,
        updatedLine.end,
      );
    } else if (isResizing) {
      // Resized/rotated, recalculate start/end from center
      const center = {
        x: (currentLine.start.x + currentLine.end.x) / 2,
        y: (currentLine.start.y + currentLine.end.y) / 2,
      };
      const w = updatedLine.width;
      const aRad = (updatedLine.angle * Math.PI) / 180;
      const halfX = Math.cos(aRad) * (w / 2);
      const halfY = Math.sin(aRad) * (w / 2);
      updatedLine.start = { x: center.x - halfX, y: center.y - halfY };
      updatedLine.end = { x: center.x + halfX, y: center.y + halfY };
    }

    // 6. Commit the change and broadcast
    this.lines[lineIndex] = updatedLine;
    this.io.emit(EVENTS.LINE_UPDATED, updatedLine);
  }

  setSpawnCircle(playerId, { x, y }) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._validCoord(x) ||
      !this._validCoord(y)
    )
      return;
    this.spawnCircle = { ...this.spawnCircle, x, y };
    this.io.emit(EVENTS.SPAWN_CIRCLE_UPDATED, this.spawnCircle);
  }

  setCapZone(playerId, { x, y }) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._validCoord(x) ||
      !this._validCoord(y)
    )
      return;
    this.capZone = { ...this.capZone, x, y };
    this.io.emit(EVENTS.CAP_ZONE_UPDATED, this.capZone);
  }

  setMapSize(playerId, size) {
    if (!this._canPlayerAct(playerId)) return;
    const clampedSize = Math.max(1, Math.min(13, Math.trunc(size)));
    this.mapSize = clampedSize;
    // The event name on the server was 'mapSizeUpdated' but the client was listening
    // for 'mapSizeUpdate'. I've aligned them here. Let's assume server is the source of truth.
    this.io.emit(EVENTS.MAP_SIZE_UPDATED, clampedSize);
  }

  // --- Helpers & Validation ---

  _allow(playerId, actionKey, minMs = 50) {
    const key = `${playerId}:${actionKey}`;
    const now = Date.now();
    const last = this._lastEventTs.get(key) || 0;
    if (now - last < minMs) return false;
    this._lastEventTs.set(key, now);
    return true;
  }

  _canPlayerAct(playerId) {
    return this.active && this.participants.includes(playerId);
  }

  _canModifyLine(playerId, lineId) {
    if (!this._canPlayerAct(playerId)) return false;
    const line = this.lines.find((l) => l.id === lineId);
    if (!line) return false;
    const ownerIsPresent = this.participants.includes(line.playerId);
    return line.playerId === playerId || !ownerIsPresent;
  }

  _validCoord(c) {
    return typeof c === "number" && isFinite(c);
  }

  _validPoint(pt) {
    return pt && this._validCoord(pt.x) && this._validCoord(pt.y);
  }

  _computeAngle(start, end) {
    const angle =
      Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
    return ((angle % 360) + 360) % 360;
  }
}

module.exports = { GameManager, EVENTS };
