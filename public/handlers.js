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

  // clear preview and decide if it was a significant drag
  State.set("currentLine", null);
  const dx = pt.x - start.x;
  const dy = pt.y - start.y;
  const distSq = dx * dx + dy * dy;
  const MIN_DIST = 25; // minimum squared distance to treat as a line

  if (distSq < MIN_DIST) {
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
    return {
      ...l,
      start: { x: dragging.origStart.x + dx, y: dragging.origStart.y + dy },
      end: { x: dragging.origEnd.x + dx, y: dragging.origEnd.y + dy },
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

// ---- Keyboard behavior / hotkeys ----
export function handleKeyCommands(ev) {
  // ignore if chat input focused
  const chatInput = UI.elems.chatInput;
  if (document.activeElement === chatInput) return;

  // global hotkeys
  const key = ev.key.toLowerCase();

  if (key === "h") {
    const current = State.get("hideUsernames");
    State.set("hideUsernames", !current);
    if (UI.elems.hideUsernamesCheckbox)
      UI.elems.hideUsernamesCheckbox.checked = !current;
    Canvas.draw();
    return;
  }

  const isCtrlZ = ev.ctrlKey && (ev.key === "z" || ev.key === "Z");
  if (isCtrlZ) {
    ev.preventDefault();
    handleUndoLastLine();
    return;
  }

  if (key === "c") {
    copyLineInfo(State.get("lines"));
    return;
  }

  // line-specific hotkeys only if there's a selection
  const lineId = State.get("selectedLineId");
  if (!lineId) {
    // also allow Enter focusing chat when in-game (handled elsewhere)
    return;
  }

  switch (key) {
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
  if (line) networkMoveLine({ id: sel, start: line.start, end: line.end });
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
