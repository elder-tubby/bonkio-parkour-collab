/**
 * handlers.js - UI Event Binders
 *
 * This file connects user interface events (clicks, mouse moves, key presses)
 * to the application's state and network logic. It uses a state-flag based
 * model for robust mouse handling and includes a full set of keyboard shortcuts.
 */

import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import Canvas from "./canvas.js";
import { copyLineInfo } from "./exportLines.js";
import {
  getHitLineId,
  distance,
  pointFromEventOnCanvas,
  getLineProps,
  handleUndoLastLine,
  updateLineTypeUI,
  normalizeAngle,
} from "./utils-client.js";

// --- State Flags for Mouse Actions ---
let isDraggingLine = false;
let isDraggingSpawn = false;
let isDraggingCapZone = false;
let isDrawingLine = false;

// --- Canvas Event Handlers ---
function handleCanvasDown(e) {
  if (e.button !== 0) return; // Only handle left-clicks
  const point = pointFromEventOnCanvas(e);
  State.set("mouse", point);

  // Priority 1: Dragging map objects
  const spawn = State.get("spawnCircle");
  if (spawn && distance(point, spawn) < spawn.diameter / 2) {
    isDraggingSpawn = true;
    return;
  }
  const cz = State.get("capZone");
  if (
    cz &&
    point.x > cz.x &&
    point.x < cz.x + cz.width &&
    point.y > cz.y &&
    point.y < cz.y + cz.height
  ) {
    isDraggingCapZone = true;
    return;
  }

  // Priority 2: Clicking an existing line to select/drag
  const hitLineId = getHitLineId(point);
  if (hitLineId) {
    State.set("selectedLineId", hitLineId);
    isDraggingLine = true;
    const line = State.get("lines").find((l) => l.id === hitLineId);
    State.set("draggingPreview", {
      mouseStart: point,
      originalLine: line,
      line: line,
    });
    return;
  }

  // Priority 3: Deselect and start drawing a new line
  State.set("selectedLineId", null);
  isDrawingLine = true;
  State.set("startPt", point);
}

function handleCanvasMove(e) {
  const point = pointFromEventOnCanvas(e);
  State.set("mouse", point);

  if (isDraggingSpawn) {
    const spawn = State.get("spawnCircle");
    State.set("spawnCircle", { ...spawn, x: point.x, y: point.y });
    return;
  }
  if (isDraggingCapZone) {
    const cz = State.get("capZone");
    State.set("capZone", {
      ...cz,
      x: point.x - cz.width / 2,
      y: point.y - cz.height / 2,
    });
    return;
  }
  if (isDraggingLine) {
    const preview = State.get("draggingPreview");
    if (!preview) return;
    const dx = point.x - preview.mouseStart.x;
    const dy = point.y - preview.mouseStart.y;
    const updatedLine = {
      ...preview.originalLine,
      start: {
        x: preview.originalLine.start.x + dx,
        y: preview.originalLine.start.y + dy,
      },
      end: {
        x: preview.originalLine.end.x + dx,
        y: preview.originalLine.end.y + dy,
      },
    };
    State.set("draggingPreview", { ...preview, line: updatedLine });
    return;
  }
  if (isDrawingLine) {
    const startPt = State.get("startPt");
    if (startPt) {
      State.set("currentLine", { start: startPt, end: point });
    }
  }
}

function handleCanvasUp(e) {
  if (isDraggingSpawn) {
    const spawn = State.get("spawnCircle");
    Network.setSpawnCircle({ x: spawn.x, y: spawn.y });
  }
  if (isDraggingCapZone) {
    const cz = State.get("capZone");
    Network.setCapZone({ x: cz.x, y: cz.y });
  }
  if (isDraggingLine) {
    const preview = State.get("draggingPreview");
    if (preview && preview.line) {
      Network.updateLine({
        id: preview.originalLine.id,
        start: preview.line.start,
        end: preview.line.end,
      });
    }
  }
  if (isDrawingLine) {
    const startPt = State.get("startPt");
    const endPt = State.get("mouse");
    if (startPt && distance(startPt, endPt) > 5) {
      Network.createLine({ start: startPt, end: endPt });
    }
  }

  // Reset flags & preview state
  isDraggingLine = false;
  isDraggingSpawn = false;
  isDraggingCapZone = false;
  isDrawingLine = false;
  State.set("startPt", null);
  State.set("currentLine", null);
  State.set("draggingPreview", null);
}

// --- Keyboard Handlers ---
function handleKeyDown(e) {
  const active = document.activeElement;
  if (active && active.tagName === "INPUT") return;

  const key = e.key.toLowerCase();
  const selId = State.get("selectedLineId");

  // General commands (no selection needed)
  if (key === "z" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleUndoLastLine();
    return;
  }
  if (key === "c") {
    copyLineInfo(State.get("lines"));
    return;
  }

  if (key === "c") {
    copyLineInfo(State.get("lines"));
    return;
  }
  if (!selId) return;
  const line = State.get("lines").find((l) => l.id === selId);
  if (!line) return;

  // Arrow nudges
  if (e.key.startsWith("Arrow") && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    const nudge = { x: 0, y: 0 };
    if (e.key === "ArrowUp") nudge.y = -1;
    if (e.key === "ArrowDown") nudge.y = 1;
    if (e.key === "ArrowLeft") nudge.x = -1;
    if (e.key === "ArrowRight") nudge.x = 1;
    Network.updateLine({ id: selId, nudge });
    return;
  }

  // ALT + Arrow for width/height
  if (e.altKey && e.key.startsWith("Arrow")) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (key === "arrowleft" || key === "arrowright") {
      const delta = key === "arrowleft" ? -step : step;
      Network.updateLine({ id: selId, widthDelta: delta });
    } else if (key === "arrowup" || key === "arrowdown") {
      const delta = key === "arrowup" ? step : -step;
      Network.updateLine({ id: selId, heightDelta: delta });
    }
    return;
  }

  // SHIFT + Arrow for angle
  if (e.shiftKey && (key === "arrowleft" || key === "arrowright")) {
    e.preventDefault();
    const step = e.ctrlKey ? 10 : 1;
    const delta = key === "arrowleft" ? -step : step;
    Network.updateLine({ id: selId, angleDelta: delta });
    return;
  }

  // Single-key shortcuts
  switch (key) {
    case "b":
      Network.updateLine({
        id: selId,
        type: line.type === "bouncy" ? "none" : "bouncy",
      });
      break;
    case "d":
      Network.updateLine({
        id: selId,
        type: line.type === "death" ? "none" : "death",
      });
      break;
    case "n":
      Network.updateLine({ id: selId, type: "none" });
      break;
    case "x":
    case "delete":
    case "backspace":
      Network.deleteLine(selId);
      break;
  }
}

// --- Main Binding Function ---
let areEventsBound = false;

/**
 * Helper: safely add event listener if element exists.
 * Logs a warning when missing but doesn't throw.
 */
function safeAddEvent(elem, eventName, handler) {
  if (!elem) {
    // keep console.info to avoid noisy warnings during tests, but helpful while debugging
    console.warn(
      `[bindUIEvents] Missing element for ${eventName}; skipping binding.`,
    );
    return;
  }
  elem.addEventListener(eventName, handler);
}

/**
 * createSliderHandler expects propName to be one of:
 *   "width", "height", "angle"
 * and maps it to the UI keys:
 *   lineWidthSlider, lineWidthValue, etc.
 */
function createSliderHandlerFactory(elems) {
  return (propName) => {
    if (!propName) return;
    // map "width" -> "lineWidth", "height" -> "lineHeight", "angle" -> "lineAngle"
    const capitalized = propName[0].toUpperCase() + propName.slice(1);
    const prefix = `line${capitalized}`;
    const sliderKey = `${prefix}Slider`;
    const valueKey = `${prefix}Value`;

    const slider = elems[sliderKey];
    const valueLabel = elems[valueKey];

    if (!slider) {
      console.warn(
        `[bindUIEvents] Slider ${sliderKey} not found, skipping handlers for ${propName}.`,
      );
      return;
    }

    safeAddEvent(slider, "input", () => {
      if (valueLabel) valueLabel.innerText = slider.value;
    });

    safeAddEvent(slider, "change", () => {
      const id = State.get("selectedLineId");
      if (id) {
        // parse suitable numeric value; fallback to Number for safety
        const parsed = parseFloat(slider.value);
        const payload = {};
        payload[propName] = Number.isFinite(parsed) ? parsed : slider.value;
        Network.updateLine({ id, ...payload });
      }
    });
  };
}

export function bindUIEvents() {
  if (areEventsBound) return;

  // Ensure UI was initialized (best-effort). If UI.init exists and no elems found, call it.
  try {
    if (!UI.elems || Object.keys(UI.elems).length === 0) {
      if (typeof UI.init === "function") {
        UI.init();
      }
    }
  } catch (err) {
    console.warn(
      "[bindUIEvents] UI.init invocation failed or UI not ready:",
      err,
    );
  }

  const e = UI.elems || {};

  // convenience local factory
  const createSliderHandler = createSliderHandlerFactory(e);

  // BUTTONS / CONTROLS (all guarded)
  safeAddEvent(e.joinBtn, "click", () => {
    const nameInput = e.usernameInput;
    if (!nameInput) return;
    const name = nameInput.value;
    if (name) {
      Network.joinLobby(name);
      State.set("username", name);
      // if (UI.hide) UI.hide("home");
      // if (UI.show) UI.show("lobby");
    }
  });

  safeAddEvent(e.readyCheckbox, "change", (ev) =>
    Network.setReady(ev.target.checked),
  );
  safeAddEvent(e.voteCheckbox, "change", (ev) =>
    Network.voteFinish(ev.target.checked),
  );

  safeAddEvent(e.chatSendBtn, "click", () => {
    const input = e.chatInput;
    if (!input) return;
    const msg = input.value;
    if (msg) Network.sendChat(msg);
    input.value = "";
  });

  safeAddEvent(e.chatInput, "keydown", (ev) => {
    if (ev.key === "Enter" && e.chatSendBtn) e.chatSendBtn.click();
  });

  safeAddEvent(e.toFrontBtn, "click", () =>
    Network.reorderLines({ id: State.get("selectedLineId"), toBack: false }),
  );
  safeAddEvent(e.toBackBtn, "click", () =>
    Network.reorderLines({ id: State.get("selectedLineId"), toBack: true }),
  );

  safeAddEvent(e.copyMapBtn, "click", () => copyLineInfo(State.get("lines")));
  safeAddEvent(
    e.popupCloseBtn,
    "click",
    () => UI.hide && UI.hide("gameEndPopup"),
  );
  safeAddEvent(e.hideUsernamesCheckbox, "change", (ev) =>
    State.set("hideUsernames", ev.target.checked),
  );

  // Canvas & Window (canvas must exist for canvas-specific handlers)
  safeAddEvent(e.canvas, "mousedown", handleCanvasDown);
  // window-level events can't be missing — still guard just in case
  window.addEventListener("mousemove", handleCanvasMove);
  window.addEventListener("mouseup", handleCanvasUp);
  window.addEventListener("keydown", handleKeyDown);

  // Line editor select
  safeAddEvent(e.lineTypeSelect, "change", (ev) => {
    const id = State.get("selectedLineId");
    if (id) Network.updateLine({ id, type: ev.target.value });
  });

  // Correct mapping for sliders: accepts "width"/"height"/"angle" and maps to the "lineXxx" keys.
  createSliderHandler("width");
  createSliderHandler("height");
  createSliderHandler("angle");

  safeAddEvent(e.deleteLineBtn, "click", () => {
    const id = State.get("selectedLineId");
    if (id) Network.deleteLine(id);
  });

  // Map Settings
  // spawnSizeSlider is also created in UI._createLineEditor; guard it
  safeAddEvent(e.spawnSizeSlider, "input", (ev) => {
    const size = parseInt(ev.target.value, 10);
    if (e.spawnSizeValue) e.spawnSizeValue.innerText = size;
    Network.setMapSize(size);
  });

  // Global: Focus chat on Enter key (guard e.chatInput)
  window.addEventListener("keydown", (ev) => {
    try {
      if (
        ev.key === "Enter" &&
        e.chatInput &&
        document.activeElement !== e.chatInput &&
        State.get("gameActive")
      ) {
        ev.preventDefault();
        e.chatInput.focus();
      }
    } catch (err) {
      // defensive: ignore errors here
      console.warn("[bindUIEvents] global Enter handler error:", err);
    }
  });

  areEventsBound = true;
}
