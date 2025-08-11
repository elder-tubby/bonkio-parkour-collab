// utils-client.js

import State from './state.js';
import * as Network from "./network.js";

export function getHitLineId(pt) {
  const lines = State.get('lines');
  for (const { id, start, end, playerId } of lines) {
    if (playerId !== State.get('playerId')) continue;
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = Math.max(0, Math.min(1,
      ((pt.x - start.x)*dx + (pt.y - start.y)*dy) /
      (dx*dx + dy*dy)
    ));
    const proj = { x: start.x + t*dx, y: start.y + t*dy };
    if (Math.hypot(pt.x - proj.x, pt.y - proj.y) < 6) {
      return id;
    }
  }
  return null;
}

export function updateLineTypeUI(type) {
  const select = document.getElementById('lineTypeSelect');

  if (!select) return;

  switch (type) {
    case 'bouncy':
      select.style.backgroundColor = '#888'; // gray
      select.style.color = '#000'; // black text for contrast
      break;
    case 'death':
      select.style.backgroundColor = '#e53935'; // vivid red
      select.style.color = '#000'; // black text for contrast
      break;
    case 'none':
    default:
      select.style.backgroundColor = '#fff'; // white
      select.style.color = '#000'; // black text
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
  const username = State.get("username");
  if (!username) return;

  const lines = State.get("lines");
  // Find last line created by this user
  const lastUserLine = [...lines].reverse().find(line => line.username === username);

  if (!lastUserLine) return; // nothing to undo

  Network.deleteLine(lastUserLine.id);
  // Optionally clear selection if that line was selected
  if (State.get("selectedLineId") === lastUserLine.id) {
    State.set("selectedLineId", null);
  }
}



