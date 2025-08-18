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
      socketId: null,
      playerId: null,
      username: "",

      gameActive: false,
      players: [],

      // Unified object state
      objects: [],
      selectedObjectId: null,
      draggingPreview: null, // Used for both lines and polys

      // State for drawing new shapes
      isDrawingPoly: false,
      drawingShape: null, // { type: 'line', ... } or { type: 'poly', ... }

      // Canvas interaction state
      mouse: { x: 0, y: 0 },
      startPt: null,

      // Game object state
      spawnCircle: { x: 0, y: 0, diameter: 18 },
      capZone: { x: null, y: null, width: 30, height: 18.5 },

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