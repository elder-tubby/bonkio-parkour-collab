/**
 * handlers.js - UI Event Binders
 */
import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import {
  getHitLineId,
  distance,
  pointFromEventOnCanvas,
  handleUndoLastLine,
} from "./utils-client.js";
import { copyLineInfo, pasteLines } from "./copyPasteLines.js";

// --- State Flags for Mouse Actions ---
let isDraggingLine = false;
let isDraggingSpawn = false;
let isDraggingCapZone = false;
let isDrawingLine = false;
let mouseMovedSinceDown = false;

// FIX 10: State for tracking held-down keys for smooth diagonal movement.
const keysDown = new Set();
let nudgeLoopId = null;

// --- Canvas Event Handlers ---
function handleCanvasDown(e) {
  // FIX 6: Ensure actions only start on the canvas element itself, not other UI.
  if (e.button !== 0 || e.target !== UI.elems.canvas) return;

  const point = pointFromEventOnCanvas(e);
  State.set("mouse", point);
  mouseMovedSinceDown = false;

  // Priority 1: Dragging map objects
  const spawn = State.get("spawnCircle");
  if (spawn && distance(point, spawn) < spawn.diameter / 2 + 5) {
    // Added buffer
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
    // Set up a preview state for dragging to avoid modifying the source line directly
    State.set("draggingPreview", {
      mouseStart: point,
      originalLine: line,
      line: { ...line }, // Work on a copy
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
  const lastPoint = State.get("mouse");
  if (point.x !== lastPoint.x || point.y !== lastPoint.y) {
    mouseMovedSinceDown = true;
  }
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
  let actionTaken = false;

  if (isDraggingSpawn) {
    actionTaken = true;
    const spawn = State.get("spawnCircle");
    Network.setSpawnCircle({ x: spawn.x, y: spawn.y });
  }
  if (isDraggingCapZone) {
    actionTaken = true;
    const cz = State.get("capZone");
    Network.setCapZone({ x: cz.x, y: cz.y });
  }
  if (isDraggingLine) {
    actionTaken = true;
    const preview = State.get("draggingPreview");
    if (preview && preview.line && mouseMovedSinceDown) {
      // FIX 3: Optimistic update to prevent visual flicker on drop.
      const lines = State.get("lines").map((l) =>
        l.id === preview.line.id ? preview.line : l,
      );
      State.set("lines", lines);

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
    // FIX 6: The distance check correctly prevents creating tiny lines on simple clicks.
    if (startPt && distance(startPt, endPt) > 5) {
      actionTaken = true;
      Network.createLine({ start: startPt, end: endPt });
    }
  }

  // Reset all state flags and temporary data
  isDraggingLine = false;
  isDraggingSpawn = false;
  isDraggingCapZone = false;
  isDrawingLine = false;
  State.set("startPt", null);
  State.set("currentLine", null);
  State.set("draggingPreview", null);

  // FIX 6: If a drag operation happened on the canvas, prevent the mouseup
  // event from accidentally triggering clicks on other UI elements.
  if (actionTaken && e) {
    e.preventDefault();
  }
}

// --- Keyboard Handlers ---

// FIX 10: Loop for smooth diagonal movement using requestAnimationFrame.
function startNudgeLoop() {
  if (nudgeLoopId) return; // Already running

  const nudgeLoop = () => {
    const selId = State.get("selectedLineId");
    if (!selId || keysDown.size === 0) {
      stopNudgeLoop();
      return;
    }

    const nudge = { x: 0, y: 0 };
    if (keysDown.has("ArrowUp")) nudge.y -= 1;
    if (keysDown.has("ArrowDown")) nudge.y += 1;
    if (keysDown.has("ArrowLeft")) nudge.x -= 1;
    if (keysDown.has("ArrowRight")) nudge.x += 1;

    if (nudge.x !== 0 || nudge.y !== 0) {
      Network.updateLine({ id: selId, nudge });
    }

    nudgeLoopId = requestAnimationFrame(nudgeLoop);
  };
  nudgeLoopId = requestAnimationFrame(nudgeLoop);
}

function stopNudgeLoop() {
  if (nudgeLoopId) {
    cancelAnimationFrame(nudgeLoopId);
    nudgeLoopId = null;
  }
}

function handleKeyUp(e) {
  keysDown.delete(e.key);
  if (!e.key.startsWith("Arrow") && keysDown.size === 0) {
    stopNudgeLoop();
  }
}

function handleKeyDown(e) {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "SELECT"))
    return;

  if (!State.get("gameActive")) return;

  const key = e.key.toLowerCase();
  const selId = State.get("selectedLineId");

  const chatInput = UI.elems.chatInput;
  if (key === "enter" && document.activeElement !== chatInput) {
    e.preventDefault(); // ✅ use `e`, not `ev`
    chatInput.focus();
    return;
  }

  // General commands (no selection needed)
  if (key === "z" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleUndoLastLine();
    return;
  }

  // FIX 5: 'h' key toggles username visibility.
  if (key === "h") {
    e.preventDefault();
    const checkbox = UI.elems.hideUsernamesCheckbox;
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      State.set("hideUsernames", checkbox.checked);
    }
    return;
  }
  if (key === "c") {
    copyLineInfo(State.get("lines"));
    return;
  }

  if (!selId) return;
  const line = State.get("lines").find((l) => l.id === selId);
  if (!line) return;

  // FIX 10: Arrow key nudges are now handled by the key tracking system.
  if (e.key.startsWith("Arrow") && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    keysDown.add(e.key);
    startNudgeLoop();
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

  // Other shortcuts
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

function createSliderHandlerFactory(elems) {
  return (propName) => {
    const capitalized = propName[0].toUpperCase() + propName.slice(1);
    const prefix = `line${capitalized}`;
    const sliderKey = `${prefix}Slider`;
    const valueKey = `${prefix}Value`;

    const slider = elems[sliderKey];
    const valueLabel = elems[valueKey];
    if (!slider) return;

    // FIX 1: Send network update on 'input' for live dragging feedback.
    const handleInput = () => {
      if (valueLabel) valueLabel.innerText = slider.value;
      const id = State.get("selectedLineId");
      if (id) {
        const parsed = parseFloat(slider.value);
        const payload = {
          [propName]: Number.isFinite(parsed) ? parsed : slider.value,
        };
        Network.updateLine({ id, ...payload });
      }
    };

    slider.addEventListener("input", handleInput);
  };
}

export function bindUIEvents() {
  const e = UI.elems;

  // Lobby Controls
  safeAddEvent(e.joinBtn, "click", () => {
    const name = e.usernameInput.value;
    if (name) {
      Network.joinLobby(name);
      State.set("username", name);
    }
  });

  // FIX 11: Pressing Enter in username field clicks the join button.
  safeAddEvent(e.usernameInput, "keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      e.joinBtn.click();
    }
  });

  // FIX 13: Disable checkbox initially. It will be enabled by `app.js` on lobby update.
  if (e.readyCheckbox) e.readyCheckbox.disabled = true;
  safeAddEvent(e.readyCheckbox, "change", (ev) => {
    if (ev.target.disabled) {
      ev.target.checked = false;
      return;
    }
    Network.setReady(ev.target.checked);
  });

  // Game Controls
  safeAddEvent(e.voteCheckbox, "change", (ev) =>
    Network.voteFinish(ev.target.checked),
  );
  safeAddEvent(e.hideUsernamesCheckbox, "change", (ev) =>
    State.set("hideUsernames", ev.target.checked),
  );

  // Chat
  safeAddEvent(e.chatSendBtn, "click", () => {
    const msg = e.chatInput.value;
    if (msg) Network.sendChat(msg);
    e.chatInput.value = "";
  });
  safeAddEvent(e.chatInput, "keydown", (ev) => {
    if (ev.key === "Enter") e.chatSendBtn.click();
  });

  // Canvas & Window Listeners
  safeAddEvent(e.canvas, "mousedown", handleCanvasDown);
  window.addEventListener("mousemove", handleCanvasMove);
  window.addEventListener("mouseup", handleCanvasUp);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Line Editor
  createSliderHandlerFactory(e)("width");
  createSliderHandlerFactory(e)("height");
  createSliderHandlerFactory(e)("angle");

  safeAddEvent(e.lineTypeSelect, "change", (ev) => {
    const id = State.get("selectedLineId");
    if (id) Network.updateLine({ id, type: ev.target.value });
  });
  safeAddEvent(e.deleteLineBtn, "click", () => {
    const id = State.get("selectedLineId");
    if (id) Network.deleteLine(id);
  });
  safeAddEvent(e.copyLineInfoBtn, "click", () => {
    copyLineInfo(State.get("lines"));
  });

  safeAddEvent(e.copyMapBtn, "click", () => {
    copyLineInfo(State.get("lines"));
  });
  safeAddEvent(e.pasteMapBtn, "click", () => {
    pasteLines();
  });
  safeAddEvent(e.toFrontBtn, "click", () =>
    Network.reorderLines({ id: State.get("selectedLineId"), toBack: false }),
  );
  safeAddEvent(e.toBackBtn, "click", () =>
    Network.reorderLines({ id: State.get("selectedLineId"), toBack: true }),
  );

  // Map Settings
  // FIX 2: The spawn size slider now correctly sends map size updates. The visual reset bug was server-side.
  safeAddEvent(e.spawnSizeSlider, "input", (ev) => {
    const size = parseInt(ev.target.value, 10);
    if (e.spawnSizeValue) e.spawnSizeValue.innerText = size;
  });
  safeAddEvent(e.spawnSizeSlider, "change", (ev) => {
    const size = parseInt(ev.target.value, 10);
    Network.setMapSize(size);
  });

  // Misc
  safeAddEvent(e.popupCloseBtn, "click", () => UI.hide("gameEndPopup"));
}

function safeAddEvent(elem, eventName, handler) {
  if (elem) {
    elem.addEventListener(eventName, handler);
  }
}
