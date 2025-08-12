// utils-client.js

import State from "./state.js";
import * as Network from "./network.js";

export function getHitLineId(pt) {
  const lines = State.get("lines");
  for (const { id, start, end, playerId } of lines) {
    if (playerId !== State.get("playerId")) continue;
    const dx = end.x - start.x,
      dy = end.y - start.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((pt.x - start.x) * dx + (pt.y - start.y) * dy) / (dx * dx + dy * dy),
      ),
    );
    const proj = { x: start.x + t * dx, y: start.y + t * dy };
    if (Math.hypot(pt.x - proj.x, pt.y - proj.y) < 6) {
      return id;
    }
  }
  return null;
}

export function updateLineTypeUI(type) {
  const select = document.getElementById("lineTypeSelect");

  if (!select) return;

  switch (type) {
    case "bouncy":
      select.style.backgroundColor = "#888"; // gray
      select.style.color = "#000"; // black text for contrast
      break;
    case "death":
      select.style.backgroundColor = "#e53935"; // vivid red
      select.style.color = "#000"; // black text for contrast
      break;
    case "none":
    default:
      select.style.backgroundColor = "#fff"; // white
      select.style.color = "#000"; // black text
      break;
  }
}

export function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "1rem",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#333",
    color: "#fff",
    padding: "0.6rem 1rem",
    borderRadius: "5px",
    fontSize: "0.9rem",
    zIndex: 1000,
    opacity: 0,
    transition: "opacity 0.3s ease",
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = 1));
  setTimeout(() => {
    toast.style.opacity = 0;
    toast.addEventListener("transitionend", () => toast.remove());
  }, 2000);
}

export function handleUndoLastLine() {
  const playerId = State.get("playerId");  // <-- get playerId instead of username
  console.log("Undo playerId:", playerId);
  if (!playerId) {
    console.log("null playerId");
    return;
  }

  const lines = State.get("lines");
  console.log("All lines:", lines);

  // Find last line created by this playerId
  const lastUserLine = [...lines]
    .reverse()
    .find((line) => line.playerId === playerId);

  if (!lastUserLine) {
    console.log("no user line");
    return; // nothing to undo
  }

  Network.deleteLine(lastUserLine.id);
  // Optionally clear selection if that line was selected
  if (State.get("selectedLineId") === lastUserLine.id) {
    State.set("selectedLineId", null);
  }
}


export function getSpawnDiameter() {
  let diameter = 0;

  switch (Math.floor(State.get("mapSize"))) {
    case 13:
      diameter = 5 * 2;
      break;
    case 12:
      diameter = 6 * 2;
      break;
    case 11:
      diameter = 7 * 2;
      break;
    case 10:
      diameter = 8 * 2;
      break;
    case 9:
      diameter = 9 * 2;
      break;
    case 8:
      diameter = 10 * 2;
      break;
    case 7:
      diameter = 12 * 2;
      break;
    case 6:
      diameter = 13 * 2;
      break;
    case 5:
      diameter = 15 * 2;
      break;
    case 4:
      diameter = 17 * 2;
      break;
    case 3:
      diameter = 20 * 2;
      break;
    case 2:
      diameter = 24 * 2;
      break;
    case 1:
      diameter = 30 * 2;
      break;
  }

  return diameter;
}
