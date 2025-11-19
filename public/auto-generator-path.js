// public/auto-generator-path.js

import {
  splitConcaveIntoConvex,
  calculatePolygonCenter,
  randomFloat,
  randomInt,
  polygonSelfIntersects,
  computePathLengths,
  samplePointAndTangent,
  getRandomType, // Import getRandomType
} from "./utils-client.js";
import UI from "./ui.js";
import State from "./state.js";

// --- CONFIG ---
const CONFIG = {
  // ... (CONFIG remains unchanged) ...
  objectCat1: {
    sampleCountRange: [18, 36],
    widthRange: { min: 16, max: 48 },
    stepJitterFactor: 0.45,
    widthJitter: 0.4,
    sideSync: 1.0,
    typeWeights: { none: 1, bouncy: 1, death: 1 },
  },
  maxRetries: 4,
};

// ---------------- Ribbon construction (Internal Helpers) ----------------

/**
 * Creates the single concave polygon (ribbon) that spans the path.
 * (This function remains unchanged as a low-level helper.)
 */
function buildRibbonPolygonFromPath(path, cfg, canvasWidth, canvasHeight) {
  // ... (implementation remains unchanged) ...
  const { segLengths, total } = computePathLengths(path);
  if (total <= 0) return null;

  const sampleCount = randomInt(
    cfg.sampleCountRange[0],
    cfg.sampleCountRange[1],
  );

  // produce randomized steps that sum to total
  const avg = total / Math.max(1, sampleCount - 1);
  const rawSteps = new Array(sampleCount - 1)
    .fill(0)
    .map(
      () =>
        avg * randomFloat(1 - cfg.stepJitterFactor, 1 + cfg.stepJitterFactor),
    );
  const sum = rawSteps.reduce((s, v) => s + v, 0) || 1;
  const scale = total / sum;
  for (let i = 0; i < rawSteps.length; i++) rawSteps[i] *= scale;
  const basePositions = [0];
  let acc = 0;
  for (let s of rawSteps) {
    acc += s;
    basePositions.push(Math.min(1, acc / total));
  }
  if (basePositions[basePositions.length - 1] < 1)
    basePositions[basePositions.length - 1] = 1;

  // For each base position we'll compute independent left and right t values within allowed local intervals
  const leftPoints = [];
  const rightPoints = [];
  const n = basePositions.length;

  for (let i = 0; i < n; i++) {
    const centerT = basePositions[i];
    const prevMid = i === 0 ? 0 : (basePositions[i - 1] + basePositions[i]) / 2;
    const nextMid =
      i === n - 1 ? 1 : (basePositions[i] + basePositions[i + 1]) / 2;
    const allowedLow = prevMid + 1e-6;
    const allowedHigh = nextMid - 1e-6;
    const allowedWidth = Math.max(1e-6, allowedHigh - allowedLow);

    // offset range: half the allowed width -- center +/- that keeps it inside neighbor intervals
    const offsetMax = allowedWidth / 2;
    const sync = Math.max(
      0,
      Math.min(1, typeof cfg.sideSync === "number" ? cfg.sideSync : 1),
    );

    // sample offsets in [-offsetMax, offsetMax] scaled by (1 - sync). If sync==1 offsets==0
    const sampleOffset = () => {
      if (sync >= 0.999) return centerT; // fully synced
      const rand = randomFloat(-1, 1) * (1 - sync);
      const t = centerT + rand * offsetMax;
      // clamp into allowed
      return Math.max(allowedLow, Math.min(allowedHigh, t));
    };

    const tLeft = sampleOffset();
    const tRight = sampleOffset();

    const { p: pL, tangent: tngL } = samplePointAndTangent(
      path,
      tLeft,
      segLengths,
      total,
    );
    const { p: pR, tangent: tngR } = samplePointAndTangent(
      path,
      tRight,
      segLengths,
      total,
    );

    // compute normals (use tangent from each sample to get local normal) and apply width
    const normalL = { x: -tngL.y, y: tngL.x };
    const normalR = { x: -tngR.y, y: tngR.x };

    const baseW = randomFloat(cfg.widthRange.min, cfg.widthRange.max);
    const wJ = 1 + randomFloat(-1, 1) * cfg.widthJitter;
    const halfW = Math.max(0.1, baseW * wJ);

    // jitter along normal a bit to avoid perfectly straight sides
    const sideJitterL = randomFloat(-halfW * 0.15, halfW * 0.15);
    const sideJitterR = randomFloat(-halfW * 0.15, halfW * 0.15);

    leftPoints.push({
      x: pL.x + normalL.x * (halfW + sideJitterL),
      y: pL.y + normalL.y * (halfW + sideJitterL),
    });
    rightPoints.push({
      x: pR.x - normalR.x * (halfW + sideJitterR),
      y: pR.y - normalR.y * (halfW + sideJitterR),
    });
  }

  const polygon = leftPoints.concat([...rightPoints].reverse());

  // ensure in-bounds
  for (const v of polygon) {
    if (v.x < 0 || v.x > canvasWidth || v.y < 0 || v.y > canvasHeight)
      return null;
  }

  if (polygonSelfIntersects(polygon)) return null;
  return polygon;
}

/**
 * Splits the concave ribbon and assigns types.
 * (This function remains unchanged as a low-level helper, updated to use imported getRandomType.)
 */
function splitAndAssignTypes(polygon, categoryKey) {
  if (!polygon || polygon.length < 3) return [];
  const cfg = CONFIG[categoryKey] || CONFIG.objectCat1;
  // Note: getRandomType is assumed to be imported from utils-client.js
  const convex = splitConcaveIntoConvex({ v: polygon.map((p) => [p.x, p.y]) });
  if (!convex || convex.length === 0) return [];
  const out = [];
  for (const cp of convex) {
    const abs = cp.v.map((p) => ({ x: p[0], y: p[1] }));
    if (abs.length < 3) continue;
    const c = calculatePolygonCenter(abs);
    if (!c) continue;
    const v = abs.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const polyType = getRandomType(cfg.typeWeights);
    out.push({ type: "poly", c, v, a: 0, scale: 1, polyType });
  }
  return out;
}

// ---------------- Public Functions ----------------

/**
 * Generates ribbon polygons from a given path (array of points).
 * This is the new, centralized core function used by both custom and random path generation.
 */
export function generatePolygonsFromPathPoints(path, options = {}) {
  const canvas = UI.elems && UI.elems.canvas;
  const canvasWidth = options.canvasWidth || (canvas && canvas.width) || 1024;
  const canvasHeight = options.canvasHeight || (canvas && canvas.height) || 768;
  const categoryKey = options.categoryKey || "objectCat1";

  let attempt = 0;
  const baseCfg = CONFIG[categoryKey] || CONFIG.objectCat1;
  const cfg = {
    ...baseCfg,
    widthRange: { ...baseCfg.widthRange },
  };

  while (attempt < CONFIG.maxRetries) {
    const polygon = buildRibbonPolygonFromPath(
      path,
      cfg,
      canvasWidth,
      canvasHeight,
    );
    if (!polygon) {
      attempt++;
      // Reduce ribbon width on failure
      cfg.widthRange.min *= 0.85;
      cfg.widthRange.max *= 0.85;
      continue;
    }
    const pieces = splitAndAssignTypes(polygon, categoryKey);
    return pieces;
  }
  return [];
}

/**
 * Generates a random path and uses the core logic to convert it to polygons.
 * This function is now **refactored** to use the centralized helper.
 */
export function generateRandomPathAndPolygons(options = {}) {
  const canvas = UI.elems && UI.elems.canvas;
  const canvasWidth = options.canvasWidth || (canvas && canvas.width) || 1024;
  const canvasHeight = options.canvasHeight || (canvas && canvas.height) || 768;

  // Step 1: Generate the Path
  const path = generateRandomPath(canvasWidth, canvasHeight, options);

  // Step 2: Use the centralized logic to generate polygons from the path
  const pieces = generatePolygonsFromPathPoints(path, options);

  return pieces;
}

// ---------------- Path Generation Helpers ----------------
// ... (generateRandomPath, chaikinSmooth, startPathDrawing implementations remain as provided) ...
// Note: Removed the getRandomType internal helper since it's now imported and used inside splitAndAssignTypes

// ---------------- Random path generator (keep existing logic idea) ----------------

/**

* Generate a pseudo-random smooth-ish path across the canvas.

* Options can include:

* - padding, segments etc.

*/

function generateRandomPath(canvasWidth, canvasHeight, options = {}) {
  const padding = options.padding || 40;

  const segments = options.segments || randomInt(3, 6);

  const pts = [];

  const horizontal = Math.random() > 0.5;

  if (horizontal) {
    const yMid = randomFloat(padding, canvasHeight - padding);

    const start = {
      x: randomFloat(padding, canvasWidth * 0.15),

      y: yMid + randomFloat(-80, 80),
    };

    const end = {
      x: randomFloat(canvasWidth * 0.85, canvasWidth - padding),

      y: yMid + randomFloat(-80, 80),
    };

    pts.push(start);

    for (let i = 1; i < segments; i++) {
      const t = i / segments;

      pts.push({
        x: start.x + (end.x - start.x) * t + randomFloat(-120, 120),

        y: start.y + (end.y - start.y) * t + randomFloat(-120, 120),
      });
    }

    pts.push(end);
  } else {
    const xMid = randomFloat(padding, canvasWidth - padding);

    const start = {
      x: xMid + randomFloat(-80, 80),

      y: randomFloat(padding, canvasHeight * 0.15),
    };

    const end = {
      x: xMid + randomFloat(-80, 80),

      y: randomFloat(canvasHeight * 0.85, canvasHeight - padding),
    };

    pts.push(start);

    for (let i = 1; i < segments; i++) {
      const t = i / segments;

      pts.push({
        x: start.x + (end.x - start.x) * t + randomFloat(-120, 120),

        y: start.y + (end.y - start.y) * t + randomFloat(-120, 120),
      });
    }

    pts.push(end);
  }

  return chaikinSmooth(pts, 2);
}

function chaikinSmooth(points, iterations = 1) {
  let res = points.slice();

  for (let it = 0; it < iterations; it++) {
    const next = [];

    next.push(res[0]);

    for (let i = 0; i < res.length - 1; i++) {
      const a = res[i],
        b = res[i + 1];

      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });

      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }

    next.push(res[res.length - 1]);

    res = next;
  }

  return res;
}

// ... (startPathDrawing implementation remains as provided) ...
export function startPathDrawing(options = {}) {
  const canvasElem = UI.elems && UI.elems.canvas;
  if (!canvasElem) return Promise.reject(new Error("Canvas not available"));

  return new Promise((resolve, reject) => {
    const points = [];
    let drawing = false;
    // ... (rest of implementation remains unchanged) ...
    State.set("isDrawingPath", true);
    State.set("generatedPath", []);

    function toLocal(evt) {
      const rect = canvasElem.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function onDown(e) {
      if (e.button !== 0) return; // Left click only
      drawing = true;
      points.length = 0;
      points.push(toLocal(e));

      // update viz
      State.set("generatedPath", [...points]);

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }

    function onMove(e) {
      if (!drawing) return;
      const pt = toLocal(e);

      // Optional: basic throttle to prevent thousands of points during drag
      const last = points[points.length - 1];
      const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
      if (dist > 5) {
        points.push(pt);
        State.set("generatedPath", [...points]); // Dynamic Visual Update
      }
    }

    function onUp(e) {
      if (!drawing) return;
      drawing = false;
      cleanup();

      // Simplification Step
      const simplified = simplifyPoints(points, 5);

      if (simplified.length < 2) {
        // Reset state on failure
        State.set("isDrawingPath", false);
        State.set("generatedPath", null);
        return reject(new Error("Not enough points drawn"));
      }

      const smoothedPath = chaikinSmooth(simplified, 1);

      // Resolve with the PATH, not the Polygons.
      resolve(smoothedPath);

      // Note: We do NOT clear generatedPath here immediately,
      // giving the caller a chance to use it or clear it.
      State.set("isDrawingPath", false);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        cleanup();
        State.set("isDrawingPath", false);
        State.set("generatedPath", null);
        reject(new Error("Drawing cancelled"));
      }
    }

    function cleanup() {
      canvasElem.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    function simplifyPoints(pts, minDist) {
      if (!pts || pts.length === 0) return [];
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - out[out.length - 1].x;
        const dy = pts[i].y - out[out.length - 1].y;
        if (Math.hypot(dx, dy) >= minDist) out.push(pts[i]);
      }
      return out;
    }

    canvasElem.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    if (UI && UI.showToast)
      UI.showToast("Draw a path! Release to finish. Esc to cancel.");
  });
}
