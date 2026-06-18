import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import {
  createValidPolygonObject,
  splitConcaveIntoConvex,
} from "./utils-client.js";

let isActive = false;
let isMouseDown = false;
let currentPoints = [];
let strokeThickness = 20;

export function enableDrawingTool(thickness) {
  isActive = true;
  strokeThickness = thickness;
  State.set("isDrawingPath", true);
  State.set("generatedPath", []);

  const canvas = UI.elems.canvas;
  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKey);
}

export function disableDrawingTool() {
  isActive = false;
  State.set("isDrawingPath", false);
  State.set("generatedPath", null);

  const canvas = UI.elems.canvas;
  if (canvas) canvas.removeEventListener("mousedown", onDown);
  window.removeEventListener("mousemove", onMove);
  window.removeEventListener("mouseup", onUp);
  window.removeEventListener("keydown", onKey);
}

function toLocal(evt) {
  const rect = UI.elems.canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function onDown(e) {
  if (!isActive || e.button !== 0) return;
  isMouseDown = true;
  currentPoints = [toLocal(e)];
  State.set("generatedPath", [...currentPoints]);
}

function onMove(e) {
  if (!isActive || !isMouseDown) return;
  const pt = toLocal(e);

  // Throttle raw points slightly to keep the visual line clean
  const last = currentPoints[currentPoints.length - 1];
  const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
  if (dist > strokeThickness / 4) {
    currentPoints.push(pt);
    State.set("generatedPath", [...currentPoints]);
  }
}

function onUp(e) {
  if (!isActive || !isMouseDown) return;
  isMouseDown = false;

  if (currentPoints.length > 2) {
    processOrganicStroke(currentPoints, strokeThickness);
  }

  currentPoints = [];
  State.set("generatedPath", []);
}

function onKey(e) {
  if (isActive && e.key === "Escape") {
    disableDrawingTool();
    const btn = UI.elems.agpDrawBtn;
    if (btn) {
      btn.textContent = "Toggle Drawing: OFF";
      btn.style.backgroundColor = "";
    }
    UI.setStatus("Continuous Drawing OFF.");
  }
}

// ============================================================================
// THE NEW ORGANIC BRUSH GENERATOR
// ============================================================================

function processOrganicStroke(pts, thickness) {
  // 1. SKELETON: Aggressively reduce points to a sparse structural skeleton.
  // This guarantees low polygon count. An 'S' shape becomes ~6 anchor points.
  const epsilon = Math.max(5, thickness * 0.4);
  let skeleton = douglasPeucker(pts, epsilon);

  // If too simplified, smooth it slightly so it flows well
  if (skeleton.length < 3) skeleton = pts;

  const finalObjects = [];
  const activeType = UI.elems.typeSelect ? UI.elems.typeSelect.value : "none";

  // Organic width function: Tapers at the ends, swells in the middle, with a wavy calligraphy feel
  const getWidth = (i, total) => {
    const progress = i / (total - 1);
    // Taper ends to 60%, base wave oscillates slightly
    const taper = Math.sin(progress * Math.PI) * 0.4 + 0.6;
    const calligraphyWave = 0.8 + 0.2 * Math.sin(i * 1.5);
    return (thickness / 2) * taper * calligraphyWave;
  };

  const miterLeft = [];
  const miterRight = [];

  // 2. MITER JOINTS: Calculate perfect shared boundaries so there are ZERO gaps
  for (let i = 0; i < skeleton.length; i++) {
    const p = skeleton[i];
    const w = getWidth(i, skeleton.length);

    let dir;
    if (i === 0) {
      dir = normalize({ x: skeleton[1].x - p.x, y: skeleton[1].y - p.y });
    } else if (i === skeleton.length - 1) {
      dir = normalize({
        x: p.x - skeleton[i - 1].x,
        y: p.y - skeleton[i - 1].y,
      });
    } else {
      // Angle bisector for elbows
      const d1 = normalize({
        x: p.x - skeleton[i - 1].x,
        y: p.y - skeleton[i - 1].y,
      });
      const d2 = normalize({
        x: skeleton[i + 1].x - p.x,
        y: skeleton[i + 1].y - p.y,
      });
      dir = normalize({ x: d1.x + d2.x, y: d1.y + d2.y });
      if (dir.x === 0 && dir.y === 0) dir = d1; // fallback on 180 switchbacks
    }

    const normal = { x: -dir.y, y: dir.x };

    // Miter factor extends the corner to meet perfectly. Cap it at 2x to prevent wild spikes.
    let miterFactor = 1.0;
    if (i > 0 && i < skeleton.length - 1) {
      const d1 = normalize({
        x: p.x - skeleton[i - 1].x,
        y: p.y - skeleton[i - 1].y,
      });
      const dot = d1.x * dir.x + d1.y * dir.y;
      if (dot > 0.1) miterFactor = Math.min(2.0, 1 / dot);
    }

    const offset = Math.max(2, w * miterFactor);
    miterLeft.push({ x: p.x + normal.x * offset, y: p.y + normal.y * offset });
    miterRight.push({ x: p.x - normal.x * offset, y: p.y - normal.y * offset });
  }

  // 3. BUILD COMPLEX STYLIZED SEGMENTS
  // Instead of rectangles, we build 'Hexagon' segments that bulge in the middle.
  for (let i = 0; i < skeleton.length - 1; i++) {
    const p1 = skeleton[i];
    const p2 = skeleton[i + 1];

    // Middle point to create the curve bulge
    const midP = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dir = normalize({ x: p2.x - p1.x, y: p2.y - p1.y });
    const norm = { x: -dir.y, y: dir.x };

    // Midpoint bulges outwards by 15% to create soft, rounded transitions
    const wMid =
      ((getWidth(i, skeleton.length) + getWidth(i + 1, skeleton.length)) / 2) *
      1.15;

    const lMid = { x: midP.x + norm.x * wMid, y: midP.y + norm.y * wMid };
    const rMid = { x: midP.x - norm.x * wMid, y: midP.y - norm.y * wMid };

    // The organic segment (Hexagon)
    const segmentVertices = [
      miterLeft[i],
      lMid,
      miterLeft[i + 1],
      miterRight[i + 1],
      rMid,
      miterRight[i],
    ];

    // Guarantee convexity (a bulging hexagon might be slightly concave)
    const shapeToSplit = { v: segmentVertices.map((p) => [p.x, p.y]) };
    const convexPieces = splitConcaveIntoConvex(shapeToSplit);

    if (convexPieces) {
      convexPieces.forEach((cp) => {
        const absV = cp.v.map((arr) => ({ x: arr[0], y: arr[1] }));
        const validPoly = createValidPolygonObject(absV, activeType);
        if (validPoly) finalObjects.push(validPoly);
      });
    }
  }

  // 4. ADD ROUNDED CAPS
  // Add an elegant arrow/diamond cap to the start and end of the stroke
  const addCap = (pIndex, dirSign) => {
    const p = skeleton[pIndex];
    const left = miterLeft[pIndex];
    const right = miterRight[pIndex];

    let dVec;
    if (pIndex === 0)
      dVec = normalize({
        x: skeleton[0].x - skeleton[1].x,
        y: skeleton[0].y - skeleton[1].y,
      });
    else
      dVec = normalize({
        x: skeleton[skeleton.length - 1].x - skeleton[skeleton.length - 2].x,
        y: skeleton[skeleton.length - 1].y - skeleton[skeleton.length - 2].y,
      });

    const w = getWidth(pIndex, skeleton.length);
    const capTip = { x: p.x + dVec.x * w, y: p.y + dVec.y * w };

    const capShape = {
      v: [
        [left.x, left.y],
        [capTip.x, capTip.y],
        [right.x, right.y],
      ],
    };
    const validCap = createValidPolygonObject(
      capShape.v.map((arr) => ({ x: arr[0], y: arr[1] })),
      activeType,
    );
    if (validCap) finalObjects.push(validCap);
  };

  if (skeleton.length > 1) {
    addCap(0, -1);
    addCap(skeleton.length - 1, 1);
  }

  // 5. BATCH SEND TO SERVER
  if (finalObjects.length > 0) {
    Network.createObjectsBatch({
      objects: finalObjects,
      isAutoGeneration: false,
    });
  }
}

// ============================================================================
// MATHEMATICAL UTILITIES
// ============================================================================

function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

// Douglas-Peucker: Recursively strips out unneeded points to form a bare-bones skeleton
function douglasPeucker(pts, epsilon) {
  if (pts.length <= 2) return pts;
  let dmax = 0;
  let index = 0;
  const end = pts.length - 1;
  for (let i = 1; i < end; i++) {
    const d = pointLineDistance(pts[i], pts[0], pts[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }
  if (dmax > epsilon) {
    const rec1 = douglasPeucker(pts.slice(0, index + 1), epsilon);
    const rec2 = douglasPeucker(pts.slice(index), epsilon);
    return rec1.slice(0, -1).concat(rec2);
  } else {
    return [pts[0], pts[end]];
  }
}

function pointLineDistance(p, a, b) {
  const num = Math.abs(
    (b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x,
  );
  const den = Math.hypot(b.x - a.x, b.y - a.y);
  return den === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : num / den;
}
