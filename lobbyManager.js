/**
 * lobbyManager.js
 * Tracks everyone in the lobby, their "ready" state, and assigns unique symbols.
 */

const { PLAYER_SYMBOLS } = require("./config");

const EVENTS = {
  LOBBY_UPDATE: "lobbyUpdate",
};

class LobbyManager {
  constructor(io) {
    this.io = io;
    this.players = {}; // socketId → { id, name, ready, symbol, inGame }
  }

  addPlayer(socketId, name) {
    // Prevent joining if a case-insensitive duplicate name exists
    const lowerName = name.trim().toLowerCase();
    const isDuplicateName = Object.values(this.players).some(
      (p) => p.name.trim().toLowerCase() === lowerName,
    );

    if (isDuplicateName) {
      return { error: "duplicateName" };
    }

    // Assign a unique symbol
    const usedSymbols = new Set(
      Object.values(this.players).map((p) => p.symbol),
    );
    const availableSymbols = PLAYER_SYMBOLS.filter((s) => !usedSymbols.has(s));
    const symbol =
      availableSymbols.length > 0
        ? availableSymbols[0] // Predictably take the first available
        : PLAYER_SYMBOLS[Math.floor(Math.random() * PLAYER_SYMBOLS.length)]; // Fallback for overflow

    this.players[socketId] = {
      id: socketId,
      name: name.trim(),
      ready: false,
      symbol,
      inGame: false,
    };

    this.broadcastLobby();
    return { success: true };
  }

  removePlayer(socketId) {
    delete this.players[socketId];
    this.broadcastLobby();
  }

  setReady(socketId, ready) {
    const player = this.players[socketId];
    if (player) {
      player.ready = !!ready;
      this.broadcastLobby();
    }
  }

  readyCount() {
    return Object.values(this.players).filter((p) => p.ready).length;
  }

  /**
   * Checks if the conditions are met to start a game.
   * Requires at least two players, and all of them must be ready.
   */
  areAllPlayersReady() {
    const playerCount = Object.keys(this.players).length;
    if (playerCount < 2) {
      return false;
    }
    return Object.values(this.players).every((p) => p.ready);
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
