// state.js
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
      playerId: null,
      username: '',
      startPt: null,
      lines: [],
      gameActive: false,
      selectedLineId: null,
      mouse: { x: 0, y: 0 },
      isHoldingS: false,
      spawnCircle: { x: 0, y: 0, diameter: 18, dragging: false },
      capZone: { x: 0, y: 0, width: 20, height: 12.4, dragging: false },
      hideUsernames: false,
      mapSize: 5, // default in range 1–13
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
