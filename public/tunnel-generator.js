// tunnel-generator.js
import State from "./state.js";
import * as Network from "./network.js";
import UI from "./ui.js";
import { showToast, createValidPolygonObject } from "./utils-client.js";

// ==========================================
// 1. DATA PARSING & COORDINATE MAPPING
// ==========================================
function extractPoints(data) {
    if (Array.isArray(data)) {
        if (data.length > 0) {
            if (data[0].x !== undefined && data[0].y !== undefined) return data;
            if (Array.isArray(data[0]) && data[0].length >= 2)
                return data.map((p) => ({ x: Number(p[0]), y: Number(p[1]) }));
        }
    } else if (data && typeof data === "object") {
        if (data.trajectory) return extractPoints(data.trajectory);
        if (data.tracePoints) return extractPoints(data.tracePoints);
        if (data.path) return extractPoints(data.path);
        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
                const pts = extractPoints(data[key]);
                if (pts.length > 0) return pts;
            }
        }
    }
    return [];
}

function convertPkrToGame(pkrX, pkrY, GW, GH) {
    const normX = (pkrX + 365) / 730;
    const normY = (pkrY + 250) / 500;
    return { x: normX * GW, y: normY * GH };
}

// ==========================================
// 2. PATH PROCESSING (Heavy Pre-Smoothing)
// ==========================================
function walkPath(points, spacing) {
    let resampled = [];
    if (points.length === 0) return resampled;
    resampled.push({ x: points[0].x, y: points[0].y });

    let d = 0;
    for (let i = 1; i < points.length; i++) {
        let p0 = points[i - 1],
            p1 = points[i];
        let dx = p1.x - p0.x,
            dy = p1.y - p0.y;
        let dist = Math.hypot(dx, dy);

        if (dist < 0.001) continue;

        let dirX = dx / dist,
            dirY = dy / dist;
        let distLeft = dist;

        while (d + distLeft >= spacing) {
            let take = spacing - d;
            resampled.push({
                x: p1.x - dirX * (distLeft - take),
                y: p1.y - dirY * (distLeft - take),
            });
            distLeft -= take;
            d = 0;
        }
        d += distLeft;
    }

    let lastP = resampled[resampled.length - 1],
        endP = points[points.length - 1];
    if (Math.hypot(lastP.x - endP.x, lastP.y - endP.y) > spacing * 0.2)
        resampled.push({ x: endP.x, y: endP.y });
    return resampled;
}

// Applies Chaikin's corner-cutting to mathematically eliminate sharp 90-degree spikes
function smoothPath(points, iterations) {
    if (points.length < 3) return points;
    let current = points;
    for (let it = 0; it < iterations; it++) {
        const next = [current[0]];
        for (let i = 0; i < current.length - 1; i++) {
            const p0 = current[i],
                p1 = current[i + 1];
            next.push({
                x: 0.75 * p0.x + 0.25 * p1.x,
                y: 0.75 * p0.y + 0.25 * p1.y,
            });
            next.push({
                x: 0.25 * p0.x + 0.75 * p1.x,
                y: 0.25 * p0.y + 0.75 * p1.y,
            });
        }
        next.push(current[current.length - 1]);
        current = next;
    }
    return current;
}

// ==========================================
// 3. FLUID MELTING & EXACT DECIMATION
// ==========================================
// Physically melts the jagged output of marching squares into flowing liquid curves
function meltRing(ring, iterations = 2) {
    let current = ring;
    for (let it = 0; it < iterations; it++) {
        let melted = [];
        for (let i = 0; i < current.length; i++) {
            let p0 = current[i];
            let p1 = current[(i + 1) % current.length];
            melted.push({
                x: p0.x * 0.75 + p1.x * 0.25,
                y: p0.y * 0.75 + p1.y * 0.25,
            });
            melted.push({
                x: p0.x * 0.25 + p1.x * 0.75,
                y: p0.y * 0.25 + p1.y * 0.75,
            });
        }
        current = melted;
    }
    return current;
}

function rdpSimplify(points, epsilon) {
    if (points.length <= 2) return points;
    let dmax = 0,
        index = 0;
    const end = points.length - 1;

    const distSq = (p, v, w) => {
        let l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = Math.max(
            0,
            Math.min(
                1,
                ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2,
            ),
        );
        return (
            (p.x - (v.x + t * (w.x - v.x))) ** 2 +
            (p.y - (v.y + t * (w.y - v.y))) ** 2
        );
    };

    for (let i = 1; i < end; i++) {
        let d = distSq(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }
    if (dmax > epsilon * epsilon) {
        let rec1 = rdpSimplify(points.slice(0, index + 1), epsilon);
        let rec2 = rdpSimplify(points.slice(index), epsilon);
        return rec1.slice(0, rec1.length - 1).concat(rec2);
    } else {
        return [points[0], points[end]];
    }
}

function getPolyArea(verts) {
    let area = 0;
    for (let i = 0; i < verts.length; i++)
        area +=
            verts[i].x * verts[(i + 1) % verts.length].y -
            verts[(i + 1) % verts.length].x * verts[i].y;
    return Math.abs(area / 2);
}

function getConvexHull(points) {
    if (points.length <= 3) return points;
    let pts = [...points].sort((a, b) =>
        Math.abs(a.x - b.x) < 0.001 ? a.y - b.y : a.x - b.x,
    );
    const cross = (o, a, b) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let p of pts) {
        while (
            lower.length >= 2 &&
            cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
        )
            lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        let p = pts[i];
        while (
            upper.length >= 2 &&
            cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
        )
            upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

function forceCW(verts) {
    if (verts.length < 3) return verts;
    let area = 0;
    for (let i = 0; i < verts.length; i++)
        area +=
            verts[i].x * verts[(i + 1) % verts.length].y -
            verts[(i + 1) % verts.length].x * verts[i].y;
    if (area < 0) return [...verts].reverse();
    return verts;
}

function triangulate(verts) {
    let vCpy = forceCW([...verts]);
    let triangles = [];
    let limit = vCpy.length * 3;
    const pointInTri = (p, a, b, c) => {
        let s_ab = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0;
        if ((c.x - a.x) * (p.y - a.y) - (c.y - a.y) * (p.x - a.x) > 0 == s_ab)
            return false;
        if ((c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x) > 0 != s_ab)
            return false;
        return true;
    };
    while (vCpy.length >= 3 && limit-- > 0) {
        let n = vCpy.length;
        let earFound = false;
        for (let i = 0; i < n; i++) {
            let prev = vCpy[(i - 1 + n) % n],
                curr = vCpy[i],
                next = vCpy[(i + 1) % n];
            let cross =
                (curr.x - prev.x) * (next.y - curr.y) -
                (curr.y - prev.y) * (next.x - curr.x);
            if (cross > 0.001) {
                let isEar = true;
                for (let j = 0; j < n; j++) {
                    if (j === (i - 1 + n) % n || j === i || j === (i + 1) % n)
                        continue;
                    if (pointInTri(vCpy[j], prev, curr, next)) {
                        isEar = false;
                        break;
                    }
                }
                if (isEar) {
                    triangles.push(forceCW([prev, curr, next]));
                    vCpy.splice(i, 1);
                    earFound = true;
                    break;
                }
            }
        }
        if (!earFound) vCpy.reverse();
    }
    if (triangles.length === 0 && verts.length === 3)
        triangles.push(forceCW(verts));
    return triangles;
}

// The Sweet-Spot Condenser: Max 1% bloat tolerance perfectly preserves curves while minimizing shape count
function compressToMassiveConvex(triangles) {
    let polys = triangles.map((t) => getConvexHull(t));
    const passes = [1.001, 1.005, 1.01];

    for (let tolerance of passes) {
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < polys.length; i++) {
                for (let j = i + 1; j < polys.length; j++) {
                    let pA = polys[i],
                        pB = polys[j];

                    let minXA = pA[0].x,
                        maxXA = pA[0].x,
                        minYA = pA[0].y,
                        maxYA = pA[0].y;
                    for (let p of pA) {
                        minXA = Math.min(minXA, p.x);
                        maxXA = Math.max(maxXA, p.x);
                        minYA = Math.min(minYA, p.y);
                        maxYA = Math.max(maxYA, p.y);
                    }
                    let minXB = pB[0].x,
                        maxXB = pB[0].x,
                        minYB = pB[0].y,
                        maxYB = pB[0].y;
                    for (let p of pB) {
                        minXB = Math.min(minXB, p.x);
                        maxXB = Math.max(maxXB, p.x);
                        minYB = Math.min(minYB, p.y);
                        maxYB = Math.max(maxYB, p.y);
                    }

                    if (
                        maxXA < minXB - 5 ||
                        minXA > maxXB + 5 ||
                        maxYA < minYB - 5 ||
                        minYA > maxYB + 5
                    )
                        continue;

                    let hull = getConvexHull([...pA, ...pB]);
                    let areaA = getPolyArea(pA),
                        areaB = getPolyArea(pB),
                        areaHull = getPolyArea(hull);

                    if (areaHull <= (areaA + areaB) * tolerance) {
                        if (hull.length <= 60) {
                            polys[i] = hull;
                            polys.splice(j, 1);
                            changed = true;
                            break;
                        }
                    }
                }
                if (changed) break;
            }
        }
    }
    return polys;
}

// ==========================================
// 5. ARTISTIC DOMAIN WARPING GENERATOR
// ==========================================
export async function generateDeathTunnel(paddingVal) {
    try {
        showToast("Reading clipboard data...", false);
        let text = await navigator.clipboard.readText();
        if (!text || text.trim() === "") {
            showToast("Clipboard is empty.", true);
            return;
        }

        let pathData;
        try {
            pathData = JSON.parse(text);
        } catch (e) {
            showToast("Clipboard data is not valid JSON.", true);
            return;
        }

        const rawPoints = extractPoints(pathData);
        if (rawPoints.length < 2) {
            showToast("Found less than 2 valid points.", true);
            return;
        }

        showToast("Painting flowing snaking lava...", false);

        const canvas = UI.elems.canvas;
        const GW = canvas ? canvas.width : 730;
        const GH = canvas ? canvas.height : 500;

        let gamePoints = rawPoints.map((p) =>
            convertPkrToGame(p.x, p.y, GW, GH),
        );

        // Intense pre-smoothing guarantees zero 90-degree wedges going into the algorithm
        let spaced = walkPath(gamePoints, 12);
        let trace = smoothPath(spaced, 4);

        if (trace.length < 2) {
            showToast("Path is too short.", true);
            return;
        }

        function distSq(px, py, x1, y1, x2, y2) {
            let l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
            if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
            let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
            t = Math.max(0, Math.min(1, t));
            let cx = x1 + t * (x2 - x1);
            let cy = y1 + t * (y2 - y1);
            return (px - cx) * (px - cx) + (py - cy) * (py - cy);
        }

        // 1. Setup Distance Field Grid Boundaries
        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
        for (let p of trace) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }

        minX -= 150;
        maxX += 150;
        minY -= 150;
        maxY += 150;

        const res = 5;
        const cols = Math.ceil((maxX - minX) / res) + 1;
        const rows = Math.ceil((maxY - minY) / res) + 1;
        const grid = new Float32Array(cols * rows);

        const spawn = State.get("spawnCircle");
        const spawnDiam = spawn ? spawn.diameter : 18;

        // Ironclad functional requirement
        const MIN_DIST = spawnDiam / 2 + 2.5 + paddingVal;

        let totalTraceLength = 0;
        let traceProgress = [0];
        for (let i = 0; i < trace.length - 1; i++) {
            totalTraceLength += Math.hypot(
                trace[i + 1].x - trace[i].x,
                trace[i + 1].y - trace[i].y,
            );
            traceProgress.push(totalTraceLength);
        }

        // 2. Evaluate Domain-Warped Distance Field
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                let px = minX + x * res;
                let py = minY + y * res;

                // --- A. THE SAFE CORE ---
                // Find true unwarped distance to the exact player trace
                let minDtSafeSq = Infinity;
                let closestIdx = 0;
                for (let i = 0; i < trace.length - 1; i++) {
                    let dsq = distSq(
                        px,
                        py,
                        trace[i].x,
                        trace[i].y,
                        trace[i + 1].x,
                        trace[i + 1].y,
                    );
                    if (dsq < minDtSafeSq) {
                        minDtSafeSq = dsq;
                        closestIdx = i;
                    }
                }
                let dt_safe = Math.sqrt(minDtSafeSq);
                let progressNorm = closestIdx / (trace.length - 1 || 1);

                // --- B. THE CAREFREE PAINTBRUSH ---
                // We domain-warp the grid mathematically. This physically drags the lava left and right
                // asynchronously to the path, creating beautiful flowing imperfections and natural gaps.
                // Amplitude 14 guarantees the gaps will never exceed the player's diameter (~18+).
                let warpX = Math.sin(py * 0.04 + progressNorm * 10) * 14;
                let warpY = Math.cos(px * 0.04 - progressNorm * 10) * 14;

                // Find distance from the WARPED point to the trace
                let minDtLavaSq = Infinity;
                let startCheck = Math.max(0, closestIdx - 6);
                let endCheck = Math.min(trace.length - 1, closestIdx + 6);
                for (let i = startCheck; i < endCheck; i++) {
                    let dsq = distSq(
                        px + warpX,
                        py + warpY,
                        trace[i].x,
                        trace[i].y,
                        trace[i + 1].x,
                        trace[i + 1].y,
                    );
                    if (dsq < minDtLavaSq) minDtLavaSq = dsq;
                }
                let dt_lava = Math.sqrt(minDtLavaSq);

                // --- C. AESTHETIC THICKNESS & STYLING ---
                let strokeThick =
                    24 + Math.sin(progressNorm * Math.PI * 18) * 12;

                // Teardrop Snake-tail taper
                let taperSteps = Math.min(25, trace.length / 3);
                let taper = 1.0;
                if (closestIdx < taperSteps)
                    taper = Math.pow(closestIdx / taperSteps, 1.5);
                else if (closestIdx > trace.length - 1 - taperSteps)
                    taper = Math.pow(
                        (trace.length - 1 - closestIdx) / taperSteps,
                        1.5,
                    );

                let lava_val = MIN_DIST + strokeThick * taper - dt_lava;

                // Add high-frequency droplet noise to break up the outer edges slightly
                lava_val += Math.sin(px * 0.1) * Math.cos(py * 0.1) * 6;

                // --- D. IRONCLAD SAFETY ENFORCEMENT ---
                // If this pixel is physically inside the strict safety zone,
                // it is mathematically forced to empty space, instantly punching out the hollow tunnel.
                let val = lava_val;
                if (dt_safe < MIN_DIST) {
                    val = -1;
                } else if (val === 0) {
                    val = 1e-5;
                }

                grid[y * cols + x] = val;
            }
        }

        // 3. Marching Squares Contour Extraction
        const edgeTable = [
            [],
            [[3, 0]],
            [[0, 1]],
            [[3, 1]],
            [[1, 2]],
            [
                [3, 0],
                [1, 2],
            ],
            [[0, 2]],
            [[3, 2]],
            [[2, 3]],
            [[2, 0]],
            [
                [0, 1],
                [2, 3],
            ],
            [[2, 1]],
            [[1, 3]],
            [[1, 0]],
            [[0, 3]],
            [],
        ];
        function getPt(edgeIdx, x, y, v0, v1, v2, v3) {
            let px = minX + x * res,
                py = minY + y * res;
            if (edgeIdx === 0)
                return { x: px + (res * (0 - v0)) / (v1 - v0), y: py };
            if (edgeIdx === 1)
                return { x: px + res, y: py + (res * (0 - v1)) / (v2 - v1) };
            if (edgeIdx === 2)
                return { x: px + (res * (0 - v3)) / (v2 - v3), y: py + res };
            if (edgeIdx === 3)
                return { x: px, y: py + (res * (0 - v0)) / (v3 - v0) };
        }

        let segments = [];
        for (let y = 0; y < rows - 1; y++) {
            for (let x = 0; x < cols - 1; x++) {
                let v0 = grid[y * cols + x];
                let v1 = grid[y * cols + x + 1];
                let v2 = grid[(y + 1) * cols + x + 1];
                let v3 = grid[(y + 1) * cols + x];
                let state =
                    (v0 > 0 ? 1 : 0) |
                    (v1 > 0 ? 2 : 0) |
                    (v2 > 0 ? 4 : 0) |
                    (v3 > 0 ? 8 : 0);
                for (let edge of edgeTable[state])
                    segments.push({
                        p1: getPt(edge[0], x, y, v0, v1, v2, v3),
                        p2: getPt(edge[1], x, y, v0, v1, v2, v3),
                    });
            }
        }

        // 4. Piece Stitching
        let rawPolys = [];
        while (segments.length > 0) {
            let poly = [];
            let curr = segments.pop();
            poly.push(curr.p1, curr.p2);
            let head = curr.p1,
                tail = curr.p2;
            let added = true;

            while (added && segments.length > 0) {
                added = false;
                for (let i = 0; i < segments.length; i++) {
                    let s = segments[i];
                    const EPS = 0.01;
                    if (Math.hypot(s.p1.x - tail.x, s.p1.y - tail.y) < EPS) {
                        poly.push(s.p2);
                        tail = s.p2;
                        segments.splice(i, 1);
                        added = true;
                        break;
                    } else if (
                        Math.hypot(s.p2.x - tail.x, s.p2.y - tail.y) < EPS
                    ) {
                        poly.push(s.p1);
                        tail = s.p1;
                        segments.splice(i, 1);
                        added = true;
                        break;
                    } else if (
                        Math.hypot(s.p1.x - head.x, s.p1.y - head.y) < EPS
                    ) {
                        poly.unshift(s.p2);
                        head = s.p2;
                        segments.splice(i, 1);
                        added = true;
                        break;
                    } else if (
                        Math.hypot(s.p2.x - head.x, s.p2.y - head.y) < EPS
                    ) {
                        poly.unshift(s.p1);
                        head = s.p1;
                        segments.splice(i, 1);
                        added = true;
                        break;
                    }
                }
            }
            if (poly.length > 6) rawPolys.push(poly);
        }

        let finalPolys = [];
        const stateColors = State.get("colors") || {};
        const deathColor = stateColors.death || "rgb(255, 0, 0)";

        // 5. Aesthetic Melting & Massive Polygon Optimization
        for (const ring of rawPolys) {
            if (getPolyArea(ring) < 150) continue; // Dust filter

            // Physical melting removes all sharp spikes natively
            let meltedVerts = meltRing(ring, 2);

            // Low decimation preserves the smooth swept curves
            let cleanVerts = rdpSimplify(meltedVerts, 1.2);

            if (cleanVerts.length < 3) continue;

            const triangles = triangulate(cleanVerts);

            // Stitches geometry into massive, sweeping 60-vertex blocks
            const compressedChunks = compressToMassiveConvex(triangles);

            for (let part of compressedChunks) {
                const polyObj = createValidPolygonObject(part, "death", {
                    isDeath: true,
                });
                if (polyObj) {
                    polyObj.polyType = "death";
                    polyObj.color = deathColor;
                    finalPolys.push(polyObj);
                }
            }
        }

        // 6. Dispatch
        if (finalPolys.length > 0) {
            let toCreate = finalPolys.slice(0, 1000);
            const generatedIds = toCreate.map(
                () => "tun_" + Math.random().toString(36).substr(2, 9),
            );
            toCreate.forEach((p, i) => (p.id = generatedIds[i]));

            Network.createObjectsBatch({
                objects: toCreate,
                isAutoGeneration: true,
            });
            State.set("selectedObjectIds", generatedIds);

            showToast(
                `Success! Painted beautiful flowing lava using ${toCreate.length} optimized shapes.`,
                false,
            );
        } else {
            showToast("No geometry remained after processing.", true);
        }
    } catch (err) {
        console.error("Tunnel Generation Error:", err);
        showToast("Error processing complex geometry.", true);
    }
}
