// handlers.js
import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import Canvas from "./canvas.js"; // ← add this
import { copyLineInfo } from "./exportLines.js"; // <-- ensure this path is correct
import { getHitLineId } from "./utils-client.js";
import { updateLineTypeUI } from "./utils-client.js";


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

export function bindUIEvents() {
  const e = UI.elems;
  e.joinBtn.addEventListener("click", handleJoin);
  e.usernameInput.addEventListener("keydown", handleEnterKey(handleJoin));
  e.readyCheckbox.addEventListener("change", handleReadyToggle);
  e.voteCheckbox.addEventListener("change", handleVoteToggle);
  e.canvas.addEventListener("mousedown", handleCanvasDown);
  e.canvas.addEventListener("mouseup", handleCanvasUp);
  e.deleteLineBtn.addEventListener("click", handleDeleteLine);
  e.lineTypeSelect.addEventListener("change", handleLineTypeChange);
  e.chatSendBtn.addEventListener("click", handleSendChat);
  e.chatInput.addEventListener("keydown", handleEnterKey(handleSendChat));
  if (e.copyLineInfoBtn) {
    e.copyLineInfoBtn.addEventListener("click", () =>
      copyLineInfo(State.get("lines"), e.canvas.width, e.canvas.height),
    );
  }
  if (e.popupCloseBtn) {
    e.popupCloseBtn.addEventListener("click", () => UI.hide("gameEndPopup"));
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.key.toLowerCase() === "s") {
      if (!State.get("isHoldingS")) {
        State.set("isHoldingS", true);
        Canvas.draw(); // redraw immediately
      }
    }
  });

  document.addEventListener("keyup", (ev) => {
    if (ev.key.toLowerCase() === "s") {
      if (State.get("isHoldingS")) {
        State.set("isHoldingS", false);
        Canvas.draw(); // redraw immediately
      }
    }
  });

  // Track mouse position on canvas
  UI.elems.canvas.addEventListener("mousemove", (ev) => {
    const rect = UI.elems.canvas.getBoundingClientRect();
    const mouse = {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    };
    State.set("mouse", mouse);

    if (State.get("isHoldingS")) {
      Canvas.draw(); // trigger redraw with updated pointer
    }
  });

  document.addEventListener("keydown", handleKeyCommands);


}

export function handleKeyCommands(ev) {
  // only act if we have a selected line
  const lineId = State.get("selectedLineId");
  if (!lineId) return;

  const key = ev.key.toLowerCase();
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
