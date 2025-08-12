// lobbyManager.js
// ----------------------------
// Tracks everyone in the lobby and their “ready” state.

const { PLAYER_SYMBOLS } = require("./config");

const EVENTS = {
  LOBBY_UPDATE: "lobbyUpdate",
};

class LobbyManager {
  constructor(io) {
    this.io = io;
    this.players = {}; // socketId → { id, name, ready }
  }

  addPlayer(socketId, name) {
    // Pick a unique symbol from available pool
    const usedSymbols = new Set(
      Object.values(this.players).map((p) => p.symbol),
    );
    const availableSymbols = PLAYER_SYMBOLS.filter((s) => !usedSymbols.has(s));

    // If all symbols used, just cycle (or you could reject join)
    const symbol =
      availableSymbols.length > 0
        ? availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
        : PLAYER_SYMBOLS[Math.floor(Math.random() * PLAYER_SYMBOLS.length)];

    this.players[socketId] = { id: socketId, name, ready: false, symbol };
    this.broadcastLobby();
  }

  removePlayer(socketId) {
    delete this.players[socketId];
    this.broadcastLobby();
  }

  setReady(socketId, ready) {
    const p = this.players[socketId];
    if (!p) return;
    p.ready = ready;
    this.broadcastLobby();
  }

  readyCount() {
    return Object.values(this.players).filter((p) => p.ready).length;
  }

  resetReady() {
    Object.values(this.players).forEach((p) => {
      p.ready = false;
    });
  }

  getLobbyPayload() {
    return {
      players: Object.values(this.players).map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        symbol: p.symbol, // send to clients
      })),
    };
  }

  broadcastLobby() {
    this.io.emit(EVENTS.LOBBY_UPDATE, this.getLobbyPayload());
  }
}

module.exports = LobbyManager;
