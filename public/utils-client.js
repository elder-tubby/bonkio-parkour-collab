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
 * A helper function to check if a point is inside a polygon using the ray-casting algorithm.
 * @param {{x, y}} point The point to check.
 * @param {[{x, y}]} vertices The vertices of the polygon.
 * @returns {boolean} True if the point is inside the polygon.
 */
function isPointInPolygon(point, vertices) {
  let isInside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x,
      yi = vertices[i].y;
    const xj = vertices[j].x,
      yj = vertices[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) isInside = !isInside;
  }
  return isInside;
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
export function showToast(message, isWarning = false) {
  const toast = document.createElement("div");
  toast.textContent = message;

  const backgroundColor = isWarning ? "#d9822b" : "#333"; // darker orange

  Object.assign(toast.style, {
    position: "fixed",
    top: "1rem",
    left: "50%",
    transform: "translateX(-50%)",
    background: backgroundColor,
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

// Rotates a point around the origin (0,0)
function rotatePoint(point, angle) {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function getSpawnDiameter(mapSize) {
  let diameter = 18; // Default value
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

/**
 * Calculate the centroid (geometric center) of a polygon.
 * @param {Array<{x:number, y:number}>} verts - polygon vertices in order (not necessarily closed)
 * @returns {[number, number]} centroid as [cx, cy]
 */
// return { x, y } (always)
export function calculatePolygonCenter(verts) {
  if (!Array.isArray(verts) || verts.length === 0) return { x: 0, y: 0 };

  // normalize vertices to objects {x,y}
  const v = verts.map((p) =>
    Array.isArray(p)
      ? { x: Number(p[0]), y: Number(p[1]) }
      : { x: Number(p.x), y: Number(p.y) },
  );

  const n = v.length;
  if (n === 1) return { x: v[0].x, y: v[0].y };
  if (n === 2) return { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 };

  let twiceArea = 0; // 2 * signed area
  let cxTimes6Area = 0;
  let cyTimes6Area = 0;

  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cxTimes6Area += (a.x + b.x) * cross;
    cyTimes6Area += (a.y + b.y) * cross;
  }

  // degenerate polygon -> fallback to simple average
  if (Math.abs(twiceArea) < 1e-8) {
    let sx = 0,
      sy = 0;
    for (let i = 0; i < n; i++) {
      sx += v[i].x;
      sy += v[i].y;
    }
    return { x: sx / n, y: sy / n };
  }

  // centroid formula: Cx = (1/(6A)) * sum( (xi + xi+1) * cross )
  // twiceArea = 2*A => 6*A = 3*twiceArea
  const cx = cxTimes6Area / (3 * twiceArea);
  const cy = cyTimes6Area / (3 * twiceArea);

  return { x: cx, y: cy };
}

/**
 * A variant of getHitObjectId that checks for any object under the cursor,
 * regardless of ownership. Used for the hover tooltip.
 * @param {{x, y}} point The coordinates of the mouse.
 * @param {Array<Object>} objects The array of all objects.
 * @returns {Object|null} The hovered object itself, or null.
 */
export function getHoveredObject(point, objects) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.type === "poly") {
      const { c, v, a, scale } = obj;
      const s = scale || 1;
      const angleRad = -a * (Math.PI / 180);
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const translatedX = point.x - c.x;
      const translatedY = point.y - c.y;
      const rotatedX = translatedX * cos - translatedY * sin;
      const rotatedY = translatedX * sin + translatedY * cos;
      // Reverse the scale transformation for accurate hit detection
      const finalX = rotatedX / s;
      const finalY = rotatedY / s;

      if (isPointInPolygon({ x: finalX, y: finalY }, v)) {
        return obj;
      }
    } else if (obj.type === "line") {
      const start = obj.start;
      const end = computeEnd(obj);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      const localX = (point.x - start.x) * cos - (point.y - start.y) * sin;
      const localY = (point.x - start.x) * sin + (point.y - start.y) * cos;
      const lineHeight = typeof obj.height === "number" ? obj.height : 4;
      const halfH = lineHeight / 2;

      if (
        localX >= 0 &&
        localX <= length &&
        localY >= -halfH &&
        localY <= halfH
      ) {
        return obj;
      }
    }
  }
  return null;
}

// utils-client.js

// --- Replace the handleUndoLastObject function ---
export function handleUndoLastObject() {
  const myId = State.get("socketId");
  const objects = State.get("objects");

  // **FIX**: Filter for the user's objects that have a creation timestamp,
  // then sort by that timestamp to find the most recent one.
  const myLastObject = objects
    .filter((obj) => obj.playerId === myId && obj.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (myLastObject) {
    Network.deleteObject(myLastObject.id);
  }
}

// Add to utils-client.js (near the other exported helpers)

function rectsIntersect(r1, r2) {
  return !(
    r2.x > r1.x + r1.width ||
    r2.x + r2.width < r1.x ||
    r2.y > r1.y + r1.height ||
    r2.y + r2.height < r1.y
  );
}

/**
 * Returns whether the current player can select the object.
 * Selection is allowed if:
 * - object.playerId === current player's socketId
 * OR
 * - the object's owner is not present in the current lobby
 */
export function canSelectObject(objectId) {
  if (!objectId) return false;
  const objects = State.get("objects") || [];
  const obj = objects.find((o) => o.id === objectId);
  if (!obj) return false;

  const lobby = State.get("players") || [];
  const currentPlayerId = State.get("socketId");
  const presentIds = new Set(lobby.map((p) => p.id));
  const ownerId = obj.playerId;

  // If no owner, allow selection
  if (!ownerId) return true;

  // Allow if I'm the owner or owner is not present
  return ownerId === currentPlayerId || !presentIds.has(ownerId);
}

/**
 * Returns true if the object's *visual* bounding box intersects the selection box.
 * Works for 'poly' and 'line'. Selection box is {x,y,width,height}.
 */
export function isObjectInSelectionBox(obj, box) {
  if (!obj || !box) return false;

  // Helper: build axis-aligned bounding box for a polygon's absolute vertices
  function polyAABB(poly) {
    const c = poly.c || { x: 0, y: 0 };
    const v = poly.v || [];
    const s = poly.scale || 1;
    const a = poly.a || 0;
    const rad = (a * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (let i = 0; i < v.length; i++) {
      const vx = Number(v[i].x ?? v[i][0]);
      const vy = Number(v[i].y ?? v[i][1]);
      // apply scale
      const sx = vx * s;
      const sy = vy * s;
      // rotate
      const rx = sx * cos - sy * sin;
      const ry = sx * sin + sy * cos;
      // translate by center
      const ax = rx + c.x;
      const ay = ry + c.y;
      if (ax < minX) minX = ax;
      if (ay < minY) minY = ay;
      if (ax > maxX) maxX = ax;
      if (ay > maxY) maxY = ay;
    }

    if (minX === Infinity) return { x: c.x, y: c.y, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // Helper: build axis-aligned bounding box for a line (including its height)
  function lineAABB(line) {
    const start = line.start || { x: 0, y: 0 };
    const end = computeEnd(line) || line.end || start;
    const h = typeof line.height === "number" ? line.height : 4;
    const halfH = h / 2;

    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y - halfH, end.y - halfH);
    const maxX = Math.max(start.x, end.x);
    const maxY = Math.max(start.y + halfH, end.y + halfH);

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  // Helper for circle bounding box
  function circleAABB(circle) {
    const r = circle.radius || 0;
    return {
      x: circle.c.x - r,
      y: circle.c.y - r,
      width: r * 2,
      height: r * 2,
    };
  }

  if (obj.type === "poly") {
    const aabb = polyAABB(obj);
    return rectsIntersect(aabb, box);
  } else if (obj.type === "line") {
    const aabb = lineAABB(obj);
    return rectsIntersect(aabb, box);
  } else if (obj.type === "circle") {
    // Use the new bounding box check for circles
    const aabb = circleAABB(obj);
    return rectsIntersect(aabb, box);
  }

  // default: not selectable by marquee
  return false;
}

// This function should replace your existing getHitObjectId logic.
// You can place it in utils-client.js and import it, or add it directly to handlers.js.

/**
 * Calculates the absolute-coordinate vertices of a polygon object.
 * @param {object} obj The polygon object with properties c, a, scale, v.
 * @returns {Array<{x: number, y: number}>} An array of vertex points in world coordinates.
 */
function getAbsoluteVertices(obj) {
  const a = obj.a || 0;
  const s = obj.scale || 1;
  const r = (a * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);

  return (obj.v || []).map((lv) => {
    const scaledX = lv.x * s;
    const scaledY = lv.y * s;
    const rotatedX = scaledX * cos - scaledY * sin;
    const rotatedY = scaledX * sin + scaledY * cos;
    return { x: obj.c.x + rotatedX, y: obj.c.y + rotatedY };
  });
}

// This is the new getHitObjectId function
export function getHitObjectId(point, objects) {
  // Iterate backwards to select objects on top first
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.type === "poly") {
      const absoluteVertices = getAbsoluteVertices(obj);
      if (isPointInPolygon(point, absoluteVertices)) {
        return obj.id;
      }
    } else if (obj.type === "line") {
      // Your existing line hit detection logic here...
      // For example:
      const dist = distanceToLineSegment(point, obj.start, obj.end);
      const thickness = (obj.height || 4) / 2 + 3; // Add buffer for easier clicking
      if (dist < thickness) {
        return obj.id;
      }
    } else if (obj.type === "circle") {
      if (distance(point, obj.c) < obj.radius) {
        return obj.id;
      }
    }
  }
  return null;
}

// You will also need a distanceToLineSegment helper if you don't have one
function distanceToLineSegment(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(
    p.x - (v.x + t * (w.x - v.x)),
    p.y - (v.y + t * (w.y - v.y)),
  );
}

// ----------------------- GEOMETRY FUNCTIONS --------------------------------
export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}
