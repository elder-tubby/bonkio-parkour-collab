// handlers.js — cleaned and reorganized
import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import Canvas from "./canvas.js";
import { copyLineInfo } from "./exportLines.js";
import {
  getHitLineId,
  updateLineTypeUI,
  handleUndoLastLine,
  getSpawnDiameter,
} from "./utils-client.js";
import {
  emitSpawnCircleMove,
  emitCapZoneMove,
  emitSpawnSizeChange,
  moveLine as networkMoveLine,
} from "./network.js";

const pendingSends = new Map(); // lineId -> timeoutId
const pendingProps = new Map(); // lineId -> { width?, height?, angle? }
let lastSelectedLineId = null;
const PROP_DEBOUNCE_MS = 150;

function scheduleSendProps(lineId, props) {
  if (!lineId) return;
  const existing = pendingProps.get(lineId) || {};
  pendingProps.set(lineId, { ...existing, ...props });

  const t = pendingSends.get(lineId);
  if (t) clearTimeout(t);

  const to = setTimeout(() => {
    sendPendingProps(lineId);
  }, PROP_DEBOUNCE_MS);

  pendingSends.set(lineId, to);
}

function sendPendingProps(lineId) {
  const props = pendingProps.get(lineId);
  if (!props) return;
  pendingProps.delete(lineId);

  const to = pendingSends.get(lineId);
  if (to) {
    clearTimeout(to);
    pendingSends.delete(lineId);
  }

  // send to server (Network.changeLineProps expects id + props)
  Network.changeLineProps({ id: lineId, ...props });
}

// Flush pending sends for a given id (called on deselect etc.)
function flushPendingProps(lineId) {
  if (!lineId) return;
  if (pendingSends.has(lineId) || pendingProps.has(lineId)) {
    sendPendingProps(lineId);
  }
}

// Watch selection changes to flush pending sends when a line is deselected
State.onChange((key, val) => {
  if (key !== "selectedLineId") return;
  const newSelected = val;
  const prev = lastSelectedLineId;
  if (prev && prev !== newSelected) {
    // selected changed — flush pending props for the old one immediately
    flushPendingProps(prev);
  }
  lastSelectedLineId = newSelected;
});

/**
 * High-level handlers exported for use elsewhere
 * - keep signatures stable so other modules still call the same names
 */

// ---- Simple UI handlers ----
export function handleJoin() {
  const name = UI.elems.usernameInput.value.trim();
  if (!name) return alert("Enter a username.");
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
  Network.changeLineType({ id, type });
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
    if (ev.key === "Enter") onSubmit();
  };
}

export function handleHideUsernamesToggle(ev) {
  State.set("hideUsernames", ev.target.checked);
  Canvas.draw();
}

export function handleDeleteLine() {
  const id = State.get("selectedLineId");
  if (!id) return;
  Network.deleteLine(id);
}

// ---- Spawn slider handler (single implementation) ----
export function handleSpawnSliderInput(ev) {
  const size = Number(ev.target.value);
  State.set("mapSize", size);

  if (UI.elems.spawnSizeValue) UI.elems.spawnSizeValue.innerText = String(size);

  const spawn = State.get("spawnCircle") || {
    x: 0,
    y: 0,
    diameter: getSpawnDiameter(),
  };
  State.set("spawnCircle", { ...spawn, diameter: getSpawnDiameter() });

  Canvas.draw();

  // notify server
  emitSpawnSizeChange(size);
}

// ---- Canvas & drag-related handlers ----

/*
State usage:
- "startPt" : when user starts drawing a NEW line
- "currentLine": preview while drawing
- "draggingLine": { id, mouseStart, origStart, origEnd } while dragging an existing line
- spawnCircle.dragging / capZone.dragging booleans are stored on their objects
*/

function pointFromEventOnCanvas(evt) {
  const canvas = UI.elems.canvas;
  const rect = canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

// helper math
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function degToRad(d) {
  return (d * Math.PI) / 180;
}
function radToDeg(r) {
  return (r * 180) / Math.PI;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function computeAngleDeg(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
function endpointFromStartAngleWidth(start, angleDeg, width) {
  const r = degToRad(angleDeg);
  return { x: start.x + Math.cos(r) * width, y: start.y + Math.sin(r) * width };
}

// Called when user presses mouse on canvas. Will either start drawing, start dragging a line,
// or begin dragging spawn/cap zone depending on hit-test.
export function handleCanvasDown(evt) {
  const pt = pointFromEventOnCanvas(evt);

  // cap zone hit?
  const capZone = State.get("capZone") || { x: 0, y: 0, width: 0, height: 0 };
  if (
    pt.x >= capZone.x &&
    pt.x <= capZone.x + capZone.width &&
    pt.y >= capZone.y &&
    pt.y <= capZone.y + capZone.height
  ) {
    State.set("capZone", { ...capZone, dragging: true });
    return;
  }

  // spawn circle hit?
  const spawn = State.get("spawnCircle") || { x: 0, y: 0, diameter: 0 };
  const dist = Math.hypot(pt.x - spawn.x, pt.y - spawn.y);
  if (dist <= (spawn.diameter || 0) / 2) {
    State.set("spawnCircle", { ...spawn, dragging: true });
    return;
  }

  // check for a hit on a line (uses utils-client.getHitLineId which allows orphan selection)
  const hitId = getHitLineId(pt);
  if (hitId) {
    State.set("selectedLineId", hitId);

    // prepare dragging state for that line
    const line = State.get("lines").find((l) => l.id === hitId);
    if (!line) return; // defensive
    State.set("draggingLine", {
      id: hitId,
      mouseStart: pt,
      origStart: { ...line.start },
      origEnd: { ...line.end },
    });

    // add global handlers to continue drag even if cursor leaves canvas
    window.addEventListener("mousemove", handleCanvasMoveDuringDrag);
    window.addEventListener("mouseup", handleCanvasDragEnd);

    Canvas.draw();
    return;
  }

  // otherwise start a new draw
  State.set("selectedLineId", null);
  State.set("startPt", pt);
  State.set("currentLine", null);
  // remember down time so a quick click doesn't create a tiny line
  State.set("mouseDownTime", Date.now());
  Canvas.draw();
}

// Called while mouse moves over canvas (centralized, shared)
export function handleCanvasMove(evt) {
  const pt = pointFromEventOnCanvas(evt);
  State.set("mouse", pt);

  // spawn dragging
  const spawn = State.get("spawnCircle") || { x: 0, y: 0, diameter: 0 };
  if (spawn.dragging) {
    State.set("spawnCircle", { ...spawn, x: pt.x, y: pt.y });
    Canvas.draw();
    return;
  }

  // cap zone dragging
  const capZone = State.get("capZone") || { x: 0, y: 0, width: 0, height: 0 };
  if (capZone.dragging) {
    State.set("capZone", {
      ...capZone,
      x: pt.x - capZone.width / 2,
      y: pt.y - capZone.height / 2,
    });
    Canvas.draw();
    return;
  }

  // drawing preview if startPt exists
  const start = State.get("startPt");
  if (start) {
    State.set("currentLine", { start, end: pt });
    Canvas.draw();
    return;
  }

  // if dragging an existing line, the global mousemove will handle it (see handleCanvasMoveDuringDrag)
}

// Called on canvas mouseup (finalize drawing OR finalize spawn/cap dragging)
export function handleCanvasUp(evt) {
  const pt = pointFromEventOnCanvas(evt);

  // finish spawn drag
  const spawn = State.get("spawnCircle");
  if (spawn && spawn.dragging) {
    State.set("spawnCircle", { ...spawn, dragging: false });
    emitSpawnCircleMove(spawn.x, spawn.y);
    return;
  }

  // finish cap zone drag
  const capZone = State.get("capZone");
  if (capZone && capZone.dragging) {
    State.set("capZone", { ...capZone, dragging: false });
    emitCapZoneMove(capZone.x, capZone.y);
    return;
  }

  // if user was drawing a new line, finalize it
  const start = State.get("startPt");
  if (!start) {
    // not drawing; maybe release after a drag handled by global handler
    return;
  }

  // prevent accidental tiny lines on quick clicks:
  const downTime = State.get("mouseDownTime") || 0;
  const CLICK_THRESHOLD_MS = 180;
  const now = Date.now();
  const dt = now - downTime;
  // clear preview and decide if it was a significant drag
  State.set("currentLine", null);

  // if it was a very quick click, treat as deselect rather than creating a tiny line
  if (dt < CLICK_THRESHOLD_MS) {
    State.set("startPt", null);
    return;
  }

  const dx = pt.x - start.x;
  const dy = pt.y - start.y;
  const distSq = dx * dx + dy * dy;
  const MIN_DIST_SQ = 25; // squared distance threshold (5px)
  if (distSq < MIN_DIST_SQ) {
    State.set("startPt", null);
    return;
  }

  const username = State.get("username");
  Network.drawLine({ start, end: pt, username });
  State.set("startPt", null);
}

// global drag handlers for moving an existing selected line
export function handleCanvasMoveDuringDrag(evt) {
  const dragging = State.get("draggingLine");
  if (!dragging) return;

  const canvas = UI.elems.canvas;
  const rect = canvas.getBoundingClientRect();
  const cur = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  const dx = cur.x - dragging.mouseStart.x;
  const dy = cur.y - dragging.mouseStart.y;

  const updated = State.get("lines").map((l) => {
    if (l.id !== dragging.id) return l;
    const newStart = {
      x: dragging.origStart.x + dx,
      y: dragging.origStart.y + dy,
    };
    const newEnd = { x: dragging.origEnd.x + dx, y: dragging.origEnd.y + dy };
    // recompute width & angle to match new endpoints
    const newWidth = distance(newStart, newEnd);
    const newAngle = computeAngleDeg(newStart, newEnd);
    return {
      ...l,
      start: newStart,
      end: newEnd,
      width: newWidth,
      angle: newAngle,
    };
  });

  State.set("lines", updated);
  Canvas.draw();
}

export function handleCanvasDragEnd(evt) {
  const dragging = State.get("draggingLine");
  if (!dragging) return;

  // remove globals
  window.removeEventListener("mousemove", handleCanvasMoveDuringDrag);
  window.removeEventListener("mouseup", handleCanvasDragEnd);

  // send final move to server
  const line = State.get("lines").find((l) => l.id === dragging.id);
  if (line) {
    networkMoveLine({ id: line.id, start: line.start, end: line.end });
  }

  State.set("draggingLine", null);
  Canvas.draw();
}

export function handleKeyCommands(ev) {
  const chatInput = UI.elems.chatInput;
  if (document.activeElement === chatInput) return;

  const key = ev.key;
  const lower = key.toLowerCase();

  if (lower === "h") {
    const current = State.get("hideUsernames");
    State.set("hideUsernames", !current);
    if (UI.elems.hideUsernamesCheckbox)
      UI.elems.hideUsernamesCheckbox.checked = !current;
    Canvas.draw();
    return;
  }

  const isCtrlZ = ev.ctrlKey && (key === "z" || key === "Z");
  if (isCtrlZ) {
    ev.preventDefault();
    handleUndoLastLine();
    return;
  }

  if (lower === "c") {
    copyLineInfo(State.get("lines"));
    return;
  }

  // modifiers-based adjustments (only when a line is selected)
  const sel = State.get("selectedLineId");
  if (sel) {
    // CTRL + Left/Right => width
    if (ev.ctrlKey && (key === "ArrowLeft" || key === "ArrowRight")) {
      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1;
      const delta = key === "ArrowLeft" ? -step : step;
      modifySelectedLineWidth(delta);
      return;
    }

    // CTRL + Up/Down => height (this addresses your bug)
    if (ev.ctrlKey && (key === "ArrowUp" || key === "ArrowDown")) {
      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1;
      const delta = key === "ArrowUp" ? step : -step;
      modifySelectedLineHeight(delta);
      return;
    }

    // SHIFT + Left/Right => angle
    if (ev.shiftKey && (key === "ArrowLeft" || key === "ArrowRight")) {
      ev.preventDefault();
      const step = ev.ctrlKey ? 10 : 1;
      const delta = key === "ArrowLeft" ? -step : step;
      modifySelectedLineAngle(delta);
      return;
    }
  }

  // line letter shortcuts (if selected)
  const lineId = State.get("selectedLineId");
  if (!lineId) return;

  switch (lower) {
    case "b":
      Network.changeLineType({ id: lineId, type: "bouncy" });
      updateLineTypeUI("bouncy");
      UI.elems.lineTypeSelect.value = "bouncy";
      break;
    case "d":
      Network.changeLineType({ id: lineId, type: "death" });
      updateLineTypeUI("death");
      UI.elems.lineTypeSelect.value = "death";
      break;
    case "n":
      Network.changeLineType({ id: lineId, type: "none" });
      updateLineTypeUI("none");
      UI.elems.lineTypeSelect.value = "none";
      break;
    case "x":
      handleDeleteLine();
      break;
    default:
      return;
  }

  Canvas.draw();
}

// Arrow-key nudges for selected line (bind to window keydown separately)
export function handleArrowNudge(ev) {
  const sel = State.get("selectedLineId");
  if (!sel) return;

  // only respond to arrow keys
  const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!arrows.includes(ev.key)) return;

  // If ctrl or shift are used we handle those combos in handleKeyCommands
  if (ev.ctrlKey || ev.shiftKey) return;

  ev.preventDefault();
  const step = ev.shiftKey ? 5 : 1;
  let dx = 0,
    dy = 0;
  if (ev.key === "ArrowLeft") dx = -step;
  if (ev.key === "ArrowRight") dx = step;
  if (ev.key === "ArrowUp") dy = -step;
  if (ev.key === "ArrowDown") dy = step;

  const updated = State.get("lines").map((l) => {
    if (l.id !== sel) return l;
    return {
      ...l,
      start: { x: l.start.x + dx, y: l.start.y + dy },
      end: { x: l.end.x + dx, y: l.end.y + dy },
    };
  });

  State.set("lines", updated);
  Canvas.draw();
  const line = updated.find((l) => l.id === sel);
  if (line) scheduleMoveLine(sel, line.start, line.end);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function halfVectorFromAngleWidth(angleDeg, width) {
  const r = degToRad(angleDeg);
  return { x: Math.cos(r) * (width / 2), y: Math.sin(r) * (width / 2) };
}

function modifySelectedLineWidth(delta) {
  const sel = State.get("selectedLineId");
  if (!sel) return;
  const lines = State.get("lines").map((l) => {
    if (l.id !== sel) return l;
    const curWidth =
      typeof l.width === "number" ? l.width : distance(l.start, l.end);
    const newWidth = clamp(curWidth + delta, 1, 1000);
    // compute center and derive new endpoints so the line grows/shrinks symmetrically
    const center = midpoint(l.start, l.end);
    const a =
      typeof l.angle === "number" ? l.angle : computeAngleDeg(l.start, l.end);
    const hv = halfVectorFromAngleWidth(a, newWidth);
    const newStart = { x: center.x - hv.x, y: center.y - hv.y };
    const newEnd = { x: center.x + hv.x, y: center.y + hv.y };
    return { ...l, width: newWidth, start: newStart, end: newEnd };
  });
  State.set("lines", lines);
  Canvas.draw();
  const line = lines.find((l) => l.id === sel);
  if (line) {
    // schedule send (debounced)
    scheduleSendProps(sel, { width: line.width });
  }
  UI.updateLineEditorValues(line);
}

function modifySelectedLineHeight(delta) {
  const sel = State.get("selectedLineId");
  if (!sel) return;
  const updated = State.get("lines").map((l) => {
    if (l.id !== sel) return l;
    const cur = typeof l.height === "number" ? l.height : 4;
    const next = Math.max(1, Math.min(1000, cur + delta));
    return { ...l, height: next };
  });
  State.set("lines", updated);
  Canvas.draw();

  const line = updated.find((l) => l.id === sel);
  if (line) {
    // schedule debounced send (you should have scheduleSendProps in this file from prior snippet)
    scheduleSendProps(sel, { height: line.height });
    UI.updateLineEditorValues(line);
  }
}

function modifySelectedLineAngle(delta) {
  const sel = State.get("selectedLineId");
  if (!sel) return;
  const lines = State.get("lines").map((l) => {
    if (l.id !== sel) return l;
    const curAngle =
      typeof l.angle === "number" ? l.angle : computeAngleDeg(l.start, l.end);
    let newAngle = (curAngle + delta) % 360;
    if (newAngle < 0) newAngle += 360;
    // rotate around center
    const center = midpoint(l.start, l.end);
    const w = typeof l.width === "number" ? l.width : distance(l.start, l.end);
    const hv = halfVectorFromAngleWidth(newAngle, w);
    const newStart = { x: center.x - hv.x, y: center.y - hv.y };
    const newEnd = { x: center.x + hv.x, y: center.y + hv.y };
    return { ...l, angle: newAngle, start: newStart, end: newEnd };
  });
  State.set("lines", lines);
  Canvas.draw();
  const line = lines.find((l) => l.id === sel);
  if (line) scheduleSendProps(sel, { angle: line.angle });
  UI.updateLineEditorValues(line);
}

const moveTimeouts = new Map();
function scheduleMoveLine(id, start, end, delay = 80) {
  if (moveTimeouts.has(id)) clearTimeout(moveTimeouts.get(id));
  const t = setTimeout(() => {
    Network.moveLine({ id, start, end });
    moveTimeouts.delete(id);
  }, delay);
  moveTimeouts.set(id, t);
}

// ---- UI binding: attach DOM listeners here (keeps all listeners in one place) ----
export function bindUIEvents() {
  const e = UI.elems;

  // basic controls
  e.joinBtn.addEventListener("click", handleJoin);
  e.usernameInput.addEventListener("keydown", handleEnterKey(handleJoin));
  e.readyCheckbox.addEventListener("change", handleReadyToggle);
  e.voteCheckbox.addEventListener("change", handleVoteToggle);
  e.hideUsernamesCheckbox.addEventListener("change", handleHideUsernamesToggle);
  e.deleteLineBtn.addEventListener("click", handleDeleteLine);
  e.lineTypeSelect.addEventListener("change", handleLineTypeChange);
  e.chatSendBtn.addEventListener("click", handleSendChat);
  e.chatInput.addEventListener("keydown", handleEnterKey(handleSendChat));

  if (e.copyLineInfoBtn) {
    e.copyLineInfoBtn.addEventListener("click", () =>
      copyLineInfo(State.get("lines")),
    );
  }
  const copyMapBtn = document.querySelector("#copyMapBtn");
  if (copyMapBtn)
    copyMapBtn.addEventListener("click", () =>
      copyLineInfo(State.get("lines")),
    );
  if (e.popupCloseBtn)
    e.popupCloseBtn.addEventListener("click", () => UI.hide("gameEndPopup"));

  // spawn slider
  if (e.spawnSizeSlider) {
    // initialize slider with current mapSize
    const mapSize = State.get("mapSize") ?? 9;
    e.spawnSizeSlider.value = String(mapSize);
    if (e.spawnSizeValue) e.spawnSizeValue.innerText = String(mapSize);

    e.spawnSizeSlider.addEventListener("input", handleSpawnSliderInput);
  }

  // line editor sliders — listen for changes if present
  // width
  if (e.lineWidthSlider) {
    e.lineWidthSlider.addEventListener("input", () => {
      const sel = State.get("selectedLineId");
      if (!sel) return;
      const val = Number(e.lineWidthSlider.value);
      const lines = State.get("lines").map((l) => {
        if (l.id !== sel) return l;
        // keep center-based growth
        const center = {
          x: (l.start.x + l.end.x) / 2,
          y: (l.start.y + l.end.y) / 2,
        };
        const angle =
          typeof l.angle === "number"
            ? l.angle
            : (Math.atan2(l.end.y - l.start.y, l.end.x - l.start.x) * 180) /
              Math.PI;
        const r = (angle * Math.PI) / 180;
        const halfX = Math.cos(r) * (val / 2);
        const halfY = Math.sin(r) * (val / 2);
        return {
          ...l,
          width: val,
          start: { x: center.x - halfX, y: center.y - halfY },
          end: { x: center.x + halfX, y: center.y + halfY },
        };
      });
      State.set("lines", lines);
      Canvas.draw();
      // update numeric display
      if (e.lineWidthValue) e.lineWidthValue.innerText = String(val);
      // send to server (debounced preferred, but immediate for reliability)
      Network.changeLineProps({ id: sel, width: val });
    });
  }

  // height
  if (e.lineHeightSlider) {
    e.lineHeightSlider.addEventListener("input", () => {
      const sel = State.get("selectedLineId");
      if (!sel) return;
      const val = Number(e.lineHeightSlider.value);
      const lines = State.get("lines").map((l) =>
        l.id !== sel ? l : { ...l, height: val },
      );
      State.set("lines", lines);
      Canvas.draw();
      if (e.lineHeightValue) e.lineHeightValue.innerText = String(val);
      Network.changeLineProps({ id: sel, height: val });
    });
  }

  // angle
  if (e.lineAngleSlider) {
    e.lineAngleSlider.addEventListener("input", () => {
      const sel = State.get("selectedLineId");
      if (!sel) return;
      const val = Number(e.lineAngleSlider.value);
      const lines = State.get("lines").map((l) => {
        if (l.id !== sel) return l;
        const center = {
          x: (l.start.x + l.end.x) / 2,
          y: (l.start.y + l.end.y) / 2,
        };
        const r = (val * Math.PI) / 180;
        const halfX =
          Math.cos(r) *
          ((l.width || Math.hypot(l.end.x - l.start.x, l.end.y - l.start.y)) /
            2);
        const halfY =
          Math.sin(r) *
          ((l.width || Math.hypot(l.end.x - l.start.x, l.end.y - l.start.y)) /
            2);
        return {
          ...l,
          angle: val,
          start: { x: center.x - halfX, y: center.y - halfY },
          end: { x: center.x + halfX, y: center.y + halfY },
        };
      });
      State.set("lines", lines);
      Canvas.draw();
      if (e.lineAngleValue) e.lineAngleValue.innerText = String(val);
      Network.changeLineProps({ id: sel, angle: val });
    });
  }

  // canvas mouse events (use centralized handlers)
  e.canvas.addEventListener("mousedown", handleCanvasDown);
  e.canvas.addEventListener("mousemove", handleCanvasMove);
  e.canvas.addEventListener("mouseup", handleCanvasUp);

  // keyboard: global hotkeys (but ignore when chat focused)
  window.addEventListener("keydown", (ev) => {
    // quick chat focus behaviour
    const chatInput = UI.elems.chatInput;
    if (
      ev.key === "Enter" &&
      document.activeElement !== chatInput &&
      State.get("gameActive")
    ) {
      ev.preventDefault();
      chatInput.focus();
      return;
    }

    // don't run hotkeys if chat is focused
    if (document.activeElement === chatInput) return;

    // run general hotkeys and line commands
    handleKeyCommands(ev);

    // also treat arrow nudges separately (so they don't get swallowed by other handlers)
    handleArrowNudge(ev);
  });
}
