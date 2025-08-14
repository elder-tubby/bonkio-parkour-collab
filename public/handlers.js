/**
 * handlers.js - Client-Side Input Handlers
 *
 * This file contains all the functions that respond to user interactions
 * (clicks, key presses, mouse movements, etc.).
 *
 * Key Principle: Handlers should be "thin". Their primary responsibilities are:
 * 1. Interpret user input.
 * 2. Perform purely local, non-authoritative UI previews (e.g., showing a line as it's being drawn).
 * 3. Delegate actions that change the authoritative game state to the server via the Network module.
 *
 * Authoritative state changes are received from the server and applied in app.js.
 */

import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import Canvas from "./canvas.js";
import { copyLineInfo } from "./exportLines.js";
import {
  getHitLineId,
  updateLineTypeUI,
  handleUndoLastLine,
  pointFromEventOnCanvas,
  distance,
  computeAngleDeg,
  normalizeAngle,
} from "./utils-client.js";

const MIN_LINE_LENGTH_SQ = 25; // Min length to register a new line (5px^2)

// ---- UI Element Handlers ----

export function handleJoin() {
  const name = UI.elems.usernameInput.value.trim();
  if (!name) {
    return alert("Please enter a username.");
  }
  State.set("username", name);
  Network.joinLobby(name);
}

export function handleReadyToggle(ev) {
  Network.setReady(ev.target.checked);
}

export function handleVoteToggle(ev) {
  Network.voteFinish(ev.target.checked);
}

export function handleLineTypeChange(ev) {
  const type = ev.target.value;
  const id = State.get("selectedLineId");
  if (!id) return;
  // Delegate change to server
  Network.emitLineUpdate({ id, type });
  // Immediately update local UI for responsiveness
  updateLineTypeUI(type);
}

export function handleSendChat() {
  const msg = UI.elems.chatInput.value.trim();
  if (!msg) return;
  Network.sendChat(msg);
  UI.elems.chatInput.value = "";
}

export function handleEnterKey(onSubmit) {
  return (ev) => {
    if (ev.key === "Enter") {
      onSubmit();
    }
  };
}

export function handleHideUsernamesToggle(ev) {
  State.set("hideUsernames", ev.target.checked);
}

export function handleDeleteLine() {
  const id = State.get("selectedLineId");
  if (!id) return;
  // Delegate deletion to server
  Network.deleteLine(id);
}

export function handleSpawnSliderInput(ev) {
  const size = Number(ev.target.value);
  // Update local UI immediately for responsiveness
  if (UI.elems.spawnSizeValue) {
    UI.elems.spawnSizeValue.innerText = String(size);
  }
  // Delegate change to server
  Network.emitSpawnSizeChange(size);
}

// ---- Canvas Interaction Handlers ----

export function handleCanvasDown(evt) {
  const pt = pointFromEventOnCanvas(evt);

  // Check for dragging map objects (spawn, cap zone)
  const spawn = State.get("spawnCircle");
  if (spawn && distance(pt, spawn) <= spawn.diameter / 2) {
    State.set("draggingSpawn", true);
    return;
  }
  const capZone = State.get("capZone");
  if (
    capZone &&
    pt.x >= capZone.x &&
    pt.x <= capZone.x + capZone.width &&
    pt.y >= capZone.y &&
    pt.y <= capZone.y + capZone.height
  ) {
    State.set("draggingCapZone", true);
    return;
  }

  // Check for hitting an existing line to select and drag it
  const hitId = getHitLineId(pt);
  if (hitId) {
    State.set("selectedLineId", hitId);
    const line = State.get("lines").find((l) => l.id === hitId);
    if (line) {
      // Set up a preview state for dragging
      State.set("draggingPreview", {
        id: hitId,
        mouseStart: pt,
        originalLine: { ...line },
      });
      window.addEventListener("mousemove", handleCanvasMoveDuringDrag);
      window.addEventListener("mouseup", handleCanvasDragEnd);
    }
    return;
  }

  // If nothing else was hit, start drawing a new line
  State.set("selectedLineId", null);
  State.set("startPt", pt);
}

export function handleCanvasMove(evt) {
  const pt = pointFromEventOnCanvas(evt);
  State.set("mouse", pt); // Keep track of mouse position for other uses

  // Handle dragging map objects (local preview)
  if (State.get("draggingSpawn")) {
    const spawn = State.get("spawnCircle");
    State.set("spawnCircle", { ...spawn, x: pt.x, y: pt.y });
    Canvas.draw();
    return;
  }
  if (State.get("draggingCapZone")) {
    const capZone = State.get("capZone");
    State.set("capZone", {
      ...capZone,
      x: pt.x - capZone.width / 2,
      y: pt.y - capZone.height / 2,
    });
    Canvas.draw();
    return;
  }

  // Handle drawing a new line (local preview)
  const startPt = State.get("startPt");
  if (startPt) {
    State.set("currentLine", { start: startPt, end: pt });
    Canvas.draw();
  }
}

export function handleCanvasUp(evt) {
  const pt = pointFromEventOnCanvas(evt);

  // Finalize dragging map objects by notifying the server
  if (State.get("draggingSpawn")) {
    State.set("draggingSpawn", false);
    const spawn = State.get("spawnCircle");
    Network.emitSpawnCircleUpdate({ x: spawn.x, y: spawn.y });
    return;
  }
  if (State.get("draggingCapZone")) {
    State.set("draggingCapZone", false);
    const capZone = State.get("capZone");
    Network.emitCapZoneUpdate({ x: capZone.x, y: capZone.y });
    return;
  }

  // Finalize drawing a new line
  const startPt = State.get("startPt");
  if (startPt) {
    State.set("startPt", null);
    State.set("currentLine", null);

    const distSq = (pt.x - startPt.x) ** 2 + (pt.y - startPt.y) ** 2;
    if (distSq > MIN_LINE_LENGTH_SQ) {
      // Delegate line creation to the server
      Network.drawLine({
        start: startPt,
        end: pt,
        username: State.get("username"),
      });
    }
    Canvas.draw();
  }
}

// Special handlers for dragging an existing line
export function handleCanvasMoveDuringDrag(evt) {
  const preview = State.get("draggingPreview");
  if (!preview) return;

  const pt = pointFromEventOnCanvas(evt);
  const dx = pt.x - preview.mouseStart.x;
  const dy = pt.y - preview.mouseStart.y;

  // Update the preview object, NOT the main state's line array
  const updatedPreviewLine = {
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

  State.set("draggingPreview", { ...preview, line: updatedPreviewLine });
  Canvas.draw(); // Canvas will know to draw this preview line
}

export function handleCanvasDragEnd() {
  const preview = State.get("draggingPreview");
  if (!preview || !preview.line) return;

  // Delegate the final position to the server
  Network.emitLineUpdate({
    id: preview.id,
    start: preview.line.start,
    end: preview.line.end,
  });

  // Clean up preview state and listeners
  State.set("draggingPreview", null);
  window.removeEventListener("mousemove", handleCanvasMoveDuringDrag);
  window.removeEventListener("mouseup", handleCanvasDragEnd);
  Canvas.draw();
}

// ---- Keyboard Handlers ----

export function handleKeyCommands(ev) {
  if (document.activeElement === UI.elems.chatInput) return;

  const key = ev.key.toLowerCase();
  const selId = State.get("selectedLineId");

  // General commands
  switch (key) {
    case "h":
      const current = State.get("hideUsernames");
      State.set("hideUsernames", !current);
      UI.elems.hideUsernamesCheckbox.checked = !current;
      return;
    case "c":
      if (ev.ctrlKey) copyLineInfo(State.get("lines"));
      return;
    case "z":
      if (ev.ctrlKey) {
        ev.preventDefault();
        handleUndoLastLine(); // This util function should probably emit to server too
      }
      return;
  }

  // Commands that require a selected line
  if (!selId) return;

  const line = State.get("lines").find((l) => l.id === selId);
  if (!line) return;

  // ALT + Arrow keys for width/height
  if (ev.altKey) {
    const step = ev.shiftKey ? 10 : 1;
    if (key === "arrowleft" || key === "arrowright") {
      ev.preventDefault();
      const delta = key === "arrowleft" ? -step : step;
      Network.emitLineUpdate({ id: selId, widthDelta: delta });
    } else if (key === "arrowup" || key === "arrowdown") {
      ev.preventDefault();
      const delta = key === "arrowup" ? step : -step;
      Network.emitLineUpdate({ id: selId, heightDelta: delta });
    }
    return;
  }

  // SHIFT + Arrow keys for angle
  if (ev.shiftKey && (key === "arrowleft" || key === "arrowright")) {
    ev.preventDefault();
    const step = ev.ctrlKey ? 10 : 1;
    const delta = key === "arrowleft" ? -step : step;
    Network.emitLineUpdate({ id: selId, angleDelta: delta });
    return;
  }

  // Single-key shortcuts for line properties
  switch (key) {
    case "b":
      Network.emitLineUpdate({
        id: selId,
        type: line.type === "bouncy" ? "none" : "bouncy",
      });
      break;
    case "d":
      Network.emitLineUpdate({
        id: selId,
        type: line.type === "death" ? "none" : "death",
      });
      break;
    case "n":
      Network.emitLineUpdate({ id: selId, type: "none" });
      break;
    case "x":
    case "delete":
      handleDeleteLine();
      break;
  }
}

// Nudge handlers (Arrow keys without modifiers)
const nudgeState = { keys: new Set(), repeatTimer: null };
function handleNudge() {
  if (nudgeState.keys.size === 0) return;
  const selId = State.get("selectedLineId");
  if (!selId) return;

  const payload = { id: selId, nudge: {} };
  if (nudgeState.keys.has("ArrowUp")) payload.nudge.y = -1;
  if (nudgeState.keys.has("ArrowDown")) payload.nudge.y = 1;
  if (nudgeState.keys.has("ArrowLeft")) payload.nudge.x = -1;
  if (nudgeState.keys.has("ArrowRight")) payload.nudge.x = 1;

  Network.emitLineUpdate(payload);
}

export function handleArrowKeyDown(ev) {
  if (document.activeElement === UI.elems.chatInput) return;
  const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!arrows.includes(ev.key) || ev.altKey || ev.shiftKey || ev.ctrlKey)
    return;

  ev.preventDefault();
  if (nudgeState.keys.has(ev.key)) return; // Already handling this key

  nudgeState.keys.add(ev.key);
  handleNudge(); // Nudge once immediately

  // Start repeating if key is held
  clearTimeout(nudgeState.repeatTimer);
  nudgeState.repeatTimer = setTimeout(() => {
    nudgeState.repeatTimer = setInterval(handleNudge, 50); // Repeat every 50ms
  }, 200); // after an initial 200ms delay
}

export function handleArrowKeyUp(ev) {
  const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!arrows.includes(ev.key)) return;

  ev.preventDefault();
  nudgeState.keys.delete(ev.key);

  if (nudgeState.keys.size === 0) {
    clearTimeout(nudgeState.repeatTimer);
    clearInterval(nudgeState.repeatTimer);
    nudgeState.repeatTimer = null;
  }
}

// ---- Bind All UI Events ----

let areEventsBound = false;
export function bindUIEvents() {
  if (areEventsBound) return;
  const e = UI.elems;

  // Lobby
  e.joinBtn.addEventListener("click", handleJoin);
  e.usernameInput.addEventListener("keydown", handleEnterKey(handleJoin));
  e.readyCheckbox.addEventListener("change", handleReadyToggle);
  e.voteCheckbox.addEventListener("change", handleVoteToggle);

  // Chat
  e.chatSendBtn.addEventListener("click", handleSendChat);
  e.chatInput.addEventListener("keydown", handleEnterKey(handleSendChat));

  // Canvas
  e.canvas.addEventListener("mousedown", handleCanvasDown);
  e.canvas.addEventListener("mousemove", handleCanvasMove);
  e.canvas.addEventListener("mouseup", handleCanvasUp);
  e.canvas.addEventListener("mouseleave", handleCanvasUp); // Treat leaving as mouse up

  // Line Property Panel
  e.deleteLineBtn.addEventListener("click", handleDeleteLine);
  e.lineTypeSelect.addEventListener("change", handleLineTypeChange);
  e.toFrontBtn.addEventListener("click", () =>
    Network.reorderLine({ id: State.get("selectedLineId"), toBack: false }),
  );
  e.toBackBtn.addEventListener("click", () =>
    Network.reorderLine({ id: State.get("selectedLineId"), toBack: true }),
  );

  // Sliders for line properties
  const createSliderHandler = (propName) => (ev) => {
    const id = State.get("selectedLineId");
    if (!id) return;
    const value = Number(ev.target.value);
    const payload = { id, [propName]: value };
    if (propName === "angle") payload[propName] = normalizeAngle(value);

    // Update UI value label immediately
    const valueElem = UI.elems[`${propName}Value`];
    if (valueElem) valueElem.innerText = String(payload[propName]);

    Network.emitLineUpdate(payload);
  };
  e.lineWidthSlider.addEventListener("input", createSliderHandler("width"));
  e.lineHeightSlider.addEventListener("input", createSliderHandler("height"));
  e.lineAngleSlider.addEventListener("input", createSliderHandler("angle"));

  // Global Settings & Buttons
  e.hideUsernamesCheckbox.addEventListener("change", handleHideUsernamesToggle);
  e.copyMapBtn.addEventListener("click", () =>
    copyLineInfo(State.get("lines")),
  );
  e.popupCloseBtn.addEventListener("click", () => UI.hide("gameEndPopup"));
  e.spawnSizeSlider.addEventListener("input", handleSpawnSliderInput);

  // Global Keyboard Listeners
  window.addEventListener("keydown", handleKeyCommands);
  window.addEventListener("keydown", handleArrowKeyDown);
  window.addEventListener("keyup", handleArrowKeyUp);

  // Focus chat on Enter key
  window.addEventListener("keydown", (ev) => {
    if (
      ev.key === "Enter" &&
      document.activeElement !== e.chatInput &&
      State.get("gameActive")
    ) {
      ev.preventDefault();
      e.chatInput.focus();
    }
  });

  areEventsBound = true;
}
