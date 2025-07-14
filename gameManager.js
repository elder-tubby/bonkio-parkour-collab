// gameManager.js
// ----------------------------
// Manages game lifecycle: start, live updates, votes, and clean teardown.

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
    this.participants = []; // socketIds locked in at start
    this.votes = {}; // socketId → boolean
  }

  start() {
    // Mark game active and generate capture zone
    this.active = true;
    this.capZone = genCapZone();

    // Lock in exactly who’s in this round, in join order
    this.participants = Object.keys(this.lobby.players);
    this.votes = this.participants.reduce((acc, id) => {
      acc[id] = false;
      return acc;
    }, {});

    // Kick off
    this.io.emit(EVENTS.START, this.getStartPayload());
    this.broadcastGameState();
  }

  getStartPayload() {
    return {
      capZone: this.capZone,
      players: this.getGamePlayers(),
    };
  }

  getGamePlayers() {
    return this.participants
      .map((id) => this.lobby.players[id])
      .filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name }));
  }

  broadcastGameState() {
    this.io.emit(EVENTS.UPDATE, {
      capZone: this.capZone,
      players: this.getGamePlayers(),
      votes: Object.values(this.votes).filter(Boolean).length,
    });
  }

  handleLine(playerId, line) {
    if (!this.active || !this.lobby.players[playerId]) return;
    const username = this.lobby.players[playerId].name;
    const id = uuidv4();
    this.io.emit(EVENTS.LINE, { id, playerId, line, username });
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
    // Tear down the round
    this.active = false;
    this.reset();

    // Clear ready states so next round can begin
    this.lobby.resetReady();
    this.lobby.broadcastLobby();

    // Notify clients
    this.io.emit(EVENTS.END, { reason });
  }

  handleDisconnect(playerId) {
    // If they were in the locked‑in participants list:
    if (!this.active || !this.participants.includes(playerId)) return;

    // Remove them from votes & participants
    delete this.votes[playerId];
    this.participants = this.participants.filter((id) => id !== playerId);

    // If too few remain, end; otherwise update vote count
    if (this.participants.length < 2) {
      this.endGame("player_left");
    } else {
      this.broadcastGameState();
    }
  }
  deleteLine(playerId, lineId) {
    // only if active and owned
    if (!this.active || !this.votes || !(playerId in this.votes)) return;
    // broadcast deletion
    this.io.emit(EVENTS.LINE_DELETED, { id: lineId });
  }

  changeLineType(playerId, lineId, type) {
    // only if you’re active & you own the line
    if (!this.active || !this.participants.includes(playerId)) return;
    // broadcast to everyone
    this.io.emit(EVENTS.LINE_TYPE_CHANGED, { id: lineId, type });
  }
}

module.exports = GameManager;
