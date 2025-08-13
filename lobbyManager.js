// lobbyManager.js
// ----------------------------
// Tracks everyone in the lobby and their “ready” state.

const { PLAYER_SYMBOLS } = require("./config");
const config = require("./config");

const EVENTS = {
  LOBBY_UPDATE: "lobbyUpdate",
};

class LobbyManager {
  constructor(io) {
    this.io = io;
    this.players = {}; // socketId → { id, name, ready }
  }

  addPlayer(socketId, name) {
    // Assign a symbol based on the player's name
    const assignedSymbol = config.getSymbolFromName(name);

    // Filter out symbols that are already in use
    const usedSymbols = new Set(
      Object.values(this.players).map((p) => p.symbol),
    );

    // If the assigned symbol is already in use, find a different one
    let symbol;
    if (usedSymbols.has(assignedSymbol)) {
      const availableSymbols = PLAYER_SYMBOLS.filter(
        (s) => !usedSymbols.has(s),
      );
      // If there are other symbols available, pick a random one
      if (availableSymbols.length > 0) {
        symbol =
          availableSymbols[Math.floor(Math.random() * availableSymbols.length)];
      } else {
        // If all symbols are used, just pick a random one from the whole list,
        // which might result in a duplicate.
        symbol =
          PLAYER_SYMBOLS[Math.floor(Math.random() * PLAYER_SYMBOLS.length)];
      }
    } else {
      symbol = assignedSymbol;
    }

    this.players[socketId] = {
      id: socketId,
      name,
      ready: false,
      symbol,
      inGame: false,
    };

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
        symbol: p.symbol,
        inGame: !!p.inGame,
      })),
    };
  }

  broadcastLobby() {
    this.io.emit(EVENTS.LOBBY_UPDATE, this.getLobbyPayload());
  }
}

module.exports = LobbyManager;
