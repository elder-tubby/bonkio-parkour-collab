/**
 * lobbyManager.js
 * Tracks everyone in the lobby, their "ready" state, and assigns unique symbols.
 */

const { PLAYER_SYMBOLS, EVENTS } = require("./config");

class LobbyManager {
  constructor(io, getGameActive = () => false) {
    this.io = io;
    this.players = {};
    this.getGameActive = getGameActive;
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

    // Don't broadcast here; let the caller decide when to broadcast.
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
    // Also include game status in the lobby update.
    const payload = this.getLobbyPayload();
    // This is a bit of a hack; ideally game state isn't managed here.
    // We'll add a property to the payload.
    // A better solution would be for the gameManager to broadcast its own status.
    // For now, this will work for the client.
    this.io.emit(EVENTS.LOBBY_UPDATE, {
      ...payload,
      gameActive: !!this.getGameActive(),
    });
  }
}

module.exports = LobbyManager;
