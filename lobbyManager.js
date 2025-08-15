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
    const lowerName = name.trim().toLowerCase();
    const isDuplicateName = Object.values(this.players).some(
      (p) => p.name.trim().toLowerCase() === lowerName,
    );
    if (isDuplicateName) return { error: "duplicateName" };

    const usedSymbols = new Set(
      Object.values(this.players).map((p) => p.symbol),
    );
    const availableSymbols = PLAYER_SYMBOLS.filter((s) => !usedSymbols.has(s));
    const symbol =
      availableSymbols.length > 0 ? availableSymbols[0] : PLAYER_SYMBOLS[0];

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

  getReadyPlayers() {
    return Object.values(this.players).filter((p) => p.ready && !p.inGame);
  }

  /**
   * --- FIX for Game Start Logic (Problem 5) ---
   * Checks if the conditions are met to start a game.
   * Requires at least two players to be ready.
   */
  canGameStart() {
    const readyPlayers = this.getReadyPlayers();
    return readyPlayers.length >= 2;
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
