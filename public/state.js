// A tiny event emitter + central state store

class Emitter {
  constructor() {
    this.listeners = new Set();
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(...args) {
    this.listeners.forEach((fn) => fn(...args));
  }
}

class State {
  constructor() {
    this._state = {
      // --- FIX ---
      // Initialized all state properties for consistency and to prevent errors.
      // Renamed `lobbyPlayers` to `players` to match usage in app.js.

      socketId: null, // Was being set but not initialized
      playerId: null,
      username: "",

      gameActive: false,
      players: [], // Formerly `lobbyPlayers` and now correctly named

      // Line-related state
      lines: [],
      currentLine: null,
      selectedLineId: null,
      draggingLine: null,

      // Canvas interaction state
      mouse: { x: 0, y: 0 },
      startPt: null,
      isHoldingS: false,

      // Game object state
      spawnCircle: { x: 0, y: 0, diameter: 18, dragging: false },
      capZone: { x: null, y: null, width: 30, height: 18.5, dragging: false },

      // Settings
      hideUsernames: false,
      mapSize: 9, // default in range 1–13
    };
    this.emitter = new Emitter();
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    this._state[key] = value;
    this.emitter.emit(key, value);
  }

  onChange(fn) {
    // fn will be called as fn(key, newValue)
    return this.emitter.on(fn);
  }
}

export default new State();
