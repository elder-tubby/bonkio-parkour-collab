// public/auto-generator-path.js
// Generates a single concave "ribbon" along a path, splits into convex pieces,
// and assigns types after splitting. Exposes two functions used by handlers.js:
// - startPathDrawing(options): Promise that resolves when user finishes drawing a path
// - generateRandomPathAndPolygons(options): synchronous (returns array) which generates
//   a random path and returns the generated polygons

import {
  splitConcaveIntoConvex,
  calculatePolygonCenter,
  polygonArea,
} from "./utils-client.js";
import UI from "./ui.js";

// --- CONFIG ---
const CONFIG = {
  objectCat1: {
    sampleCountRange: [18, 36],
    widthRange: { min: 16, max: 48 },
    stepJitterFactor: 0.45,
    widthJitter: 0.4,
    // sideSync: 1 => perfectly mirrored (old behavior). 0 => fully independent left/right samples.
    sideSync: 1.0,
    typeWeights: { none: 1, bouncy: 1, death: 1 },
  },
  maxRetries: 4,
};

// Expose updater so handlers or console can tweak behaviour safely
function safeDeepMerge(target, patch) {
  if (!patch || typeof patch !== "object") return target;
  const stack = [[target, patch]];
  while (stack.length) {
    const [t, p] = stack.pop();
    for (const key of Object.keys(p)) {
      if (key === "__proto__" || key === "constructor") continue;
      const pv = p[key];
      if (pv && typeof pv === "object" && !Array.isArray(pv)) {
        if (!t[key] || typeof t[key] !== "object" || Array.isArray(t[key]))
          t[key] = {};
        stack.push([t[key], pv]);
      } else {
        t[key] = pv;
      }
    }
  }
  return target;
}
function updatePathConfig(patch) {
  if (typeof patch === "function") {
    try {
      const res = patch(JSON.parse(JSON.stringify(CONFIG)));
      if (res && typeof res === "object") safeDeepMerge(CONFIG, res);
    } catch (e) {
      console.error(e);
    }
  } else if (patch && typeof patch === "object") {
    safeDeepMerge(CONFIG, patch);
  }
  if (typeof window !== "undefined")
    window.PATH_RIBBON_CONFIG = JSON.parse(JSON.stringify(CONFIG));
}
if (typeof window !== "undefined") {
  window.PATH_RIBBON_CONFIG = JSON.parse(JSON.stringify(CONFIG));
  window.UPDATE_PATH_RIBBON_CONFIG = updatePathConfig;
}

// ---------------- utilities ----------------
function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function orientation(a, b, c) {
  const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}
function onSegment(a, b, c) {
  return (
    Math.min(a.x, b.x) - 1e-9 <= c.x &&
    c.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= c.y &&
    c.y <= Math.max(a.y, b.y) + 1e-9
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

function polygonSelfIntersects(poly) {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === n - 1) continue;
      const b1 = poly[j];
      const b2 = poly[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

// ---------------- Path sampling helpers ----------------
function computePathLengths(path) {
  const segLengths = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x;
    const dy = path[i + 1].y - path[i].y;
    const l = Math.hypot(dx, dy);
    segLengths.push(l);
    total += l;
  }
  return { segLengths, total };
}
function tangentOfSegment(path, idx) {
  const a = path[Math.max(0, Math.min(idx, path.length - 2))];
  const b = path[Math.max(1, Math.min(idx + 1, path.length - 1))];
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
function samplePointAndTangent(path, t, segLengths, totalLength) {
  if (t <= 0) return { p: path[0], tangent: tangentOfSegment(path, 0) };
  if (t >= 1)
    return {
      p: path[path.length - 1],
      tangent: tangentOfSegment(path, path.length - 2),
    };
  const target = t * totalLength;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const l = segLengths[i];
    if (acc + l >= target) {
      const localT = (target - acc) / l;
      const a = path[i],
        b = path[i + 1];
      const px = a.x + (b.x - a.x) * localT;
      const py = a.y + (b.y - a.y) * localT;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { p: { x: px, y: py }, tangent: { x: dx / len, y: dy / len } };
    }
    acc += l;
  }
  return {
    p: path[path.length - 1],
    tangent: tangentOfSegment(path, path.length - 2),
  };
}

// ---------------- Ribbon construction ----------------
function buildRibbonPolygonFromPath(path, cfg, canvasWidth, canvasHeight) {
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
    const sampleOffset = (scaleValue) => {
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

  // leftPoints and rightPoints are monotonic along the path because we sampled t within non-overlapping intervals
  const polygon = leftPoints.concat([...rightPoints].reverse());

  // ensure in-bounds
  for (const v of polygon) {
    if (v.x < 0 || v.x > canvasWidth || v.y < 0 || v.y > canvasHeight)
      return null;
  }

  if (polygonSelfIntersects(polygon)) return null;
  return polygon;
}

// Split and assign types AFTER splitting
function splitAndAssignTypes(polygon, categoryKey) {
  if (!polygon || polygon.length < 3) return [];
  const cfg = CONFIG[categoryKey] || CONFIG.objectCat1;
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

function getRandomType(weights) {
  const safe = weights && typeof weights === "object" ? weights : { none: 1 };
  const entries = Object.entries(safe).filter(
    ([k, v]) => typeof v === "number" && v >= 0 && k !== "__proto__",
  );
  if (entries.length === 0) return "none";
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return entries[0][0] || "none";
  let r = randomFloat(0, total);
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

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

// ---------------- Public functions required by handlers.js ----------------
export function generateRandomPathAndPolygons(options = {}) {
  const canvas = UI.elems && UI.elems.canvas;
  const canvasWidth =
    options.canvasWidth ||
    (canvas && canvas.width) ||
    (typeof window !== "undefined" && window.innerWidth) ||
    1024;
  const canvasHeight =
    options.canvasHeight ||
    (canvas && canvas.height) ||
    (typeof window !== "undefined" && window.innerHeight) ||
    768;
  const categoryKey = options.categoryKey || "objectCat1";

  const path = generateRandomPath(canvasWidth, canvasHeight, options);
  let attempt = 0;
  const cfg = CONFIG[categoryKey] || CONFIG.objectCat1;
  while (attempt < CONFIG.maxRetries) {
    const polygon = buildRibbonPolygonFromPath(
      path,
      cfg,
      canvasWidth,
      canvasHeight,
    );
    if (!polygon) {
      attempt++;
      cfg.widthRange.min *= 0.85;
      cfg.widthRange.max *= 0.85;
      continue;
    }
    const pieces = splitAndAssignTypes(polygon, categoryKey);
    return pieces;
  }
  return [];
}

export function startPathDrawing(options = {}) {
  const canvasElem = UI.elems && UI.elems.canvas;
  if (!canvasElem) return Promise.reject(new Error("Canvas not available"));

  return new Promise((resolve, reject) => {
    const points = [];
    let drawing = false;

    function toLocal(evt) {
      const rect = canvasElem.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function onDown(e) {
      drawing = true;
      points.length = 0;
      points.push(toLocal(e));
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    function onMove(e) {
      if (!drawing) return;
      points.push(toLocal(e));
    }
    function onUp(e) {
      if (!drawing) return;
      drawing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cleanupListeners();
      const simplified = simplifyPoints(points, 2);
      if (simplified.length < 2)
        return reject(new Error("Not enough points drawn"));

      const canvasWidth =
        options.canvasWidth || canvasElem.width || window.innerWidth;
      const canvasHeight =
        options.canvasHeight || canvasElem.height || window.innerHeight;
      const categoryKey = options.categoryKey || "objectCat1";

      const path = chaikinSmooth(simplified, 1);
      let attempt = 0;
      const cfg = CONFIG[categoryKey] || CONFIG.objectCat1;
      while (attempt < CONFIG.maxRetries) {
        const polygon = buildRibbonPolygonFromPath(
          path,
          cfg,
          canvasWidth,
          canvasHeight,
        );
        if (!polygon) {
          attempt++;
          cfg.widthRange.min *= 0.85;
          cfg.widthRange.max *= 0.85;
          continue;
        }
        const pieces = splitAndAssignTypes(polygon, categoryKey);
        return resolve(pieces);
      }
      return reject(
        new Error("Failed to generate a valid ribbon from the drawn path"),
      );
    }

    function onKey(e) {
      if (e.key === "Escape") {
        cleanupListeners();
        reject(new Error("Drawing cancelled"));
      }
    }

    function cleanupListeners() {
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
      UI.showToast(
        "Draw a path on canvas; release mouse to finish. Press Esc to cancel.",
      );
  });
}

// default export not used; named exports are expected by handlers
