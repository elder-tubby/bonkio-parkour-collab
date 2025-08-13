// gameManager.js
const { genCapZone } = require("./utils");
const EVENTS = {
  START: "startGame",
  UPDATE: "gameUpdate",
  LINE: "playerLine",
  END: "endGame",
  LINE_DELETED: "lineDeleted",
  LINE_TYPE_CHANGED: "lineTypeChanged",
};
const { v4: uuidv4 } = require("uuid");

class GameManager {
  constructor(io, lobby) {
    this.io = io;
    this.lobby = lobby;
    this.reset();
  }

  reset() {
    this.active = false;
    this.capZone = null;
    this.spawnCircle = null; // { x, y, diameter }
    this.mapSize = 9;
    this.participants = []; // socketIds locked in at start (or added during game)
    this.votes = {}; // socketId → boolean
    this.lines = []; // persistent list of lines for the round
  }

  start() {
    this.active = true;
    this.capZone = genCapZone();
    this.participants = Object.keys(this.lobby.players);
    this.votes = this.participants.reduce((acc, id) => {
      acc[id] = false;
      return acc;
    }, {});

    this.participants.forEach((id) => {
      if (this.lobby.players[id]) this.lobby.players[id].inGame = true;
    });

    this.lines = [];
    this.io.emit(EVENTS.START, this.getStartPayload());
    this.broadcastGameState();
    this.lobby.broadcastLobby();
  }

  getStartPayload() {
    return {
      capZone: this.capZone,
      players: this.getGamePlayers(),
      spawnCircle: this.spawnCircle,
      mapSize: this.mapSize,
      lines: this.lines,
    };
  }

  // gameManager.js — getSnapshotFor
  getSnapshotFor(playerId) {
    const players = this.getGamePlayers();
    const votesCount = Object.values(this.votes).filter(Boolean).length;
    const totalParticipants = players.length;

    // include full lobby payload so clients have an authoritative lobby list
    const lobbyPayload = this.lobby.getLobbyPayload();

    return {
      capZone: this.capZone,
      players,
      spawnCircle: this.spawnCircle,
      mapSize: this.mapSize,
      lines: this.lines,
      votesCount,
      totalParticipants,
      lobbyPayload, // <-- NEW
    };
  }

  getGamePlayers() {
    return this.participants
      .map((id) => this.lobby.players[id])
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        name: p.name,
        symbol: p.symbol,
      }));
  }

  broadcastGameState() {
    const players = this.getGamePlayers();
    const votesCount = Object.values(this.votes).filter(Boolean).length;

    this.io.emit(EVENTS.UPDATE, {
      capZone: this.capZone,
      players,
      votes: votesCount, // number of yes votes
      spawnCircle: this.spawnCircle,
      mapSize: this.mapSize,
      linesCount: this.lines.length,
    });
  }

  // called when an existing or new participant draws a line
  handleLine(playerId, line) {
    // only allow lines from players who are active participants in the round
    if (
      !this.active ||
      !this.lobby.players[playerId] ||
      !this.participants.includes(playerId)
    )
      return;

    const player = this.lobby.players[playerId];
    const username = player.name;
    const symbol = player.symbol;
    const id = uuidv4();

    const stored = {
      id,
      playerId,
      start: line.start,
      end: line.end,
      username,
      symbol,
      type: "none",
    };
    this.lines.push(stored);

    this.io.emit(EVENTS.LINE, { id, playerId, line, username, symbol });
  }

  // gameManager.js — addParticipant
  addParticipant(playerId) {
    if (!this.active) return;
    if (!this.lobby.players[playerId]) return;
    if (this.participants.includes(playerId)) return;

    // add to participants and votes map first
    this.participants.push(playerId);
    this.votes[playerId] = false;

    // mark lobby player as inGame
    if (this.lobby.players[playerId])
      this.lobby.players[playerId].inGame = true;

    // Broadcast the lobby & game state so every client sees the new participant
    // (this ensures their UIs will show the new player and the vote totals)
    this.lobby.broadcastLobby();
    this.broadcastGameState();

    // THEN send the personal snapshot to the new participant
    this.io.to(playerId).emit("gameSnapshot", this.getSnapshotFor(playerId));
  }

  removeParticipant(playerId) {
    if (!this.participants.includes(playerId)) return;
    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.votes[playerId];
    if (this.lobby.players[playerId])
      this.lobby.players[playerId].inGame = false;

    // broadcast both game state and lobby state
    if (this.participants.length < 2) {
      this.endGame("player_left");
    } else {
      this.broadcastGameState();
      this.lobby.broadcastLobby();
    }
  }

  voteFinish(playerId, vote) {
    if (!this.active || !(playerId in this.votes)) return;
    this.votes[playerId] = vote;

    const total = Object.keys(this.votes).length;
    const yes = Object.values(this.votes).filter((v) => v).length;
    const unanimous = yes === total && total > 1;

    if (unanimous) {
      this.endGame("voted");
    } else {
      this.broadcastGameState();
    }
  }

  endGame(reason = "unknown") {
    this.active = false;
    // unmark lobby inGame flags
    Object.values(this.lobby.players).forEach((p) => {
      if (p) p.inGame = false;
    });

    // clear and reset
    this.reset();

    // Clear ready states so next round can begin
    this.lobby.resetReady();
    this.lobby.broadcastLobby();

    // Notify clients
    this.io.emit(EVENTS.END, { reason });
  }

  handleDisconnect(playerId) {
    // If they were in the locked-in participants list:
    if (!this.active || !this.participants.includes(playerId)) return;

    // Remove them from votes & participants
    delete this.votes[playerId];
    this.participants = this.participants.filter((id) => id !== playerId);
    if (this.lobby.players[playerId])
      this.lobby.players[playerId].inGame = false;

    // If too few remain, end; otherwise update vote count
    if (this.participants.length < 2) {
      this.endGame("player_left");
    } else {
      this.broadcastGameState();
    }
  }

  deleteLine(playerId, lineId) {
    if (!this.active || !this.participants.includes(playerId)) return;

    const line = this.lines.find((l) => l.id === lineId);
    if (!line) return;

    const ownerId = line.playerId;
    const ownerStillPresent = this.participants.includes(ownerId);

    // If owner still present, only they may delete their line.
    if (ownerStillPresent && ownerId !== playerId) return;

    this.lines = this.lines.filter((l) => l.id !== lineId);
    this.io.emit(EVENTS.LINE_DELETED, { id: lineId });
  }

  changeLineType(playerId, lineId, type) {
    if (!this.active || !this.participants.includes(playerId)) return;

    const line = this.lines.find((l) => l.id === lineId);
    if (!line) return;

    const ownerId = line.playerId;
    const ownerStillPresent = this.participants.includes(ownerId);

    // If owner still present, only they may change the type
    if (ownerStillPresent && ownerId !== playerId) return;

    this.lines = this.lines.map((l) => (l.id === lineId ? { ...l, type } : l));
    this.io.emit(EVENTS.LINE_TYPE_CHANGED, { id: lineId, type });
  }

  // New: moveLine
  moveLine(playerId, { id, start, end }) {
    if (!this.active || !this.participants.includes(playerId)) return;
    const line = this.lines.find((l) => l.id === id);
    if (!line) return;

    const ownerId = line.playerId;
    const ownerStillPresent = this.participants.includes(ownerId);

    // If owner still present, only owner may move it
    if (ownerStillPresent && ownerId !== playerId) return;

    // apply new coords
    line.start = start;
    line.end = end;

    // Broadcast a dedicated event so clients can update in place
    this.io.emit("lineMoved", { id, start, end });
  }

  // setters so index.js handlers can update game state
  setSpawnCircle(x, y, diameter) {
    this.spawnCircle = { x, y, diameter };
    this.io.emit("spawnCircleMove", { x, y });
  }

  setCapZone(x, y, width, height) {
    this.capZone = { x, y, width, height };
    this.io.emit("capZoneMove", { x, y });
  }

  setMapSize(size) {
    this.mapSize = size;
    this.io.emit("spawnSizeChange", { size });
  }
}

module.exports = GameManager;
