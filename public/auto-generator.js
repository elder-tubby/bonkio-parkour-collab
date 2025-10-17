// --- Replacement generator + helpers for auto-generator.js ---
// Assumes these imports remain at top of file:
import State from "./state.js";
import { calculatePolygonCenter, polygonArea as polygonAreaImported } from "./utils-client.js";
import { splitConcaveIntoConvex } from "./splitConvex.js";

/* Tuning constants (adjust as needed) */
const GRID_COLS = 18;
const GRID_ROWS = 12;
const MAX_POLYGONS = 100;
const MIN_VERTICES = 3;
const MAX_VERTICES = 9;

const MIN_POLY_AREA = 10.0;
const MAX_POLY_AREA = 30.0;

const L_MIN_GLOBAL = 5.0;
const L_MAX_GLOBAL = 12.0;
const REACH_FACTOR = 1.10;       // local reach multiplier
const MAX_FULL_RETRIES = 4;      // keep small; we now repair locally instead of full regen
const MAX_CENTER_TRIES = 8;
const CENTER_COLLIDE_FACTOR = 0.9;

function polygonAreaLocal(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return 0.5 * a;
}
const polygonArea = typeof polygonAreaImported === "function" ? polygonAreaImported : polygonAreaLocal;

/* ---------- Main generate (drop-in) ---------- */
export function generate() {
  console.clear();
  console.log("=== AUTO GENERATOR START (robust) ===");

  const spawn = State.get("spawnCircle");
  const cz = State.get("capZone");
  const canvas = document.getElementById("canvas");
  if (!spawn || !cz || !canvas) {
    console.error("Generator: missing spawn/cz/canvas");
    return null;
  }
  const bounds = { width: canvas.width, height: canvas.height };
  const startPt = { x: spawn.x, y: spawn.y };
  const endPt = { x: cz.x + cz.width / 2, y: cz.y + cz.height / 2 };

  const grid = makeGrid(bounds, GRID_COLS, GRID_ROWS);

  // Try a few full attempts; but we will repair locally and accept best-effort layout
  for (let attemptFull = 0; attemptFull < MAX_FULL_RETRIES; attemptFull++) {
    console.log(`Full generation attempt ${attemptFull + 1}/${MAX_FULL_RETRIES}`);

    // 1) Maze & diameter path
    const maze = buildMaze(grid.cols, grid.rows);
    const pathCells = mazeDiameterPath(maze);
    if (!pathCells || pathCells.length < 2) {
      console.warn("Diameter path too short; retrying");
      continue;
    }
    // Convert cells -> world points, small jitter
    const pathWorld = pathCells.map(ci => {
      const p = cellToWorld(ci, grid);
      const jitterX = (Math.random() - 0.5) * 0.25 * grid.cellW;
      const jitterY = (Math.random() - 0.5) * 0.25 * grid.cellH;
      return { x: clamp(p.x + jitterX, 0, bounds.width), y: clamp(p.y + jitterY, 0, bounds.height) };
    });
    // Anchor endpoints to real spawn/capzone
    pathWorld[0] = startPt;
    pathWorld[pathWorld.length - 1] = endPt;

    State.set("generatedPath", pathWorld); // set generated path immediately as you asked

    // 2) Place platform polygons along the path (with local anti-shortcut checks)
    const placement = placePlatformPolygonsAlongPath(pathWorld, bounds, grid);
    if (!placement) {
      console.warn("Placement failed this attempt; trying again");
      continue;
    }
    let { polygons: outPolys, centers } = placement; // centers are objects {x,y,localL}

    console.log(`Placed ${outPolys.length} polygons; now checking/resolving shortcuts`);

    // 3) Detect & resolve residual shortcut pairs (nudge/remove)
    const pairs = detectShortcutPairs(centers);
    if (pairs.length > 0) {
      console.log(`Initial shortcut pairs: ${pairs.length}. Attempting local resolution.`);
      const resolved = resolveShortcutPairs({ polygons: outPolys, centers }, bounds, grid);
      outPolys = resolved.polygons;
      centers = resolved.centers;
      console.log(`After resolution: polygons=${outPolys.length}, centers=${centers.length}`);
    } else {
      console.log("No initial shortcut pairs found");
    }

    // final verification (conservative)
    const remaining = detectShortcutPairs(centers);
    if (remaining.length > 0) {
      console.warn(`Unresolved shortcut pairs remain (${remaining.length}). Will still accept layout as best-effort.`);
    }

    // Save final result and return (best-effort)
    State.set("generatedPolygons", outPolys);
    State.set("generatedPath", pathWorld);
    console.log("=== AUTO GENERATOR DONE (accepted best-effort) ===");
    return outPolys;
  } // attempts

  console.error("Failed to generate acceptable layout after full attempts");
  return null;
}

/* ================= Helpers ================= */

/* grid helpers */
function makeGrid(bounds, cols, rows) {
  return { cols, rows, cellW: bounds.width / cols, cellH: bounds.height / rows, bounds };
}
function cellToWorld(cellIdx, grid) {
  const c = cellIdx % grid.cols; const r = Math.floor(cellIdx / grid.cols);
  return { x: (c + 0.5) * grid.cellW, y: (r + 0.5) * grid.cellH };
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* Maze generation as before (perfect maze using DFS) */
function buildMaze(cols, rows) {
  const N = cols * rows;
  const adj = Array.from({ length: N }, () => new Set());
  const visited = new Array(N).fill(false);
  const stack = [0];
  visited[0] = true;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cc = cur % cols, rr = Math.floor(cur / cols);
    const cand = [];
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dc,dr]) => {
      const nc = cc + dc, nr = rr + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) cand.push(nr * cols + nc);
    });
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]];
    }
    let adv = false;
    for (const n of cand) {
      if (!visited[n]) { visited[n] = true; adj[cur].add(n); adj[n].add(cur); stack.push(n); adv = true; break; }
    }
    if (!adv) stack.pop();
  }
  return { cols, rows, adj };
}
function mazeDiameterPath(maze) {
  const N = maze.cols * maze.rows;
  const nodes = [...Array(N).keys()];
  const bfs = (start) => {
    const dist = new Array(N).fill(-1), parent = new Array(N).fill(-1), q = [start];
    dist[start] = 0;
    for (let i = 0; i < q.length; i++) {
      const u = q[i];
      for (const v of maze.adj[u]) if (dist[v] === -1) { dist[v] = dist[u] + 1; parent[v] = u; q.push(v); }
    }
    let far = start;
    for (const n of nodes) if (dist[n] > dist[far]) far = n;
    return { far, dist, parent };
  };
  const a = bfs(0), b = bfs(a.far);
  const path = []; let cur = b.far;
  while (cur !== -1) { path.push(cur); cur = b.parent[cur]; }
  path.reverse(); return path;
}

/* poly helpers */
function pointAtSegment(a, b, t01) { const t = clamp(t01, 0, 1); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function smallPerpJitter(a, b, mag) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) + 1e-9;
  const nx = -dy / L, ny = dx / L; const r = (Math.random() - 0.5) * 2 * mag;
  return { x: nx * r, y: ny * r };
}
function isPointInBounds(p, bounds) { return p.x >= 0 && p.x <= bounds.width && p.y >= 0 && p.y <= bounds.height; }
function polyWithinBounds(poly, bounds) { for (const v of poly) if (!isPointInBounds(v, bounds)) return false; return true; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function estimateMinCenterSeparation(area) { const r = Math.sqrt(area / Math.PI); return r * 2.2; }
function computeCentroid(poly) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const cross = poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    A += cross; cx += (poly[i].x + poly[j].x) * cross; cy += (poly[i].y + poly[j].y) * cross;
  }
  A *= 0.5; if (Math.abs(A) < 1e-9) return { x: poly[0].x, y: poly[0].y };
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

/* makeRandomConvexPoly: varied vertices & size to aim for target area */
function makeRandomConvexPoly(center, targetArea) {
  const n = MIN_VERTICES + Math.floor(Math.random() * (MAX_VERTICES - MIN_VERTICES + 1));
  const angles = new Array(n).fill(0).map(() => Math.random() * Math.PI * 2).sort((a,b) => a - b);
  const baseR = Math.sqrt(targetArea / Math.PI);
  const rMin = baseR * 0.65, rMax = baseR * 1.35;
  const pts = angles.map(a => { const r = rMin + Math.random() * (rMax - rMin); return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r }; });
  pts.sort((A,B) => Math.atan2(A.y - center.y, A.x - center.x) - Math.atan2(B.y - center.y, B.x - center.x));
  const rawArea = Math.abs(polygonArea(pts));
  if (rawArea <= 1e-6) {
    const w = Math.sqrt(targetArea), h = Math.sqrt(targetArea) * 0.9;
    return [{x:center.x-w/2,y:center.y-h/2},{x:center.x+w/2,y:center.y-h/2},{x:center.x+w/2,y:center.y+h/2},{x:center.x-w/2,y:center.y+h/2}];
  }
  const scale = Math.sqrt(targetArea / rawArea);
  return pts.map(p => ({ x: center.x + (p.x - center.x) * scale, y: center.y + (p.y - center.y) * scale }));
}

/* ---------------- placePlatformPolygonsAlongPath (with local anti-shortcut check) ---------------- */
function placePlatformPolygonsAlongPath(path, bounds, grid) {
  const outPolys = [];
  const centers = []; // {x,y,localL} per placed polygon (one per piece - we keep mapping 1:1)
  let acc = 0;
  let L = L_MIN_GLOBAL + Math.random() * (L_MAX_GLOBAL - L_MIN_GLOBAL);

  for (let segI = 0; segI < path.length - 1 && outPolys.length < MAX_POLYGONS; segI++) {
    const a = path[segI], b = path[segI + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const step = Math.min(1.0, segLen / 4.0);
    let t = 0;
    while (t < segLen && outPolys.length < MAX_POLYGONS) {
      const cur = pointAtSegment(a, b, t / segLen);
      acc += step;
      if (acc >= L) {
        const perp = smallPerpJitter(a, b, Math.min(0.25 * L, Math.max(grid.cellW, grid.cellH) * 0.45));
        let candidate = { x: clamp(cur.x + perp.x, 0, bounds.width), y: clamp(cur.y + perp.y, 0, bounds.height) };
        const targetArea = MIN_POLY_AREA + Math.random() * (MAX_POLY_AREA - MIN_POLY_AREA);

        let placed = false;
        for (let attempt = 0; attempt < MAX_CENTER_TRIES && !placed; attempt++) {
          const candidateCenter = attempt === 0 ? candidate : jitterCenter(candidate, attempt, grid);
          if (!isPointInBounds(candidateCenter, bounds)) continue;

          // quick center collision test
          const minSep = estimateMinCenterSeparation(targetArea);
          let coll = false;
          for (const pc of centers) if (dist(pc, candidateCenter) < minSep * CENTER_COLLIDE_FACTOR) { coll = true; break; }
          if (coll) continue;

          // local shortcut prevention vs all previously placed centers (non-adjacent only)
          const candidateL = L;
          let createsShortcut = false;
          for (let prevI = 0; prevI < centers.length; prevI++) {
            const pc = centers[prevI];
            const idxDiff = Math.abs(centers.length - prevI);
            if (idxDiff <= 1) continue;
            const localReach = REACH_FACTOR * Math.min(candidateL, pc.localL || candidateL);
            if (dist(pc, candidateCenter) <= localReach) { createsShortcut = true; break; }
          }
          if (createsShortcut) continue;

          // build polygon and ensure within bounds
          const rawPoly = makeRandomConvexPoly(candidateCenter, targetArea);
          if (!polyWithinBounds(rawPoly, bounds)) continue;

          // split concave if needed
          let pieces = [rawPoly];
          try {
            const out = splitConcaveIntoConvex && typeof splitConcaveIntoConvex === "function" ? splitConcaveIntoConvex(rawPoly) : [rawPoly];
            if (Array.isArray(out) && out.length > 0) pieces = out;
          } catch (err) {
            pieces = [rawPoly];
          }

          // check area constraints
          let okPieces = true;
          for (const p of pieces) {
            const a2 = Math.abs(polygonArea(p));
            if (a2 < MIN_POLY_AREA - 1e-6 || a2 > MAX_POLY_AREA + 1e-6) { okPieces = false; break; }
          }
          if (!okPieces) continue;

          // Accept pieces (we append each piece as separate polygon object)
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          for (const p of pieces) {
            const centerCalc = typeof calculatePolygonCenter === "function" ? calculatePolygonCenter(p) : computeCentroid(p);
            outPolys.push({ id: `gen-${Date.now()}-${outPolys.length}`, type: "poly", v: p, center: centerCalc, scale: 1, angle: angle + ((Math.random() - 0.5) * 0.6) });
            centers.push({ x: centerCalc.x, y: centerCalc.y, localL: candidateL });
            if (outPolys.length >= MAX_POLYGONS) break;
          }
          placed = true;
        } // attempts

        // reset acc and choose new L
        acc = 0;
        L = L_MIN_GLOBAL + Math.random() * (L_MAX_GLOBAL - L_MIN_GLOBAL);
      }
      t += step;
    }
  }

  if (outPolys.length === 0) return null;
  return { polygons: outPolys, centers };
}

/* -------- detect shortcut pairs (diagnostic) --------
   Returns array of {i,j,d,localReach}
*/
function detectShortcutPairs(centers) {
  const pairs = [];
  if (!centers || centers.length < 3) return pairs;
  // compute average spacing maybe useful but we use local reach per pair
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 2; j < centers.length; j++) {
      const localReach = REACH_FACTOR * Math.min(centers[i].localL || L_MIN_GLOBAL, centers[j].localL || L_MIN_GLOBAL);
      const d = dist(centers[i], centers[j]);
      if (d <= localReach) pairs.push({ i, j, d, localReach });
    }
  }
  return pairs;
}

/* ---------- resolveShortcutPairs: nudge or remove later platform(s) ----------
   Strategy:
   - Sort pairs by d/localReach descending (worst first).
   - For each pair (i,j): try to nudge platform j away along the perpendicular to the segment joining i-j up to a few attempts.
   - After each nudge, rebuild the polygon(s) for j, re-split, and re-check area/within-bounds.
   - If nudges fail, remove platform j (both polygon and center).
*/
function resolveShortcutPairs(stateObj, bounds, grid) {
  let { polygons, centers } = stateObj;

  // Build a map from centers index -> polygon index (they correlate 1:1 as built)
  // We'll treat polygons[i] matching centers[i] (we kept that ordering)
  const maxResolveAttempts = 5;

  // Recompute pairs in loop until none left or we've tried enough times
  for (let iter = 0; iter < 10; iter++) {
    const pairs = detectShortcutPairs(centers);  
    // sort by severity: smallest ratio (d / localReach) first
    pairs.sort((A, B) => (A.d / A.localReach) - (B.d / B.localReach));
    let anyChange = false;
    for (const pair of pairs) {
      // if indices shifted out-of-range due to prior removals, skip
      if (pair.i >= centers.length || pair.j >= centers.length) continue;
      const i = pair.i, j = pair.j;
      console.log(`Resolving shortcut between ${i} and ${j} (d=${pair.d.toFixed(2)} reach=${pair.localReach.toFixed(2)})`);

      let resolved = false;
      // attempt to nudge j away
      for (let a = 0; a < maxResolveAttempts && !resolved; a++) {
        // direction from i->j
        const dir = { x: centers[j].x - centers[i].x, y: centers[j].y - centers[i].y };
        const Ldir = Math.hypot(dir.x, dir.y) + 1e-9;
        // pick perpendicular direction randomly left or right
        const px = -dir.y / Ldir, py = dir.x / Ldir;
        const mag = (a + 1) * 0.5 * Math.max(grid.cellW, grid.cellH); // increase magnitude each attempt
        const tryCenter = { x: clamp(centers[j].x + px * mag * (Math.random() > 0.5 ? 1 : -1), 0, bounds.width),
                            y: clamp(centers[j].y + py * mag * (Math.random() > 0.5 ? 1 : -1), 0, bounds.height) };

        // rebuild polygon(s) at tryCenter with same localL and area (approx)
        const origLocalL = centers[j].localL || L_MIN_GLOBAL;
        const targetArea = MIN_POLY_AREA + Math.random() * (MAX_POLY_AREA - MIN_POLY_AREA);
        const rawPoly = makeRandomConvexPoly(tryCenter, targetArea);
        if (!polyWithinBounds(rawPoly, bounds)) continue;
        let pieces = [rawPoly];
        try {
          const out = splitConcaveIntoConvex && typeof splitConcaveIntoConvex === "function" ? splitConcaveIntoConvex(rawPoly) : [rawPoly];
          if (Array.isArray(out) && out.length > 0) pieces = out;
        } catch (err) { pieces = [rawPoly]; }

        // verify area
        let okPieces = true;
        for (const p of pieces) {
          const a2 = Math.abs(polygonArea(p));
          if (a2 < MIN_POLY_AREA - 1e-6 || a2 > MAX_POLY_AREA + 1e-6) { okPieces = false; break; }
        }
        if (!okPieces) continue;

        // check new center doesn't collide or create shortcuts vs others
        const newCenter = typeof calculatePolygonCenter === "function" ? calculatePolygonCenter(pieces[0]) : computeCentroid(pieces[0]);
        let bad = false;
        for (let k = 0; k < centers.length; k++) {
          if (k === j) continue;
          const idxDiff = Math.abs(k - j);
          if (idxDiff <= 1) continue; // adjacency ok
          const localReach = REACH_FACTOR * Math.min(origLocalL, centers[k].localL || origLocalL);
          if (dist(centers[k], newCenter) <= localReach) { bad = true; break; }
        }
        if (bad) continue;

        // Accept nudged polygon: replace polygons[j] and centers[j]
        const angle = (Math.random() - 0.5) * 0.6;
        polygons[j] = { id: polygons[j].id, type: "poly", v: pieces[0], center: newCenter, scale: 1, angle };
        centers[j] = { x: newCenter.x, y: newCenter.y, localL: origLocalL };
        console.log(` Nudged platform ${j} success at attempt ${a + 1}`);
        resolved = true;
        anyChange = true;
      } // nudge attempts

      if (!resolved) {
        // removal fallback: remove the later platform j
        console.log(` Removing platform ${j} to eliminate shortcut with ${i}`);
        polygons.splice(j, 1);
        centers.splice(j, 1);
        anyChange = true;
        // after removal, indexes shifted; break to recompute pairs
        break;
      }
    } // for each pair

    if (!anyChange) {
      // cannot resolve further
      break;
    }
  } // outer iter

  return { polygons, centers };
}
function jitterCenter(center, attempt, grid) {
  const mag = Math.min(grid.cellW, grid.cellH) * (0.12 + attempt * 0.14);
  return { x: clamp(center.x + (Math.random() - 0.5) * 2 * mag, 0, grid.bounds.width), y: clamp(center.y + (Math.random() - 0.5) * 2 * mag, 0, grid.bounds.height) };
}