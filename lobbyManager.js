// lobbyManager.js
// ----------------------------
// Tracks everyone in the lobby and their “ready” state.

const EVENTS = {
  LOBBY_UPDATE: 'lobbyUpdate',
};

class LobbyManager {
  constructor(io) {
    this.io      = io;
    this.players = {}; // socketId → { id, name, ready }
  }

  addPlayer(socketId, name) {
    this.players[socketId] = { id: socketId, name, ready: false };
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
    return Object.values(this.players).filter(p => p.ready).length;
  }

  resetReady() {
    Object.values(this.players).forEach(p => { p.ready = false; });
  }

  getLobbyPayload() {
    return {
      players: Object.values(this.players).map(p => ({
        id:    p.id,
        name:  p.name,
        ready: p.ready,
      })),
    };
  }

  broadcastLobby() {
    this.io.emit(EVENTS.LOBBY_UPDATE, this.getLobbyPayload());
  }
}

module.exports = LobbyManager;
