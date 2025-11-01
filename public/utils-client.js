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
    } else if (obj.type === "circle") {
      // --- NEW ---
      // Check if point is within the circle's radius
      if (distance(point, obj.c) < obj.radius) {
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
// Strict poly-decomp-only implementation.
// Throws a clear error if poly-decomp is not present (no fallback).

/**
 * Split a single concave polygon-like shape into convex polygon shapes.
 * Requires the poly-decomp UMD global to be loaded (decomp or polyDecomp).
 *
 * Input shape:
 *  { v: [ [x,y], ... ], s?, a?, c? }
 *
 * Output: array of { type:'po', v: [ [x,y], ... ], s, a, c }
 */
export function splitConcaveIntoConvex(shape) {
  // detect the poly-decomp global (UMD builds expose `decomp`; some builds expose `polyDecomp`)
  const pd = window.decomp || window.polyDecomp || window.polyDecompES || window.polyDecompLib;

  if (!pd || (typeof pd.makeCCW !== 'function' && typeof pd.quickDecomp !== 'function' && typeof pd.decomp !== 'function')) {
    throw new Error(
      'poly-decomp library not found. Include the UMD build before your module script, for example:\n\n' +
      '<script src="https://cdn.jsdelivr.net/npm/poly-decomp@0.2.1/build/decomp.min.js"></script>\n' +
      '<script type="module" src="app.js"></script>\n\n' +
      'Make sure the poly-decomp <script> appears *before* your module script so the global is available when the module executes.'
    );
  }

  // normalize input vertices
  const inPoly = (shape && Array.isArray(shape.v) ? shape.v.map(p => [Number(p[0]), Number(p[1])]) : []);
  if (inPoly.length < 3) return [];

  // prefer makeCCW if available
  if (typeof pd.makeCCW === 'function') pd.makeCCW(inPoly);

  // choose decomposition function that definitely comes from poly-decomp
  const decompFn = typeof pd.quickDecomp === 'function' ? pd.quickDecomp : pd.decomp;

  if (typeof decompFn !== 'function') {
    // This should not happen because we checked earlier — fail loudly.
    throw new Error('poly-decomp is present but does not expose quickDecomp or decomp.');
  }

  // run decomposition (this is poly-decomp's algorithm)
  const convexes = decompFn(inPoly.slice());

  // remove collinear points if library exposes that helper
  if (Array.isArray(convexes) && convexes.length > 0 && typeof pd.removeCollinearPoints === 'function') {
    for (let i = 0; i < convexes.length; i++) {
      pd.removeCollinearPoints(convexes[i], 0); // 0 tolerance -> strict removal
    }
  }

  // map results into your shape format
  const out = (convexes || []).map(poly =>
    ({
      type: 'po',
      v: poly.map(p => [Number(p[0]), Number(p[1])]),
      s: shape.s ?? 1,
      a: shape.a ?? 0,
      c: shape.c ?? [0, 0]
    })
  );

  // console.log(out);

  return out;
}


// ----------------------------------------------------------------
// --- NEW AUTO-GENERATOR UTILITIES (SHARED) ----------------------
// ----------------------------------------------------------------

// --- Vector Math Helpers ---
export const v = (x, y) => ({ x, y });
export const add = (v1, v2) => v(v1.x + v2.x, v1.y + v2.y);
export const sub = (v1, v2) => v(v1.x - v2.x, v1.y - v2.y);
export const scale = (v1, s) => v(v1.x * s, v1.y * s);
export const mag = (v1) => Math.hypot(v1.x, v1.y);
export const normalize = (v1) => {
    const m = mag(v1);
    return m === 0 ? v(0, 0) : scale(v1, 1 / m);
};
export const perp = (v1) => v(-v1.y, v1.x);

// --- Random Helpers ---
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Selects a random key from a weights object.
 * e.g., { none: 1, bouncy: 1, death: 2 }
 */
export function getRandomType(weights) {
  const safe = weights && typeof weights === "object" ? weights : { none: 1 };
  // Filter out any inherited or invalid properties
  const entries = Object.entries(safe).filter(([k, v]) => 
    typeof v === "number" && v >= 0 && k !== "__proto__"
  );

  if (entries.length === 0) return "none";

  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return entries[0][0] || "none"; // Fallback if all weights are 0

  let r = randomFloat(0, total);
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }

  return entries[entries.length - 1][0]; // Fallback
}

// --- Geometry & Collision ---

/**
 * Calculates the Axis-Aligned Bounding Box (AABB) for a set of vertices.
 */
export function calculateBoundingBox(vertices) {
  if (!vertices || vertices.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Checks if two AABBs overlap, with an optional padding.
 */
export function doBoundsOverlap(box1, box2, padding = 0) {
  return (
    box1.minX < box2.maxX + padding &&
    box1.maxX > box2.minX - padding &&
    box1.minY < box2.maxY + padding &&
    box1.maxY > box2.minY - padding
  );
}

/**
 * Checks if any part of a polygon is within the canvas boundaries.
 */
export function isPolygonInCanvas(vertices, canvasWidth, canvasHeight) {
  if (!vertices || vertices.length === 0) return false;
  // Check if at least one vertex is inside
  for (const v of vertices) {
    if (v.x >= 0 && v.x <= canvasWidth && v.y >= 0 && v.y <= canvasHeight) return true;
  }
  // TODO: Add check for polygons completely outside but whose edges cross the canvas
  return false;
}

// --- Segment Intersection Helpers ---
function orientation(a, b, c) {
  const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2; // 1 -> clockwise, 2 -> counterclockwise
}
function onSegment(a, b, c) {
  return (
    Math.min(a.x, b.x) - 1e-9 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-9
  );
}
function segmentsIntersect(p1, p2, q1, q2) {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}
// --- End Segment Intersection ---

/**
 * Generates a random, non-self-intersecting polygon shape via a random walk.
 * Returns a set of *local* vertices centered around {0, 0}.
 * @param {object} opts - Options object { minVertices, maxVertices, minArea, maxArea }
 * @returns {Array<{x, y}>|null} Array of local vertices or null on failure.
 */
export function generateRandomVertices(opts) {
  const { minVertices = 3, maxVertices = 8, minArea = 1000, maxArea = 10000 } = opts;
  const perVertexAttempts = 12;
  const maxPolygonAttempts = 30; // Max attempts to generate one valid polygon

  function generateLocalWalk(numVertices, targetArea) {
    const maxTurn = Math.PI * 0.9;
    const baseline = Math.sqrt(Math.max(1, targetArea) / Math.max(3, numVertices));
    const minStep = Math.max(1, baseline * 0.35);
    const maxStep = Math.max(minStep + 0.1, baseline * 1.8);

    for (let globalTry = 0; globalTry < 3; globalTry++) {
      const verts = [{ x: 0, y: 0 }];
      let angle = randomFloat(0, Math.PI * 2);
      let x = 0, y = 0;

      let failed = false;
      for (let i = 1; i < numVertices; i++) {
        let placed = false;
        for (let tryV = 0; tryV < perVertexAttempts; tryV++) {
          const delta = randomFloat(-maxTurn, maxTurn);
          const newAngle = angle + delta;
          const step = randomFloat(minStep, maxStep);
          const nx = x + Math.cos(newAngle) * step;
          const ny = y + Math.sin(newAngle) * step;
          const candidate = { x: nx, y: ny };

          if (Math.hypot(nx - x, ny - y) < 1e-3) continue;

          let intersects = false;
          for (let e = 0; e < verts.length - 2; e++) {
            if (segmentsIntersect(verts[verts.length - 1], candidate, verts[e], verts[e + 1])) {
              intersects = true;
              break;
            }
          }
          if (intersects) continue;

          verts.push(candidate);
          x = nx; y = ny; angle = newAngle; placed = true; break;
        }
        if (!placed) { failed = true; break; }
      }
      if (failed) continue;

      const n = verts.length;
      if (n >= 3) {
        let closesOK = true;
        for (let e = 1; e < n - 2; e++) {
          if (segmentsIntersect(verts[n - 1], verts[0], verts[e], verts[e + 1])) {
            closesOK = false; break;
          }
        }
        if (!closesOK) continue;
      }
      return verts;
    }
    return null;
  }

  for (let attempt = 0; attempt < maxPolygonAttempts; attempt++) {
    const numVertices = randomInt(minVertices, maxVertices);
    const targetArea = Math.max(1, randomFloat(minArea, maxArea));

    const local = generateLocalWalk(numVertices, targetArea);
    if (!local) continue;

    const centroid = calculatePolygonCenter(local);
    if (!centroid) continue;
    const recentered = local.map((p) => ({ x: p.x - centroid.x, y: p.y - centroid.y }));

    const currentArea = polygonArea(recentered);
    if (!isFinite(currentArea) || Math.abs(currentArea) < 1e-6) continue;

    const scale = Math.sqrt(Math.abs(targetArea / currentArea));
    const scaled = recentered.map((p) => ({ x: p.x * scale, y: p.y * scale }));

    return scaled; // Return the local, scaled vertices
  }

  return null; // Failed to generate
}

/**
 * Translates local vertices to an absolute position.
 * @param {Array<{x, y}>} localVertices - Vertices centered around {0, 0}.
 * @param {{x, y}} center - The target absolute center position.
 * @returns {Array<{x, y}>} Array of absolute-position vertices.
 */
export function translateVertices(localVertices, center) {
    if (!localVertices || !center) return [];
    return localVertices.map((p) => ({ x: p.x + center.x, y: p.y + center.y }));
}

/**
 * Splits absolute vertices into convex polygons and formats them for the server.
 * @param {Array<{x, y}>} vertices - Absolute-position vertices.
 * @param {string} polyType - "none", "bouncy", or "death".
 * @returns {Array<object>} Array of formatted polygon objects for `createObjectsBatch`.
 */
export function splitAndFormatPolygons(vertices, polyType) {
  if (!vertices || vertices.length < 3) return [];
  const shape = { v: vertices.map((p) => [p.x, p.y]) };

  // Use the existing utility for splitting
  const convex = splitConcaveIntoConvex(shape); 
  if (!convex || convex.length === 0) return [];

  const formatted = convex
    .map((cp) => {
      const abs = cp.v.map((p) => ({ x: p[0], y: p[1] }));
      if (abs.length < 3) return null;
      const c = calculatePolygonCenter(abs);
      if (!c) return null;
      const v = abs.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
      // Format for createObjectsBatch
      return { type: "poly", c, v, a: 0, scale: 1, polyType }; 
    })
    .filter(Boolean); // Filter out any nulls from failed calculations

  return formatted;
}

/**
 * Makes a config object editable via the console.
 * @param {string} windowVarName - The name for the `window` variable (e.g., "PLATFORMER_CONFIG").
 * @param {object} configObj - The internal config object to expose.
 * @param {function} updateFn - The function that will be exposed on `window` to update the config.
 */
export function makeConfigEditable(windowVarName, configObj, updateFn) {
  if (typeof window !== "undefined") {
    window[windowVarName] = configObj;
    window[`UPDATE_${windowVarName}`] = (patch) => {
      if (typeof patch === "function") {
        try {
          const result = patch(JSON.parse(JSON.stringify(configObj)));
          if (result && typeof result === "object") {
            safeDeepMerge(configObj, result);
            console.info(`${windowVarName} updated via function patch.`);
          } else {
            console.warn(`Function did not return an object. ${windowVarName} not modified.`);
          }
        } catch (err) {
          console.error(`Error applying function patch to ${windowVarName}:`, err);
        }
      } else if (patch && typeof patch === "object") {
        safeDeepMerge(configObj, patch);
        console.info(`${windowVarName} patched.`);
      } else {
        console.warn(`UPDATE_${windowVarName} expects an object patch or a function returning a patch.`);
      }
      console.log(`Current ${windowVarName}:`, JSON.parse(JSON.stringify(configObj)));
    };
  }
}

/**
 * Safely merges properties from `patch` into `target` without prototype pollution.
 */
export function safeDeepMerge(target, patch) {
  if (!patch || typeof patch !== "object") return target;
  const stack = [[target, patch]];
  while (stack.length) {
    const [t, p] = stack.pop();
    for (const key of Object.keys(p)) {
      if (key === "__proto__" || key === "constructor") continue;
      const pv = p[key];
      // Merge plain objects, replace arrays/other
      if (pv && typeof pv === "object" && !Array.isArray(pv) && Object.prototype.toString.call(pv) === '[object Object]') {
        if (!t[key] || typeof t[key] !== "object" || Array.isArray(t[key]) || Object.prototype.toString.call(t[key]) !== '[object Object]') {
          t[key] = {};
        }
        stack.push([t[key], pv]);
      } else {
        t[key] = pv;
      }
    }
  }
  return target;
}