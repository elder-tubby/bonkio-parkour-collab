/**
 * gameManager.js - Authoritative Server-Side Game State Manager
 */
const { v4: uuidv4 } = require("uuid");
const { EVENTS } = require("./config");
const { getSpawnDiameter } = require("./utils"); // ✅ Import from utils.js

class GameManager {
  constructor(io, lobby) {
    this.io = io;
    this.lobby = lobby;
    this.reset();
  }

  reset() {
    this.active = false;
    this.lines = [];
    this.participants = [];
    this.votes = {};
    this.capZone = { x: 385, y: 400, width: 30, height: 18.5 };
    this.mapSize = 9;
    this.spawnCircle = {
      x: 400,
      y: 300,
      diameter: getSpawnDiameter(this.mapSize),
    };
    this._lastEventTs = new Map();
  }

  start() {
    this.active = true;
    this.lines = [];
    this.participants = Object.keys(this.lobby.players).filter(
      (id) => this.lobby.players[id]?.ready,
    );

    if (this.participants.length < 2) {
      this.active = false;
      return;
    }

    this.votes = this.participants.reduce(
      (acc, id) => ({ ...acc, [id]: false }),
      {},
    );
    this.participants.forEach((id) => {
      if (this.lobby.players[id]) this.lobby.players[id].inGame = true;
    });

    // Tell clients to clear their chat
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.CLEAR_CHAT);
    });

    // Send start payload
    const payload = this.getStartPayload();
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.START_GAME, payload);
    });

    this.broadcastGameState();
    this.lobby.broadcastLobby();
  }

  endGame(reason = "unknown") {
    this.io.emit(EVENTS.END_GAME, { reason });
    Object.values(this.lobby.players).forEach((p) => {
      if (p) p.inGame = false;
    });
    this.lobby.resetReady();
    this.reset();
    this.lobby.broadcastLobby();
  }

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

    if (total > 0 && yesVotes === total) {
      this.endGame("voted");
    } else {
      this.broadcastGameState();
    }
  }

  broadcastGameState() {
    if (!this.active) return;
    const players = this.getGamePlayers();
    const votesCount = Object.values(this.votes).filter(Boolean).length;

    // Send update to participants only
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.GAME_UPDATE, {
        players,
        votes: votesCount,
        totalParticipants: this.participants.length,
      });
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
    if (dx * dx + dy * dy < 25) return;

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

    // Send to all participants
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.LINE_CREATED, newLine);
    });
  }

  handleLineDeletion(playerId, lineId) {
    if (!this._canModifyLine(playerId, lineId)) return;

    this.lines = this.lines.filter((l) => l.id !== lineId);

    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.LINE_DELETED, { id: lineId });
    });
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

    this.participants.forEach((pid) => {
      this.io.to(pid).emit(EVENTS.LINES_REORDERED, this.lines);
    });
  }

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

    const isMoving =
      (payload.nudge && (payload.nudge.x || payload.nudge.y)) ||
      (this._validPoint(payload.start) && this._validPoint(payload.end));
    const isResizing =
      typeof payload.width === "number" ||
      typeof payload.angle === "number" ||
      payload.widthDelta ||
      payload.angleDelta;

    if (payload.nudge && (payload.nudge.x || payload.nudge.y)) {
      const dx = (payload.nudge.x || 0) * 2;
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

    if (this._validPoint(payload.start) && this._validPoint(payload.end)) {
      updatedLine.start = payload.start;
      updatedLine.end = payload.end;
    }

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

    updatedLine.width = Math.max(1, Math.min(10000, updatedLine.width || 0));
    updatedLine.height = Math.max(1, Math.min(1000, updatedLine.height || 0));
    updatedLine.angle = (((updatedLine.angle || 0) % 360) + 360) % 360;

    if (isMoving && !isResizing) {
      const dx = updatedLine.end.x - updatedLine.start.x;
      const dy = updatedLine.end.y - updatedLine.start.y;
      updatedLine.width = Math.hypot(dx, dy);
      updatedLine.angle = this._computeAngle(
        updatedLine.start,
        updatedLine.end,
      );
    } else if (isResizing) {
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

    this.lines[lineIndex] = updatedLine;

    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.LINE_UPDATED, updatedLine);
    });
  }

  setSpawnCircle(playerId, { x, y }) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._validCoord(x) ||
      !this._validCoord(y)
    )
      return;
    this.spawnCircle = { ...this.spawnCircle, x, y };
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.SPAWN_CIRCLE_UPDATED, this.spawnCircle);
    });
  }

  setCapZone(playerId, { x, y }) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._validCoord(x) ||
      !this._validCoord(y)
    )
      return;
    this.capZone = { ...this.capZone, x, y };
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.CAP_ZONE_UPDATED, this.capZone);
    });
  }

  setMapSize(playerId, size) {
    if (!this._canPlayerAct(playerId)) return;
    const clampedSize = Math.max(1, Math.min(13, Math.trunc(size)));
    this.mapSize = clampedSize;
    this.spawnCircle.diameter = getSpawnDiameter(this.mapSize);
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.MAP_SIZE_UPDATED, clampedSize);
    });
  }

  handlePasteLines(playerId, pasteData) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._allow(playerId, "paste", 3000)
    ) {
      return;
    }

    // Authoritative check to prevent pasting over an existing map
    if (this.lines.length > 0) {
      this.io
        .to(playerId)
        .emit(EVENTS.CHAT_ERROR, "Cannot paste, lines already exist.");
      return;
    }

    if (!pasteData || !Array.isArray(pasteData.lines)) return;

    const player = this.lobby.players[playerId];
    const newLines = [];
    for (const line of pasteData.lines) {
      // Basic validation of the line object from the client
      if (
        !line ||
        !this._validPoint(line.start) ||
        !this._validPoint(line.end)
      ) {
        continue;
      }
      newLines.push({
        ...line, // Carry over properties like type, w/h/a, etc.
        id: uuidv4(), // Assign a new, server-authoritative ID
        
        symbol: " ",
      });
    }

    if (newLines.length > 0) {
      this.lines = newLines;

      // Update map state from pasted data
      if (pasteData.mapSize) {
        this.setMapSize(playerId, pasteData.mapSize);
      }
      if (pasteData.spawn && this._validPoint(pasteData.spawn)) {
        this.setSpawnCircle(playerId, pasteData.spawn);
      }

      // Use the existing reorder event to send the full new line set to all clients
      this.participants.forEach((id) => {
        this.io.to(id).emit(EVENTS.LINES_REORDERED, this.lines);
      });
    }
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
