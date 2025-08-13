// utils-client.js — replace existing getHitLineId implementation with this
import State from "./state.js";
import * as Network from "./network.js";
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
  const lobby = State.get("lobbyPlayers") || [];
  const currentPlayerId = State.get("playerId");
  const presentIds = new Set(lobby.map((p) => p.id));

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
  const playerId = State.get("playerId"); // <-- get playerId instead of username
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

// utils-client.js (append)
export function getLineProps(l) {
  const dx = l.end.x - l.start.x;
  const dy = l.end.y - l.start.y;
  const fallbackWidth = Math.hypot(dx, dy);

  const width = typeof l.width === "number" ? l.width : fallbackWidth;
  const height = typeof l.height === "number" ? l.height : 4; // default 4
  const angle =
    typeof l.angle === "number"
      ? l.angle
      : (Math.atan2(dy, dx) * 180) / Math.PI;

  return { width, height, angle };
}

export function normalizeAngle(angle) {
  angle = ((angle % 180) + 180) % 180; // wrap into [0,180)
  return angle;
}
