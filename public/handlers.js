// handlers.js
import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import Canvas from "./canvas.js"; // ← add this
import { copyLineInfo } from "./exportLines.js"; // <-- ensure this path is correct
import { getHitLineId } from "./utils-client.js";
import { updateLineTypeUI } from "./utils-client.js";
import { handleUndoLastLine } from "./utils-client.js";
import { emitSpawnCircleMove } from "./network.js";
import { emitCapZoneMove } from "./network.js";

export function handleJoin() {
  const name = UI.elems.usernameInput.value.trim();
  if (!name) {
    return alert("Enter a username.");
  }

  // store in state for later use
  State.set("username", name);
  Network.joinLobby(name);
}

export function handleReadyToggle(ev) {
  Network.setReady(ev.target.checked);
}

export function handleVoteToggle(ev) {
  Network.voteFinish(ev.target.checked);
}

export function handleCanvasDown(evt) {
  const canvas = UI.elems.canvas;
  const rect = canvas.getBoundingClientRect();
  const clickPt = {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };

  // 1) If we hit one of our own lines, select it and DON'T start a draw
  const hitId = getHitLineId(clickPt);
  if (hitId) {
    State.set("selectedLineId", hitId);
    Canvas.draw(); // redraw so the highlight shows immediately
    return; // <<— bail out of drawing
  }

  // 2) Otherwise, clear selection and start a new line as before
  State.set("selectedLineId", null);
  State.set("startPt", clickPt);
}

export function handleCanvasUp(evt) {
  const start = State.get("startPt");
  if (!start) return;
  const rect = evt.target.getBoundingClientRect();
  const end = {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };

  // if the user didn’t actually drag (just clicked),
  // distance squared below threshold → ignore
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distSq = dx * dx + dy * dy;
  const MIN_DIST = 25; // 5px drag yields 25px²; tweak as you like
  if (distSq < MIN_DIST) {
    // treat it as a “no‑op” — no new line
    State.set("startPt", null);
    return;
  }

  // pull the username we stored earlier
  const username = State.get("username");
  Network.drawLine({ start, end, username });
  State.set("startPt", null);
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
  Canvas.draw(); // redraw immediately with or without usernames
}

export function bindUIEvents() {
  const e = UI.elems;
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

  // Copy Map Data button
  const copyMapBtn = document.querySelector("#copyMapBtn");
  if (copyMapBtn) {
    copyMapBtn.addEventListener("click", () =>
      copyLineInfo(State.get("lines")),
    );
  }
  if (e.popupCloseBtn) {
    e.popupCloseBtn.addEventListener("click", () => UI.hide("gameEndPopup"));
  }

  let draggingCapZone = false;
  let draggingSpawn = false;

  e.canvas.addEventListener("mousedown", (ev) => {
    const rect = e.canvas.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const mouseY = ev.clientY - rect.top;

    const capZone = State.get("capZone");
    if (
      mouseX >= capZone.x &&
      mouseX <= capZone.x + capZone.width &&
      mouseY >= capZone.y &&
      mouseY <= capZone.y + capZone.height
    ) {
      draggingCapZone = true;
      State.set("capZone", { ...capZone, dragging: true });
      return;
    }
    const spawn = State.get("spawnCircle");
    const dist = Math.hypot(mouseX - spawn.x, mouseY - spawn.y);

    if (dist <= spawn.diameter / 2) {
      draggingSpawn = true;
      State.set("spawnCircle", { ...spawn, dragging: true });
      return; // prevent line selection
    }

    // Only call normal line handling if not on spawn circle
    handleCanvasDown(ev);
  });

  e.canvas.addEventListener("mousemove", (ev) => {
    const rect = e.canvas.getBoundingClientRect();
    const mouse = {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    };
    State.set("mouse", mouse);

    if (draggingCapZone) {
      const capZone = State.get("capZone");
      State.set("capZone", {
        ...capZone,
        x: mouse.x - capZone.width / 2,
        y: mouse.y - capZone.height / 2,
      });
      Canvas.draw();
    }

    if (draggingSpawn) {
      const spawn = State.get("spawnCircle");
      State.set("spawnCircle", { ...spawn, x: mouse.x, y: mouse.y });
      Canvas.draw();
    }
  });

  e.canvas.addEventListener("mouseup", (ev) => {
    if (draggingSpawn) {
      draggingSpawn = false;
      const spawn = State.get("spawnCircle");
      State.set("spawnCircle", { ...spawn, dragging: false });
      emitSpawnCircleMove(spawn.x, spawn.y);
      return; // prevent new line creation
    }

    if (draggingCapZone) {
      draggingCapZone = false;
      const capZone = State.get("capZone");
      State.set("capZone", { ...capZone, dragging: false });
      emitCapZoneMove(capZone.x, capZone.y);
      return;
    }

    handleCanvasUp(ev);
  });
  // === end spawn circle drag logic ===

  document.addEventListener("keydown", handleKeyCommands);
}

export function handleKeyCommands(ev) {
  const key = ev.key.toLowerCase();

  // Global hotkeys (not dependent on a selected line)
  if (key === "h") {
    const current = State.get("hideUsernames");
    State.set("hideUsernames", !current);
    UI.elems.hideUsernamesCheckbox.checked = !current;
    Canvas.draw();
    return; // stop here so 'h' doesn't get processed below
  }

  const isCtrlZ = ev.ctrlKey && (ev.key === "z" || ev.key === "Z");

  if (isCtrlZ) {
    ev.preventDefault(); // prevent browser undo
    handleUndoLastLine();
    return;
  }

  if (key === "c") {
    copyLineInfo(State.get("lines"));
    return;
  }
  // only act if we have a selected line
  const lineId = State.get("selectedLineId");
  if (!lineId) return;

  switch (key) {
    case "b":
      // toggle to bouncy
      Network.changeLineType({ id: lineId, type: "bouncy" });
      updateLineTypeUI("bouncy");
      UI.elems.lineTypeSelect.value = "bouncy";
      break;

    case "d":
      // toggle to death
      Network.changeLineType({ id: lineId, type: "death" });
      updateLineTypeUI("death");
      UI.elems.lineTypeSelect.value = "death";

      break;

    case "n":
      // toggle to none
      Network.changeLineType({ id: lineId, type: "none" });
      updateLineTypeUI("none");
      UI.elems.lineTypeSelect.value = "none";

      break;

    case "x":
      // delete
      handleDeleteLine();
      break;

    default:
      return;
  }

  // re‐draw immediately so you see the change
  Canvas.draw();
}

export function handleDeleteLine() {
  const id = State.get("selectedLineId");
  if (!id) return;
  Network.deleteLine(id);
}
