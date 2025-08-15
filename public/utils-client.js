// utils-client.js
import State from "./state.js";
import * as Network from "./network.js";
import UI from "./ui.js"; // Assuming UI module exports elems

/**
 * helper: convert a line's width+angle into an endpoint if present, else use line.end
 */
function computeEnd(line) {
  if (typeof line.width === "number" && typeof line.angle === "number") {
    const r = (line.angle * Math.PI) / 180;
    return {
      x: line.start.x + Math.cos(r) * line.width,
      y: line.start.y + Math.sin(r) * line.width,
    };
  }
  return line.end;
}

/**
 * point-to-segment distance (not squared)
 */
function pointToSegmentDistance(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(wx, wy);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const projx = a.x + t * vx;
  const projy = a.y + t * vy;
  return Math.hypot(p.x - projx, p.y - projy);
}

export function getHitLineId(point) {
  const lines = State.get("lines") || [];
  // --- FIX --- Use the correct state property 'players'
  const lobby = State.get("players") || [];
  // --- FIX --- Use 'socketId' for the current player's ID for consistency
  const currentPlayerId = State.get("socketId");
  const presentIds = new Set(lobby.map((p) => p.id));

  // Iterate from top-most rendered line to bottom
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const start = line.start;
    const end = computeEnd(line);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    // Rotate point into line's local coordinate space
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    const localX = (point.x - start.x) * cos - (point.y - start.y) * sin;
    const localY = (point.x - start.x) * sin + (point.y - start.y) * cos;

    const lineHeight = typeof line.height === "number" ? line.height : 4;

    // Check if inside the rectangle bounds
    const halfH = lineHeight / 2;
    if (
      localX >= 0 &&
      localX <= length &&
      localY >= -halfH &&
      localY <= halfH
    ) {
      const ownerId = line.playerId;
      const ownerPresent = presentIds.has(ownerId);
      // Allow selection if the user is the owner OR if the owner is not in the game
      if (ownerId === currentPlayerId || !ownerPresent) {
        return line.id;
      }
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
      select.style.color = "#000";
      break;
    case "death":
      select.style.backgroundColor = "#e53935"; // vivid red
      select.style.color = "#000";
      break;
    case "none":
    default:
      select.style.backgroundColor = "#fff"; // white
      select.style.color = "#000";
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
  // --- FIX --- Use 'socketId' for consistency
  const playerId = State.get("socketId");
  if (!playerId) return;

  const lines = State.get("lines");
  const lastUserLine = [...lines]
    .reverse()
    .find((line) => line.playerId === playerId);

  if (!lastUserLine) return;

  Network.deleteLine(lastUserLine.id);
  if (State.get("selectedLineId") === lastUserLine.id) {
    State.set("selectedLineId", null);
  }
}

export function getSpawnDiameter() {
  let diameter = 18; // Default value
  const mapSize = Math.floor(State.get("mapSize"));
  const sizeMap = {
    13: 10,
    12: 12,
    11: 14,
    10: 16,
    9: 18,
    8: 20,
    7: 24,
    6: 26,
    5: 30,
    4: 34,
    3: 40,
    2: 48,
    1: 60,
  };
  return sizeMap[mapSize] || diameter;
}

export function getLineProps(l) {
  const dx = l.end.x - l.start.x;
  const dy = l.end.y - l.start.y;
  const fallbackWidth = Math.hypot(dx, dy);

  const width = typeof l.width === "number" ? l.width : fallbackWidth;
  const height = typeof l.height === "number" ? l.height : 4;
  const angle =
    typeof l.angle === "number"
      ? l.angle
      : (Math.atan2(dy, dx) * 180) / Math.PI;

  return { width, height, angle };
}

export function normalizeAngle(angle) {
  return ((angle % 180) + 180) % 180;
}

export function distance(a, b) {
  // --- FIX --- Added a guard to prevent crash if points are invalid
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function computeAngleDeg(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

// --- FIX --- This function was empty, causing the crash.
// It now correctly calculates the mouse position relative to the canvas.
export function pointFromEventOnCanvas(evt) {
  const canvas = UI.elems.canvas;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

export function normalizeServerLine(payload) {
  if (!payload) return null;
  const start = payload.start ?? payload.line?.start;
  const end = payload.end ?? payload.line?.end;
  return {
    id: payload.id,
    playerId: payload.playerId,
    start,
    end,
    username: payload.username ?? "",
    symbol: payload.symbol ?? "",
    type: payload.type ?? "none",
    width:
      typeof payload.width === "number"
        ? payload.width
        : Math.hypot(end.x - start.x, end.y - start.y),
    height: typeof payload.height === "number" ? payload.height : 4,
    angle:
      typeof payload.angle === "number"
        ? payload.angle
        : computeAngleDeg(start, end),
  };
}
