// public/auto-generator.js
// Improved auto-generator for parkour route side-polygons
// - Adaptive radius based on distance to path (prevents path-clearance rejections)
// - Smart nudging and sliding of candidate centers
// - Left / Right sequential placement
// - Concave splitting via splitConvex.js
// - Exports helpers for debugging

import State from "./state.js";
import { calculatePolygonCenter } from "./utils-client.js";
import { splitConcaveIntoConvex } from "./splitConvex.js";

// CONFIG - tweak these as needed
const MIN_VERTICES = 3;
const MAX_VERTICES = 9;
const MIN_POLY_AREA = 16; // avoid tiny polys
const MAX_POLY_AREA = 140;
const GRID_SIZE = 48;
const MAX_POLYGONS = 150;
const MAX_PLACEMENT_ATTEMPTS = 18;
const EXTRA_CLEARANCE_MIN = 50;
const EXTRA_CLEARANCE_MAX = 100;
const CANVAS_MARGIN = 48; // but we allow a small margin outside
const RELAX_STEP = 0.9; // used to relax radius bounds progressively if stuck

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// PUBLIC
export function generate() {
  console.clear();
  console.log("--- AUTO GENERATOR START ---");

  State.set("generatedPath", null);

  const spawn = State.get("spawnCircle");
  const cz = State.get("capZone");
  const canvas = document.getElementById("canvas");
  if (!spawn || !cz || !canvas) {
    console.error("Generator: missing spawn/cz/canvas");
    return null;
  }

  const startPoint = { x: spawn.x, y: spawn.y };
  const endPoint = { x: cz.x + cz.width / 2, y: cz.y + cz.height / 2 };
  const bounds = { width: canvas.width, height: canvas.height };

  const spawnDiameter = spawn.diameter || 18;
  const extra =
    EXTRA_CLEARANCE_MIN +
    Math.random() * (EXTRA_CLEARANCE_MAX - EXTRA_CLEARANCE_MIN);
  const minPathClearance = spawnDiameter + extra; // required clearance from route to any polygon
  const maxAllowedGap = Math.max(8, spawnDiameter - 5); // adjacent polygons must be within this

  console.group("Config");
  console.log(
    "spawnDiameter:",
    spawnDiameter,
    "extra:",
    Math.round(extra),
    "minPathClearance:",
    Math.round(minPathClearance),
    "maxAllowedGap:",
    Math.round(maxAllowedGap),
  );
  console.groupEnd();

  // 1) Generate path
  console.group("Path generation");
  const path = generatePathGrid(startPoint, endPoint, bounds, GRID_SIZE);
  if (!path) {
    console.error("Generator: failed to generate path");
    console.groupEnd();
    return null;
  }
  console.log("Path length:", path.length);
  console.groupEnd();

  State.set("generatedPath", path);

  // 2) Placement
  console.group("Polygon generation");
  const placedAbs = []; // absolute vertex lists for collision checks
  const outputPolys = []; // final objects (center + relative verts)

  // place polygons on one side sequentially with lookahead
  function placeSide(sideSign, sideName) {
    console.group(`Placing side ${sideName}`);
    let prevPoly = null;
    let idx = 0;
    const lookahead = 6;

    while (idx < path.length - 1 && outputPolys.length < MAX_POLYGONS) {
      let placedThisIdx = false;

      for (
        let look = 0;
        look <= lookahead && idx + look < path.length - 1 && !placedThisIdx;
        look++
      ) {
        const i = idx + look;
        const p1 = path[i],
          p2 = path[i + 1];
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const sampleCount = Math.max(1, Math.min(3, Math.floor(segLen / 28)));

        for (
          let sampleIdx = 0;
          sampleIdx < sampleCount && !placedThisIdx;
          sampleIdx++
        ) {
          const t = (sampleIdx + 0.5) / sampleCount;
          const mid = {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
          };
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const normal = angle + (sideSign * Math.PI) / 2;
          const segDir = { x: Math.cos(angle), y: Math.sin(angle) };

          // multiple attempts per sample
          let attempt = 0;
          let relaxedRadiusFactor = 1.0;

          for (
            ;
            attempt < MAX_PLACEMENT_ATTEMPTS && !placedThisIdx;
            attempt++
          ) {
            // Desired area biased towards medium sizes
            const targetArea =
              MIN_POLY_AREA +
              Math.pow(Math.random(), 0.7) * (MAX_POLY_AREA - MIN_POLY_AREA);
            const targetR = Math.sqrt(targetArea / Math.PI);

            // initial center offset from the route (base offset)
            const baseOffset =
              minPathClearance + targetR * 0.6 + (4 + Math.random() * 12);

            // occasionally try sliding further or closer along normal slightly
            const offsetSlack = (attempt % 3) * (4 + Math.random() * 8);
            const center = {
              x:
                mid.x +
                Math.cos(normal) *
                  (baseOffset + offsetSlack * (attempt % 2 === 0 ? 1 : -1)),
              y:
                mid.y +
                Math.sin(normal) *
                  (baseOffset + offsetSlack * (attempt % 2 === 0 ? 1 : -1)),
            };

            // bounding: keep inside canvas margin
            if (
              center.x < -CANVAS_MARGIN ||
              center.y < -CANVAS_MARGIN ||
              center.x > bounds.width + CANVAS_MARGIN ||
              center.y > bounds.height + CANVAS_MARGIN
            ) {
              continue;
            }

            // compute center's distance to path (d_center)
            const dCenter = minDistancePointToPath(center, path);

            // maximum allowed radial extent so that closest polygon point stays >= minPathClearance
            const maxAllowedRadial = dCenter - minPathClearance;
            if (maxAllowedRadial <= 3) {
              // too close to path; try sliding along segment direction a bit
              // small nudge along direction (both ways)
              const nudges = [
                { x: center.x + segDir.x * 12, y: center.y + segDir.y * 12 },
                { x: center.x - segDir.x * 12, y: center.y - segDir.y * 12 },
              ];
              let nudged = false;
              for (const n of nudges) {
                const dC2 = minDistancePointToPath(n, path);
                if (dC2 - minPathClearance > 3) {
                  center.x = n.x;
                  center.y = n.y;
                  nudged = true;
                  break;
                }
              }
              if (!nudged) {
                // can't place here
                continue;
              }
            }

            // set allowed radius range for this center
            let minR = Math.max(4, targetR * 0.45);
            let maxR = Math.max(
              minR + 1,
              Math.min(
                targetR * 1.8 * relaxedRadiusFactor,
                maxAllowedRadial * 0.98,
              ),
            );
            if (maxR < minR) {
              // too restrictive - try to relax progressively
              relaxedRadiusFactor *= RELAX_STEP;
              if (relaxedRadiusFactor < 0.35) {
                // give up this center and try another center/offset
                continue;
              } else {
                // continue to next attempt with relaxed factor
                continue;
              }
            }

            // Build polygon with radii constrained by minR..maxR and moderate angular jitter
            const polyAbs = buildRandomPoly(center, minR, maxR);

            // quick area check
            const areaNow = polygonAreaAbs(polyAbs);
            if (areaNow < MIN_POLY_AREA || areaNow > MAX_POLY_AREA * 1.35) {
              // try smaller/larger poly by adjusting relaxed factor
              relaxedRadiusFactor *= RELAX_STEP;
              continue;
            }

            // Full clearance check: polygon must be >= minPathClearance from all path segments
            const dToPathPoly = minDistancePolyToPath(polyAbs, path);
            if (dToPathPoly < minPathClearance - 0.001) {
              // too close — attempt to shrink by relaxing and retry
              relaxedRadiusFactor *= RELAX_STEP;
              continue;
            }

            // overlap checks with placed polygons
            let collision = false;
            for (let k = 0; k < placedAbs.length; k++) {
              if (polygonsIntersectGeneral(polyAbs, placedAbs[k])) {
                collision = true;
                break;
              }
            }
            if (collision) {
              // try nudging along normal +/- and along segment slightly
              const slideOffsets = [8, -8, 18, -18];
              let foundSlide = false;
              for (const s of slideOffsets) {
                const slidCenter = {
                  x: center.x + Math.cos(normal) * s,
                  y: center.y + Math.sin(normal) * s,
                };
                const slidPoly = translatePoly(
                  polyAbs,
                  slidCenter.x - center.x,
                  slidCenter.y - center.y,
                );
                if (
                  !polygonsIntersectAny(slidPoly, placedAbs) &&
                  minDistancePolyToPath(slidPoly, path) >= minPathClearance
                ) {
                  // accept slid version
                  polyAbs.forEach((p, j) => {
                    p.x = slidPoly[j].x;
                    p.y = slidPoly[j].y;
                  });
                  foundSlide = true;
                  break;
                }
              }
              if (!foundSlide) {
                // give up this attempt
                continue;
              }
            }

            // adjacency check: must be close enough to previous polygon on this side (if prev exists)
            if (prevPoly) {
              const gap = polygonDistance(prevPoly, polyAbs);
              if (gap > maxAllowedGap) {
                // try to slide closer along segment direction towards prevPoly
                const towardPrev = {
                  x: calculatePolygonCenter(prevPoly).x - center.x,
                  y: calculatePolygonCenter(prevPoly).y - center.y,
                };
                const normTow = normalizeVec(towardPrev);
                const slidCenter = {
                  x: center.x + normTow.x * Math.min(18, gap),
                  y: center.y + normTow.y * Math.min(18, gap),
                };
                const slidPoly = translatePoly(
                  polyAbs,
                  slidCenter.x - center.x,
                  slidCenter.y - center.y,
                );
                if (
                  polygonDistance(prevPoly, slidPoly) <= maxAllowedGap &&
                  !polygonsIntersectAny(slidPoly, placedAbs) &&
                  minDistancePolyToPath(slidPoly, path) >= minPathClearance
                ) {
                  polyAbs.forEach((p, j) => {
                    p.x = slidPoly[j].x;
                    p.y = slidPoly[j].y;
                  });
                } else {
                  // fail adjacency: try next attempt
                  continue;
                }
              }
            } else {
              // first poly on this side: also ensure not too far from spawn (bounded)
              const spawnCircle = {
                x: spawn.x,
                y: spawn.y,
                r: spawnDiameter / 2,
              };
              const gapToSpawn = minDistancePolyToCircle(polyAbs, spawnCircle);
              if (gapToSpawn > maxAllowedGap * 4) {
                // too far from spawn, try moving closer
                const towardSpawn = {
                  x: spawn.x - center.x,
                  y: spawn.y - center.y,
                };
                const nudged = {
                  x:
                    center.x +
                    normalizeVec(towardSpawn).x * Math.min(28, gapToSpawn),
                  y:
                    center.y +
                    normalizeVec(towardSpawn).y * Math.min(28, gapToSpawn),
                };
                const nudgedPoly = translatePoly(
                  polyAbs,
                  nudged.x - center.x,
                  nudged.y - center.y,
                );
                if (
                  minDistancePolyToPath(nudgedPoly, path) >= minPathClearance &&
                  !polygonsIntersectAny(nudgedPoly, placedAbs)
                ) {
                  polyAbs.forEach((p, j) => {
                    p.x = nudgedPoly[j].x;
                    p.y = nudgedPoly[j].y;
                  });
                } else {
                  continue;
                }
              }
            }

            // Concavity split and validate pieces
            const shapeToSplit = { v: polyAbs.map((p) => [p.x, p.y]) };
            const convexPieces = splitConcaveIntoConvex(shapeToSplit) || [];
            if (convexPieces.length === 0) {
              continue;
            }
            const absPieces = convexPieces.map((cp) =>
              cp.v.map((pt) => ({ x: pt[0], y: pt[1] })),
            );

            // Validate pieces (no piece may violate path clearance or overlap)
            let anyBadPiece = false;
            for (const piece of absPieces) {
              if (
                minDistancePolyToPath(piece, path) <
                minPathClearance - 0.001
              ) {
                anyBadPiece = true;
                break;
              }
              for (const other of placedAbs) {
                if (polygonsIntersectGeneral(piece, other)) {
                  anyBadPiece = true;
                  break;
                }
              }
              if (polygonAreaAbs(piece) < MIN_POLY_AREA * 0.5) {
                anyBadPiece = true;
                break;
              }
            }
            if (anyBadPiece) {
              continue;
            }

            // commit pieces
            for (const piece of absPieces) {
              placedAbs.push(piece);
              const centerFinal = calculatePolygonCenter(piece);
              const relVerts = piece.map((pt) => ({
                x: pt.x - centerFinal.x,
                y: pt.y - centerFinal.y,
              }));
              outputPolys.push({ v: relVerts, c: centerFinal });
              prevPoly = piece;
            }

            console.log(
              `slot ${i} sample ${sampleIdx} attempt ${attempt} ACCEPTED (${absPieces.length} pieces)`,
            );
            placedThisIdx = true;
          } // attempts
        } // samples
      } // lookahead

      if (!placedThisIdx) {
        console.log(`index ${idx} FAILED to place; advancing index`);
        idx += 1;
        prevPoly = null; // reset adjacency chain if we skip
      } else {
        idx += 1;
      }
    } // while
    console.groupEnd();
  }

  placeSide(-1, "left");
  placeSide(+1, "right");

  console.log("Placed polygons:", outputPolys.length);
  console.groupEnd();

  // finalize objects
  const objects = outputPolys.map((p, i) => ({
    id: `gen-${Date.now()}-${i}`,
    type: "poly",
    v: p.v,
    c: p.c,
  }));
  State.set("generatedPath", path);


  console.log("--- AUTO GENERATOR END ---");
  return objects;
}

// ----------------------- PATH HELPERS (unchanged, slightly cleaned) -----------------------
function generatePathGrid(start, end, bounds, gridSize = 48) {
  const GRID = gridSize;
  const gridW = Math.max(2, Math.floor(bounds.width / GRID));
  const gridH = Math.max(2, Math.floor(bounds.height / GRID));
  const toCell = (p) => ({
    x: clamp(Math.floor(p.x / GRID), 0, gridW - 1),
    y: clamp(Math.floor(p.y / GRID), 0, gridH - 1),
  });
  const fromCellCenter = (c) => ({
    x: c.x * GRID + GRID / 2,
    y: c.y * GRID + GRID / 2,
  });

  const startCell = toCell(start),
    endCell = toCell(end);
  if (startCell.x === endCell.x && startCell.y === endCell.y)
    return [start, end];

  const visited = new Set();
  const stack = [startCell];
  visited.add(cellKey(startCell));
  const EXPLORE_BIAS = 0.65;
  const maxIter = gridW * gridH * 12;
  let it = 0;

  while (stack.length > 0 && it++ < maxIter) {
    const cur = stack[stack.length - 1];
    if (cur.x === endCell.x && cur.y === endCell.y) break;
    const neighbors = getNeighbors(cur, gridW, gridH).filter(
      (n) => !visited.has(cellKey(n)),
    );
    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }
    neighbors.sort(
      (a, b) =>
        Math.hypot(a.x - endCell.x, a.y - endCell.y) -
        Math.hypot(b.x - endCell.x, b.y - endCell.y),
    );
    const pick =
      Math.random() < EXPLORE_BIAS
        ? neighbors[Math.floor(Math.random() * neighbors.length)]
        : neighbors[0];
    visited.add(cellKey(pick));
    stack.push(pick);
  }

  if (
    stack.length === 0 ||
    stack[stack.length - 1].x !== endCell.x ||
    stack[stack.length - 1].y !== endCell.y
  ) {
    // fallback greedy walk
    let g = startCell;
    const gvis = new Set([cellKey(g)]);
    const gpath = [g];
    let gIt = 0;
    while (
      (g.x !== endCell.x || g.y !== endCell.y) &&
      gIt++ < gridW * gridH * 4
    ) {
      const cand = getNeighbors(g, gridW, gridH).filter(
        (n) => !gvis.has(cellKey(n)),
      );
      if (!cand.length) break;
      cand.sort(
        (a, b) =>
          Math.hypot(a.x - endCell.x, a.y - endCell.y) -
          Math.hypot(b.x - endCell.x, b.y - endCell.y),
      );
      g = cand[0];
      gvis.add(cellKey(g));
      gpath.push(g);
    }
    if (g.x === endCell.x && g.y === endCell.y) {
      const pts = gpath.map((c) => {
        const base = fromCellCenter(c);
        const jitter = GRID * 0.28;
        return {
          x: clamp(base.x + (Math.random() - 0.5) * jitter, 0, bounds.width),
          y: clamp(base.y + (Math.random() - 0.5) * jitter, 0, bounds.height),
        };
      });
      pts[0] = start;
      pts[pts.length - 1] = end;
      return pts;
    }
    console.warn("generatePathGrid: DFS and greedy failed.");
    return null;
  }

  const pts = stack.map((c) => {
    const base = fromCellCenter(c);
    const jitter = GRID * 0.28;
    return {
      x: clamp(base.x + (Math.random() - 0.5) * jitter, 0, bounds.width),
      y: clamp(base.y + (Math.random() - 0.5) * jitter, 0, bounds.height),
    };
  });
  pts[0] = start;
  pts[pts.length - 1] = end;
  return pts;
}

function getNeighbors(cell, gridW, gridH) {
  const cand = [
    { x: cell.x, y: cell.y - 1 },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y - 1 },
    { x: cell.x + 1, y: cell.y + 1 },
    { x: cell.x - 1, y: cell.y + 1 },
    { x: cell.x + 1, y: cell.y - 1 },
  ];
  return cand.filter((n) => n.x >= 0 && n.x < gridW && n.y >= 0 && n.y < gridH);
}
function cellKey(c) {
  return `${c.x},${c.y}`;
}

// ----------------------- POLYGON BUILD & UTILITIES -----------------------
function buildRandomPoly(center, minR, maxR) {
  // choose vertex count biased to medium
  const numVertices =
    MIN_VERTICES +
    Math.floor(Math.random() * (MAX_VERTICES - MIN_VERTICES + 1));
  // compute base angles evenly spaced then jitter
  const baseAngles = [];
  for (let i = 0; i < numVertices; i++) {
    baseAngles.push((i / numVertices) * Math.PI * 2);
  }
  const verts = [];
  for (let i = 0; i < numVertices; i++) {
    // smaller jitter to avoid crazy concavity; give some irregularity in radius
    const jitter = (Math.random() - 0.5) * 0.45;
    const a = baseAngles[i] + jitter;
    // radius sampled between minR and maxR but biased toward middle
    const r = minR + Math.pow(Math.random(), 0.8) * (maxR - minR);
    verts.push({
      x: center.x + Math.cos(a) * r,
      y: center.y + Math.sin(a) * r,
    });
  }

  // sort by angle about centroid to keep polygon valid
  const centroid = calculatePolygonCenter(verts);
  verts.sort(
    (A, B) =>
      Math.atan2(A.y - centroid.y, A.x - centroid.x) -
      Math.atan2(B.y - centroid.y, B.x - centroid.x),
  );
  return verts;
}

function translatePoly(poly, dx, dy) {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function polygonsIntersectAny(poly, list) {
  for (let i = 0; i < list.length; i++) {
    if (polygonsIntersectGeneral(poly, list[i])) return true;
  }
  return false;
}

function normalizeVec(v) {
  const L = Math.hypot(v.x || v[0], v.y || v[1]);
  if (L === 0) return { x: 0, y: 0 };
  return { x: (v.x || v[0]) / L, y: (v.y || v[1]) / L };
}

// ----------------------- GEOMETRY FUNCTIONS --------------------------------
function polygonAreaAbs(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function minDistancePointToPath(pt, path) {
  let minD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    minD = Math.min(minD, pointToSegmentDistance(pt, path[i], path[i + 1]));
  }
  return minD;
}

function minDistancePolyToPath(polyAbsVerts, path) {
  let minD = Infinity;
  // A polygon's distance to a path is min of distances from its vertices to the path segments
  for (const vert of polyAbsVerts) {
    for (let i = 0; i < path.length - 1; i++) {
      minD = Math.min(minD, pointToSegmentDistance(vert, path[i], path[i + 1]));
    }
  }
  return minD;
}

function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = clamp(t, 0, 1);
  const projx = a.x + dx * t,
    projy = a.y + dy * t;
  return Math.hypot(p.x - projx, p.y - projy);
}

function minDistancePolyToCircle(polyAbsVerts, circle) {
  let minD = Infinity;
  for (let j = 0; j < polyAbsVerts.length; j++) {
    const a = polyAbsVerts[j],
      b = polyAbsVerts[(j + 1) % polyAbsVerts.length];
    const d = pointToSegmentDistance({ x: circle.x, y: circle.y }, a, b);
    minD = Math.min(minD, Math.max(0, d - circle.r));
  }
  // If circle center inside polygon => distance 0
  if (pointInPolygon({ x: circle.x, y: circle.y }, polyAbsVerts)) return 0;
  return minD;
}

function segmentsIntersect(a, b, c, d) {
  function orient(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }
  function onSeg(p, q, r) {
    return (
      Math.min(p.x, r.x) <= q.x &&
      q.x <= Math.max(p.x, r.x) &&
      Math.min(p.y, r.y) <= q.y &&
      q.y <= Math.max(p.y, r.y)
    );
  }
  const o1 = orient(a, b, c),
    o2 = orient(a, b, d),
    o3 = orient(c, d, a),
    o4 = orient(c, d, b);
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return o1 > 0 != o2 > 0 && o3 > 0 != o4 > 0;
}

function pointInPolygon(pt, vs) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x,
      yi = vs[i].y,
      xj = vs[j].x,
      yj = vs[j].y;
    const intersect =
      yi > pt.y != yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonsIntersectGeneral(A, B) {
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i],
      a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b1 = B[j],
        b2 = B[(j + 1) % B.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  if (A.length && pointInPolygon(A[0], B)) return true;
  if (B.length && pointInPolygon(B[0], A)) return true;
  return false;
}

function polygonDistance(A, B) {
  let minD = Infinity;
  for (let i = 0; i < A.length; i++) {
    const p = A[i];
    for (let j = 0; j < B.length; j++) {
      const q1 = B[j],
        q2 = B[(j + 1) % B.length];
      minD = Math.min(minD, pointToSegmentDistance(p, q1, q2));
    }
  }
  for (let i = 0; i < B.length; i++) {
    const p = B[i];
    for (let j = 0; j < A.length; j++) {
      const q1 = A[j],
        q2 = A[(j + 1) % A.length];
      minD = Math.min(minD, pointToSegmentDistance(p, q1, q2));
    }
  }
  return minD;
}

// exports for debugging
export {
  polygonsIntersectGeneral as _polygonsIntersectGeneral,
  polygonDistance as _polygonDistance,
  generatePathGrid as _generatePathGrid,
};
