//** handlers.js - UI Event Binders
//
import UI from "./ui.js";
import State from "./state.js";
import * as Network from "./network.js";
import {
  getHitObjectId,
  getHoveredObject,
  distance,
  getLineProps,
  pointFromEventOnCanvas,
  normalizeAngle,
  handleUndoLastObject,
  calculatePolygonCenter,
  isObjectInSelectionBox,
  canSelectObject,
  createValidPolygonObject,
  splitConcaveIntoConvex,
  handleGroupRotation,
  handleGroupScaling,
} from "./utils-client.js";
import { copyLineInfo, pasteLines } from "./copyPasteLines.js";
import { generatePlatformerMap } from "./auto-generator-platformer.js";
import {
  startPathDrawing,
  generateRandomPathAndPolygons,
  generatePolygonsFromPathPoints,
} from "./auto-generator-path.js";
import { showToast, showToastWithButtons } from "./utils-client.js";
import { startGame } from "./sim-user-controlled.js";
import { generateParkourMap } from "./sim-auto-generator.js";

// --- State Flags for Mouse Actions ---
let isDraggingObject = false;
let isDraggingSpawn = false;
let isDraggingCapZone = false;
let isDraggingZone = false;
let isDrawing = false; // Generic flag for line or marquee
let mouseMovedSinceDown = false;
let mouseDownTime = 0;
let isDraggingVertex = false;
let vertexDrag = null; // will be mirrored to State for canvas rendering

const keysDown = new Set();
let nudgeLoopId = null;

// Track the drawing mode before shift was pressed
let drawingModeBeforeShift = null;
function rotatePoint(pt, angleDeg) {
  const r = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: pt.x * cos - pt.y * sin, y: pt.x * sin + pt.y * cos };
}

function rotatePointInverse(pt, angleDeg) {
  // rotate by -angleDeg
  return rotatePoint(pt, -angleDeg);
}

function getAbsoluteVertices(obj) {
  // obj.v are local (relative to obj.c), apply rotation + scale + translate
  const a = obj.a || 0;
  const s = obj.scale || 1;
  return (obj.v || []).map((lv) => {
    const scaled = { x: lv.x * s, y: lv.y * s };
    const rotated = rotatePoint(scaled, a);
    return { x: obj.c.x + rotated.x, y: obj.c.y + rotated.y };
  });
}

function localVerticesFromAbsolute(absVerts, center, angleDeg, scale) {
  // For each absolute vertex: compute (Ai - center), rotate inverse by angle, divide by scale
  return absVerts.map((A) => {
    const rel = { x: A.x - center.x, y: A.y - center.y };
    const invRot = rotatePointInverse(rel, angleDeg);
    return { x: invRot.x / (scale || 1), y: invRot.y / (scale || 1) };
  });
}

// ===== handlers.js =====
// Replace the entire handleCanvasDown with this refactored, consistent version.

function handleCanvasDown(e) {
  if (e.button !== 0 || e.target !== UI.elems.canvas) return;
  // Goal 1: Impossible to draw/select if isDrawingPath is true
  if (State.get("isDrawingPath")) {
    return;
  }
  const point = pointFromEventOnCanvas(e);
  State.set("mouse", point);
  mouseMovedSinceDown = false;
  mouseDownTime = Date.now();

  const drawingMode = State.get("drawingMode");

  // quick-hit: spawn / cap zone / zone indicator
  const zone = State.get("zoneIndicator");
  if (zone && zone.show) {
    const spawn = State.get("spawnCircle");
    const diam = spawn ? spawn.diameter : 18;
    if (distance(point, zone) < diam / 2 + 5) {
      isDraggingZone = true;
      return;
    }
  }

  const spawn = State.get("spawnCircle");
  if (spawn && distance(point, spawn) < (spawn.diameter || 0) / 2 + 5) {
    isDraggingSpawn = true;
    return;
  }
  const cz = State.get("capZone");
  if (
    cz &&
    point.x > cz.x &&
    point.x < cz.x + cz.width &&
    point.y > cz.y &&
    point.y < cz.y + cz.height
  ) {
    isDraggingCapZone = true;
    return;
  }

  // if we're mid-adding points to a polygon, treat this click as adding a vertex
  const drawingShape = State.get("drawingShape");
  if (drawingShape) {
    if (drawingMode === "poly") addPolygonPoint(point);
    return;
  }

  const objects = State.get("objects") || [];
  const hitObjectId = getHitObjectId(point, objects);

  // --- Clicked on an object: vertex-drag detection first (highest priority) ---
  if (hitObjectId && canSelectObject(hitObjectId)) {
    const obj = objects.find((o) => o.id === hitObjectId);
    if (obj && obj.type === "poly" && State.isSelected(hitObjectId)) {
      const absVerts = getAbsoluteVertices(obj);
      const HANDLE_RADIUS = 8;
      const vertexIndex = absVerts.findIndex(
        (v) => distance(v, point) < HANDLE_RADIUS,
      );
      if (vertexIndex !== -1) {
        // start vertex drag (prevent this from turning into an object-drag)
        isDraggingVertex = true;
        isDraggingObject = false;
        vertexDrag = {
          objectId: hitObjectId,
          vertexIndex,
          originalObject: { ...obj, v: obj.v.map((p) => ({ ...p })) },
          originalAbsVertices: absVerts.map((p) => ({ ...p })),
          mouseStart: point,
        };
        State.set("vertexDrag", { ...vertexDrag });
        State.set("draggingPreview", {
          mouseStart: point,
          originalObjects: [{ ...obj }],
          objects: [{ ...obj }],
        });
        return;
      }
    }

    // normal object selection / start object-drag
    isDraggingVertex = false;
    isDraggingObject = true;

    if (e.shiftKey) {
      if (State.isSelected(hitObjectId)) {
        State.removeSelectedObjectId(hitObjectId);
      } else {
        State.addSelectedObjectId(hitObjectId);
      }
    } else if (!State.isSelected(hitObjectId)) {
      State.set("selectedObjectIds", [hitObjectId]);
    }

    const selectedObjects = objects.filter((o) => State.isSelected(o.id));
    State.set("draggingPreview", {
      mouseStart: point,
      originalObjects: selectedObjects.map((o) => ({ ...o })),
    });
    return;
  }

  // --- Clicked empty canvas: ALWAYS clear selection first (fixes the line-mode bug) ---
  const selectedIds = State.get("selectedObjectIds") || [];
  if (selectedIds.length > 0) {
    State.clearSelectedObjects();
    // preserve old behavior for poly-mode: if something was selected, a click simply deselects (don't start drawing)
    if (drawingMode === "poly") {
      console.log("Cleared selection.");
      return;
    }
  }

  // If poly mode and nothing selected -> start drawing polygon immediately
  if (drawingMode === "poly") {
    State.set("drawingShape", { type: "poly", vertices: [point] });
    UI.setStatus(
      "Click to add points, close shape to finish, or 'X' to cancel.",
    );
    return;
  }

  // Line/select modes: begin drawing / selection box
  if (
    drawingMode === "line" ||
    drawingMode === "circle" ||
    drawingMode === "select"
  ) {
    isDrawing = true;
    State.set("startPt", point);
    if (drawingMode === "select") {
      State.set("selectionBox", {
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      });
    }
    return;
  }

  // fall-through: do nothing
}

function addPolygonPoint(point) {
  const currentShape = State.get("drawingShape");
  if (!currentShape || currentShape.type !== "poly") return;

  // Clamp point to be within canvas boundaries
  const canvas = UI.elems.canvas;
  const clampedPoint = {
    x: Math.max(0, Math.min(canvas.width, point.x)),
    y: Math.max(0, Math.min(canvas.height, point.y)),
  };

  const vertices = currentShape.vertices;
  // Check if closing the polygon
  if (vertices.length > 1 && distance(clampedPoint, vertices[0]) < 10) {
    if (vertices.length < 3) {
      // Not enough vertices, cancel drawing
      State.set("drawingShape", null);
      UI.setStatus("Polygon cancelled. Click to start a new one.");
      return;
    }

    // Finalize polygon
    const shapeToSplit = { v: vertices.map((p) => [p.x, p.y]) };
    const convexPolygons = splitConcaveIntoConvex(shapeToSplit);

    const polygonsToSend = convexPolygons
      .map((convexPoly) => {
        const absoluteVertices = convexPoly.v.map((p) => ({
          x: p[0],
          y: p[1],
        }));
        // Use the new centralized, validating function
        return createValidPolygonObject(absoluteVertices, "none"); // Assumes "none" type for drawn polys
      })
      .filter(Boolean); // .filter(Boolean) removes any 'null' results
    Network.createObjectsBatch({
      objects: polygonsToSend,
      isAutoGeneration: false,
    });
    State.set("drawingShape", null);
    UI.setStatus("Click on the canvas to start drawing a polygon.");
  } else {
    // Add a new point
    const updatedVertices = [...vertices, clampedPoint];
    State.set("drawingShape", { ...currentShape, vertices: updatedVertices });
  }
}

function handleCanvasMove(e) {
  const point = pointFromEventOnCanvas(e);
  const lastPoint = State.get("mouse");
  if (point.x !== lastPoint.x || point.y !== lastPoint.y) {
    mouseMovedSinceDown = true;
  }
  State.set("mouse", point);

  // 🔑 Keep polygon's preview endpoint live, same way line tool does
  const drawingShape = State.get("drawingShape");
  if (
    drawingShape &&
    drawingShape.type === "poly" &&
    drawingShape.vertices.length > 0
  ) {
    drawingShape.preview = point; // add a transient "preview" field
    State.set("drawingShape", drawingShape);
  }

  // ---- handlers.js (inside handleCanvasMove) ----
  if (isDraggingVertex && vertexDrag) {
    mouseMovedSinceDown = true;
    const { objectId, vertexIndex, originalObject, originalAbsVertices } =
      vertexDrag;

    // clamp to canvas
    const clampedPoint = (function clampToCanvas(p) {
      const canvas = UI.elems.canvas;
      return {
        x: Math.max(0, Math.min(canvas.width, p.x)),
        y: Math.max(0, Math.min(canvas.height, p.y)),
      };
    })(point);

    // create new absolute vertices with dragged vertex moved
    const absVerts = originalAbsVertices.map((v, i) =>
      i === vertexIndex
        ? { x: clampedPoint.x, y: clampedPoint.y }
        : { x: v.x, y: v.y },
    );

    // compute new center and local vertices for preview
    const center = calculatePolygonCenter(absVerts);
    const relativeVerts = localVerticesFromAbsolute(
      absVerts,
      center,
      originalObject.a || 0,
      originalObject.scale || 1,
    );

    // build preview object
    const previewObj = {
      ...originalObject,
      c: center,
      v: relativeVerts,
    };

    // 1) Update draggingPreview for canvas rendering (keeps existing preview logic)
    State.set("draggingPreview", {
      mouseStart: vertexDrag.mouseStart,
      originalObjects: [{ ...originalObject }],
      objects: [{ ...previewObj }],
    });

    // 2) **CRITICAL** — immediately update local State.objects so the live vertex movement
    // persists in-app and cannot be overridden by other drag logic.
    const objs = State.get("objects") || [];
    const newObjs = objs.map((o) => (o.id === objectId ? previewObj : o));
    State.set("objects", newObjs);

    // 3) Mirror the current computed absolute verts so handles draw at live positions
    State.set("vertexDrag", { ...vertexDrag, currentAbsVerts: absVerts });

    return;
  }

  function padLabel(label, width = 7) {
    return (label + ":").padEnd(width, " ");
  }
  function padValue(value, width = 8) {
    return String(value).padStart(width, " ");
  }

  // **FEATURE**: Hover Tooltip Logic
  const tooltip = UI.elems.tooltip;
  if (tooltip) {
    const hoveredObject = getHoveredObject(point, State.get("objects"));
    // Show tooltip only if hovering an object that is not currently selected
    if (hoveredObject && hoveredObject.id !== State.get("selectedObjectId")) {
      let tooltipText = "";
      if (hoveredObject.type === "line") {
        const { width, height, angle } = getLineProps(hoveredObject);
        tooltipText = [
          `${padLabel("Type")} ${padValue("Line")}`,
          `${padLabel("X")} ${padValue(hoveredObject.start.x.toFixed(1))}`,
          `${padLabel("Y")} ${padValue(hoveredObject.start.y.toFixed(1))}`,
          `${padLabel("W")} ${padValue(width.toFixed(1))}`,
          `${padLabel("H")} ${padValue(height.toFixed(1))}`,
          `${padLabel("Angle")} ${padValue(normalizeAngle(angle).toFixed(1) + "°")}`,
        ].join("\n");
      } else if (hoveredObject.type === "poly") {
        tooltipText = [
          `${padLabel("Type")} ${padValue("Polygon")}`,
          `${padLabel("X")} ${padValue(hoveredObject.c.x.toFixed(1))}`,
          `${padLabel("Y")} ${padValue(hoveredObject.c.y.toFixed(1))}`,
        ].join("\n");
      } else if (hoveredObject.type === "circle") {
        // --- NEW ---
        tooltipText = [
          `${padLabel("Type")} ${padValue("Circle")}`,
          `${padLabel("X")} ${padValue(hoveredObject.c.x.toFixed(1))}`,
          `${padLabel("Y")} ${padValue(hoveredObject.c.y.toFixed(1))}`,
          `${padLabel("Radius")} ${padValue(hoveredObject.radius.toFixed(1))}`,
        ].join("\n");
      }

      tooltip.innerHTML = tooltipText;
      tooltip.style.display = "block";
      tooltip.style.left = `${e.clientX + 15}px`;
      tooltip.style.top = `${e.clientY + 15}px`;
    } else {
      tooltip.style.display = "none";
    }
  }

  if (State.get("drawingMode") === "poly" && State.get("drawingShape")) {
    return;
  }

  if (isDraggingZone) {
    const zone = State.get("zoneIndicator");
    State.set("zoneIndicator", { ...zone, x: point.x, y: point.y });
    return;
  }

  if (isDraggingSpawn) {
    const { width, height } = UI.elems.canvas;
    const spawn = State.get("spawnCircle");
    const radius = spawn.diameter / 2;

    // Allow spawn to be partially off the canvas but not more than half
    const x = Math.max(
      -radius, // Half off the left
      Math.min(width + radius, point.x), // Half off the right
    );
    const y = Math.max(
      -radius, // Half off the top
      Math.min(height + radius, point.y), // Half off the bottom
    );

    State.set("spawnCircle", { ...spawn, x, y });
    return;
  }

  if (isDraggingCapZone) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const cz = State.get("capZone");
    const halfWidth = cz.width / 2;
    const halfHeight = cz.height / 2;

    // Allow capZone to be partially off the canvas but not more than half on each edge
    const x = Math.max(
      -halfWidth, // Half off the left
      Math.min(canvasWidth - halfWidth, point.x), // Half off the right
    );
    const y = Math.max(
      -halfHeight, // Half off the top
      Math.min(canvasHeight - halfHeight, point.y), // Half off the bottom
    );

    // Update the capZone position, adjusting for the offset
    State.set("capZone", { ...cz, x, y });
    return;
  }

  if (isDraggingObject) {
    const preview = State.get("draggingPreview");
    if (!preview || !preview.originalObjects) return;
    const dx = point.x - preview.mouseStart.x;
    const dy = point.y - preview.mouseStart.y;

    const updatedObjects = preview.originalObjects.map((originalObject) => {
      let updatedObject;
      // This now correctly handles all three types
      if (originalObject.type === "poly" || originalObject.type === "circle") {
        updatedObject = {
          ...originalObject,
          c: {
            x: originalObject.c.x + dx,
            y: originalObject.c.y + dy,
          },
        };
      } else if (originalObject.type === "line") {
        updatedObject = {
          ...originalObject,
          start: {
            x: originalObject.start.x + dx,
            y: originalObject.start.y + dy,
          },
          end: {
            x: originalObject.end.x + dx,
            y: originalObject.end.y + dy,
          },
        };
      }
      return updatedObject;
    });

    State.set("draggingPreview", { ...preview, objects: updatedObjects });
    return;
  }

  if (isDrawing) {
    const startPt = State.get("startPt");
    if (!startPt) return;

    if (State.get("drawingMode") === "select") {
      State.set("selectionBox", {
        x: Math.min(startPt.x, point.x),
        y: Math.min(startPt.y, point.y),
        width: Math.abs(startPt.x - point.x),
        height: Math.abs(startPt.y - point.y),
      });
    } else if (State.get("drawingMode") === "line") {
      State.set("drawingShape", { type: "line", start: startPt, end: point });
    } else if (State.get("drawingMode") === "circle") {
      const radius = distance(startPt, point);
      State.set("drawingShape", { type: "circle", c: startPt, radius: radius });
    }
  }
}
// ===== handlers.js =====
// Replace handleCanvasUp with the version below (only the function — rest of file unchanged).
// Note: vertex commit is done first so it cannot be clobbered by object-drag updates.

function handleCanvasUp(e) {
  const drawingMode = State.get("drawingMode");

  // First: if we were vertex-dragging, commit that change before any other drag-handling.
  if (isDraggingVertex && vertexDrag) {
    try {
      const { objectId, originalObject } = vertexDrag;
      const preview = State.get("draggingPreview");
      const previewObj =
        preview?.objects?.find((o) => o.id === objectId) || null;

      if (previewObj) {
        // Reconstruct absolute vertices from previewObj (local->absolute)
        const absVerts = getAbsoluteVertices(previewObj);

        // If malformed (less than 3), delete original
        if (!absVerts || absVerts.length < 3) {
          Network.deleteObject(objectId);
        } else {
          // Use existing splitting utility (expects absolute coordinates in shape.v)
          const shapeToSplit = { v: absVerts.map((p) => [p.x, p.y]) };
          const convexPolygons = splitConcaveIntoConvex(shapeToSplit);

          if (!convexPolygons || convexPolygons.length === 0) {
            // fallback: delete original if split fails
            Network.deleteObject(objectId);
          } else if (convexPolygons.length === 1) {
            // Single polygon -> update the original object with new local vertices and center
            const absoluteVertices = convexPolygons[0].v.map((p) => ({
              x: p[0],
              y: p[1],
            }));

            // Use new function to validate and get data
            const validPoly = createValidPolygonObject(
              absoluteVertices,
              null,
              previewObj,
            );

            if (validPoly) {
              // IMPORTANT: update local state first
              const objs = State.get("objects") || [];
              const updatedObjs = objs.map((o) =>
                o.id === objectId
                  ? { ...o, v: validPoly.v, c: validPoly.c }
                  : o,
              );
              State.set("objects", updatedObjs);

              // then broadcast the canonical change to the server
              Network.updateObject({
                id: objectId,
                v: validPoly.v,
                c: validPoly.c,
              });
            } else {
              // Polygon became degenerate, delete it
              Network.deleteObject(objectId);
            }
          } else {
            // Multiple convex polygons -> create new objects, remove original
            const polygonsToSend = convexPolygons
              .map((convexPoly) => {
                const absoluteVertices = convexPoly.v.map((p) => ({
                  x: p[0],
                  y: p[1],
                }));
                // Use new function to validate and inherit props (a, scale, polyType)
                return createValidPolygonObject(
                  absoluteVertices,
                  originalObject.polyType,
                  originalObject,
                );
              })
              .filter(Boolean); // .filter(Boolean) removes any 'null' results

            // Create the new polygons first, then delete the old
            Network.deleteObject(objectId);
            if (polygonsToSend.length > 0) {
              Network.createObjectsBatch({ objects: polygonsToSend });
            }
          }
        }
      }
    } catch (err) {
      console.error("Error committing vertex drag:", err);
    } finally {
      // Cleanup vertex drag state so no subsequent object-drag code runs for this event
      isDraggingVertex = false;
      vertexDrag = null;
      State.set("vertexDrag", null);
      State.set("draggingPreview", null);
      // Also ensure we are not flagged as an object drag
      isDraggingObject = false;
    }
  }

  // Handle normal object-drag commit (skip if we were vertex-dragging -- already handled above)
  if (isDraggingObject) {
    const preview = State.get("draggingPreview");
    if (preview && preview.objects && mouseMovedSinceDown) {
      preview.objects.forEach((obj) => {
        let payload = { id: obj.id };
        if (obj.type === "poly" || obj.type === "circle") payload.c = obj.c;
        if (obj.type === "line") {
          payload.start = obj.start;
          payload.end = obj.end;
        }
        Network.updateObject(payload);
      });
    }
  }

  // (rest unchanged) spawn/capzone handling, selection-box, line creation, cleanup
  if (isDraggingSpawn) {
    const spawn = State.get("spawnCircle");
    Network.setSpawnCircle({ x: spawn.x, y: spawn.y });
  }
  if (isDraggingCapZone) {
    const cz = State.get("capZone");
    Network.setCapZone({ x: cz.x, y: cz.y });
  }

  if (isDrawing && drawingMode === "select" && mouseMovedSinceDown) {
    const selectionBox = State.get("selectionBox");
    const allObjects = State.get("objects");
    const idsToSelect = allObjects
      .filter(
        (obj) =>
          canSelectObject(obj.id) && isObjectInSelectionBox(obj, selectionBox),
      )
      .map((obj) => obj.id);

    if (e.shiftKey) {
      idsToSelect.forEach((id) => State.addSelectedObjectId(id));
    } else {
      State.set("selectedObjectIds", idsToSelect);
    }
  }

  if (isDrawing && drawingMode === "line") {
    const startPt = State.get("startPt");
    const endPt = State.get("mouse");
    if (startPt && distance(startPt, endPt) > 5) {
      Network.createObject({ type: "line", start: startPt, end: endPt });
    }
  }

  if (isDrawing && drawingMode === "circle") {
    const startPt = State.get("startPt");
    const endPt = State.get("mouse");
    const radius = distance(startPt, endPt);
    if (startPt && radius > 2) {
      Network.createObject({ type: "circle", c: startPt, radius });
    }
  }

  // Final cleanup
  isDraggingObject = false;
  isDraggingSpawn = false;
  isDraggingZone = false;
  isDraggingCapZone = false;
  isDrawing = false;
  State.set("startPt", null);
  State.set("selectionBox", null);
  State.set("draggingPreview", null);
  State.set("vertexDrag", null);
  State.set(
    "drawingShape",
    State.get("drawingShape")?.type === "poly"
      ? State.get("drawingShape")
      : null,
  );
}

// --- Keyboard Handlers ---

// --- handlers.js ---

function startNudgeLoop() {
  if (nudgeLoopId) return;

  const nudgeLoop = () => {
    const selectedIds = State.get("selectedObjectIds");
    if (selectedIds.length === 0 || keysDown.size === 0) {
      stopNudgeLoop();
      return;
    }

    let dx = 0;
    let dy = 0;
    const speed = 2; // Speed of movement per frame

    if (keysDown.has("ArrowUp")) dy -= speed;
    if (keysDown.has("ArrowDown")) dy += speed;
    if (keysDown.has("ArrowLeft")) dx -= speed;
    if (keysDown.has("ArrowRight")) dx += speed;

    if (dx !== 0 || dy !== 0) {
      const objects = State.get("objects");

      // 1. Update Local State ONLY (Fixes relative drift & visual smoothness)
      const updatedObjects = objects.map((obj) => {
        if (!selectedIds.includes(obj.id)) return obj;

        // Calculate new absolute coords based on type
        if (obj.type === "poly" || obj.type === "circle") {
          return { ...obj, c: { x: obj.c.x + dx, y: obj.c.y + dy } };
        } else if (obj.type === "line") {
          return {
            ...obj,
            start: { x: obj.start.x + dx, y: obj.start.y + dy },
            end: { x: obj.end.x + dx, y: obj.end.y + dy },
          };
        }
        return obj;
      });

      State.set("objects", updatedObjects);
      // Note: Network.updateObject is REMOVED from here
    }
    nudgeLoopId = requestAnimationFrame(nudgeLoop);
  };
  nudgeLoopId = requestAnimationFrame(nudgeLoop);
}

function stopNudgeLoop() {
  if (nudgeLoopId) {
    cancelAnimationFrame(nudgeLoopId);
    nudgeLoopId = null;

    // 2. Send FINAL absolute positions to server on KeyUp
    const selectedIds = State.get("selectedObjectIds");
    const objects = State.get("objects");

    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj) {
        if (obj.type === "poly" || obj.type === "circle") {
          Network.updateObject({ id, c: obj.c });
        } else if (obj.type === "line") {
          Network.updateObject({ id, start: obj.start, end: obj.end });
        }
      }
    });
  }
}

function handleKeyUp(e) {
  keysDown.delete(e.key);

  // Handle shift key release to restore previous drawing mode
  if (e.key === "Shift" && drawingModeBeforeShift !== null) {
    State.set("drawingMode", drawingModeBeforeShift);
    // Update button text
    const btn = UI.elems.drawModeBtn;
    if (btn) {
      const capitalizedMode =
        drawingModeBeforeShift.charAt(0).toUpperCase() +
        drawingModeBeforeShift.slice(1);
      btn.textContent = `Mode: ${capitalizedMode} (M)`;
    }
    drawingModeBeforeShift = null;
  }

  if (keysDown.size === 0) {
    stopNudgeLoop();
  }
}

function handleKeyDown(e) {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "SELECT"))
    return;
  if (!State.get("gameActive")) return;

  // Handle shift key for temporary select mode
  if (e.key === "Shift" && !keysDown.has("Shift")) {
    keysDown.add("Shift");
    const currentMode = State.get("drawingMode");
    if (currentMode !== "select") {
      drawingModeBeforeShift = currentMode;
      State.set("drawingMode", "select");
      // Update button text
      const btn = UI.elems.drawModeBtn;
      if (btn) btn.textContent = "Selecting";
    }
  }

  const key = e.key.toLowerCase();
  const selectedIds = State.get("selectedObjectIds");

  // 2) Alt + Arrow keys: prevent browser nav in specific cases
  if (
    e.altKey &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    const objects = State.get("objects") || [];
    const selectedObjects = objects.filter((o) => State.isSelected(o.id));

    // If no object is selected, block default navigation
    if (selectedObjects.length === 0) {
      e.preventDefault();
      return;
    }

    // If selection contains polygons but no lines, block Alt+Left/Right
    const hasLine = selectedObjects.some((o) => o.type === "line");
    const hasPoly = selectedObjects.some((o) => o.type === "poly");
    if (
      hasPoly &&
      !hasLine &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight")
    ) {
      e.preventDefault();
      return;
    }
  }
  // Quick toggle for draw mode (M) — delegate to button handler
  if (key === "m") {
    const btn = UI.elems.drawModeBtn;
    if (btn) btn.click();
    return;
  }
  if (key === "g") {
    e.preventDefault();
    UI.show("autoGeneratePopup");
    return;
  }
  // General hotkeys
  switch (key) {
    case "enter":
      if (document.activeElement !== UI.elems.chatInput) {
        e.preventDefault();
        UI.elems.chatInput.focus();
      }
      return;
    case "a":
      if (e.ctrlKey) {
        e.preventDefault();
        const objects = State.get("objects") || [];
        // Filter objects based on selection rules before selecting them
        const objectIds = objects
          .filter((obj) => canSelectObject(obj.id))
          .map((o) => o.id);
        State.set("selectedObjectIds", objectIds);
        return;
      }
    case "h":
      e.preventDefault();
      const checkbox = UI.elems.hideUsernamesCheckbox;
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        State.set("hideUsernames", checkbox.checked);
      }
      return;
    case "c":
      if (e.metaKey || e.ctrlKey) {
        copyLineInfo();
      }
      return;
    case "v":
      if (e.metaKey || e.ctrlKey) {
        pasteLines();
      }
      return;
    case "x":
      if (State.get("drawingMode") === "poly" && State.get("drawingShape")) {
        e.preventDefault();
        State.set("drawingShape", null);
        UI.setStatus("Click to start drawing a new polygon.");
      }
      break;
  }

  if (selectedIds.length === 0) return;

  // Hotkeys for selected objects
  const objects = State.get("objects").filter((o) =>
    selectedIds.includes(o.id),
  );
  if (objects.length === 0) return;

  // If Shift+Left/Right is pressed and multiple objects are selected, rotate as a group.
  if (
    objects.length > 1 &&
    e.shiftKey &&
    (key === "arrowleft" || key === "arrowright")
  ) {
    e.preventDefault();
    const step = e.ctrlKey ? 10 : 1;
    const delta = key === "arrowleft" ? -step : step;
    handleGroupRotation(objects, delta);
    return; // Skip individual object handling
  }

  // Group Scaling Interception (Alt + Up/Down)
  if (
    objects.length > 1 &&
    e.altKey &&
    (key === "arrowup" || key === "arrowdown")
  ) {
    // Check if we are scaling Polygons (prevent interference with Lines/Circles)
    const hasPoly = objects.some((o) => o.type === "poly");

    if (hasPoly) {
      e.preventDefault();
      // Determine delta (Up = grow, Down = shrink)
      // Limit shrink speed for precision, increase grow speed for utility
      if (key === "arrowup" && objects.some((o) => o.scale >= 10)) return; // Max scale cap

      const delta = key === "arrowup" ? 0.1 : -0.1;

      handleGroupScaling(objects, delta);
      return; // Stop execution to prevent default individual behavior
    }
  }

  if (e.key.startsWith("Arrow") && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    keysDown.add(e.key);
    startNudgeLoop();
    return;
  }

  if (key === "[") {
    e.preventDefault();
    createReorderHandler(true)(); // <-- invoke the returned function
    return;
  }
  if (key === "]") {
    e.preventDefault();
    createReorderHandler(false)(); // <-- invoke the returned function
    return;
  }

  // Type and transform hotkeys
  const isMultiSelect = selectedIds.length > 1;

  objects.forEach((object) => {
    const id = object.id;
    if (object.type === "poly") {
      if (e.shiftKey && (key === "arrowleft" || key === "arrowright")) {
        e.preventDefault();
        const step = e.ctrlKey ? 10 : 1;
        const delta = key === "arrowleft" ? -step : step;
        Network.updateObject({ id, angleDelta: delta });
      } else if (e.altKey && (key === "arrowup" || key === "arrowdown")) {
        e.preventDefault();
        if (key === "arrowup" && object.scale >= 5) return;
        const delta = key === "arrowup" ? 0.1 : -0.1;
        Network.updateObject({ id, scaleDelta: delta });
      } else {
        switch (key) {
          case "b":
            Network.updateObject({
              id,
              polyType: isMultiSelect
                ? "bouncy"
                : object.polyType === "bouncy"
                  ? "none"
                  : "bouncy",
            });
            break;
          case "d":
            Network.updateObject({
              id,
              polyType: isMultiSelect
                ? "death"
                : object.polyType === "death"
                  ? "none"
                  : "death",
            });
            break;
          case "n":
            Network.updateObject({ id, polyType: "none" });
            break;
          case "x":
          case "delete":
          case "backspace":
            Network.deleteObject(id);
            break;
        }
      }
    } else if (object.type === "circle") {
      if (e.altKey && (key === "arrowup" || key === "arrowdown")) {
        e.preventDefault();
        const delta =
          key === "arrowup" ? (e.shiftKey ? 10 : 1) : e.shiftKey ? -10 : -1;
        Network.updateObject({ id, radiusDelta: delta });
      } else {
        switch (key) {
          case "b":
            Network.updateObject({
              id,
              circleType: isMultiSelect
                ? "bouncy"
                : object.circleType === "bouncy"
                  ? "none"
                  : "bouncy",
            });
            break;
          case "d":
            Network.updateObject({
              id,
              circleType: isMultiSelect
                ? "death"
                : object.circleType === "death"
                  ? "none"
                  : "death",
            });
            break;
          case "n":
            Network.updateObject({ id, circleType: "none" });
            break;
          case "x":
          case "delete":
          case "backspace":
            Network.deleteObject(id);
            break;
        }
      }
    } else if (object.type === "line") {
      if (e.altKey && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (key === "arrowleft" || key === "arrowright") {
          const delta = key === "arrowleft" ? -step : step;
          Network.updateObject({ id, widthDelta: delta });
        } else if (key === "arrowup" || key === "arrowdown") {
          const delta = key === "arrowup" ? step : -step;
          Network.updateObject({ id, heightDelta: delta });
        }
      } else if (e.shiftKey && (key === "arrowleft" || key === "arrowright")) {
        e.preventDefault();
        const step = e.ctrlKey ? 10 : 1;
        const delta = key === "arrowleft" ? -step : step;
        Network.updateObject({ id, angleDelta: delta });
      } else {
        switch (key) {
          case "b":
            Network.updateObject({
              id,
              lineType: isMultiSelect
                ? "bouncy"
                : object.lineType === "bouncy"
                  ? "none"
                  : "bouncy",
            });
            break;
          case "d":
            Network.updateObject({
              id,
              lineType: isMultiSelect
                ? "death"
                : object.lineType === "death"
                  ? "none"
                  : "death",
            });
            break;
          case "n":
            Network.updateObject({ id, lineType: "none" });
            break;
          case "x":
          case "delete":
          case "backspace":
            Network.deleteObject(id);
            break;
        }
      }
    }
  });
}
const createReorderHandler = (toBack) => () => {
  const selectedIds = State.get("selectedObjectIds");
  if (selectedIds.length > 0) {
    Network.reorderObjects({ ids: selectedIds, toBack });
  }
};

// public/handlers.js

function createSliderHandlerFactory(elems) {
  return (propName, type) => {
    // Generic approach: build keys from type and propName
    const uiProp = propName === "a" ? "angle" : propName;
    const capitalized = uiProp.charAt(0).toUpperCase() + uiProp.slice(1);
    const prefix = `${type}${capitalized}`; // e.g., 'lineAngle', 'polyScale', 'circleRadius'
    const sliderKey = `${prefix}Slider`;
    const valueKey = `${prefix}Value`;

    const slider = elems[sliderKey];
    const valueLabel = elems[valueKey];
    if (!slider) {
      console.warn(`Slider with key "${sliderKey}" not found in UI elements.`);
      return;
    }

    // REPLACE the old handleInput with this:
    const handleInput = () => {
      const val = slider.value;
      if (valueLabel) valueLabel.innerText = val;

      const selectedIds = State.get("selectedObjectIds");
      if (selectedIds.length === 0) return;

      let parsed = parseFloat(val);
      if (propName === "scale") parsed = parsed / 100.0;

      const objects = State.get("objects");
      let changed = false;

      objects.forEach((obj) => {
        if (selectedIds.includes(obj.id) && obj.type === type) {
          // Handle Polys and Circles (Simple properties)
          if (propName === "scale") obj.scale = parsed;
          else if (propName === "radius") obj.radius = parsed;
          else if (propName === "a") obj.a = parsed;
          else if (propName === "height") obj.height = parsed;
          // Handle Line Geometry (Width/Angle) with Center Pivot
          else if (
            type === "line" &&
            (propName === "width" || propName === "angle")
          ) {
            // 1. Calculate current center
            const cx = (obj.start.x + obj.end.x) / 2;
            const cy = (obj.start.y + obj.end.y) / 2;

            // 2. Determine current or new values
            // If property is missing on obj, calculate from coordinates
            const dx = obj.end.x - obj.start.x;
            const dy = obj.end.y - obj.start.y;

            const currentW =
              typeof obj.width === "number" ? obj.width : Math.hypot(dx, dy);
            const currentA =
              typeof obj.angle === "number"
                ? obj.angle
                : (Math.atan2(dy, dx) * 180) / Math.PI;

            const newW = propName === "width" ? parsed : currentW;
            const newA = propName === "angle" ? parsed : currentA;

            // 3. Update properties
            obj.width = newW;
            obj.angle = newA;

            // 4. Recalculate Start/End from Center
            const rad = (newA * Math.PI) / 180;
            const halfW = newW / 2;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            obj.start.x = cx - cos * halfW;
            obj.start.y = cy - sin * halfW;
            obj.end.x = cx + cos * halfW;
            obj.end.y = cy + sin * halfW;
          }
          changed = true;
        }
      });

      if (changed) State.set("objects", objects);
    };

    // handleChange: Fires on mouseup, sends the final network request
    const handleChange = () => {
      if (valueLabel) valueLabel.innerText = slider.value; // Ensure final value is set

      const selectedIds = State.get("selectedObjectIds");
      if (selectedIds.length === 0) return;

      let parsed = parseFloat(slider.value);
      if (propName === "scale") {
        parsed = parsed / 100.0;
      }

      const payload = {};
      payload[propName] = Number.isFinite(parsed) ? parsed : slider.value;

      // Send one update for each selected object
      selectedIds.forEach((id) => {
        Network.updateObject({ id, ...payload });
      });
    };

    slider.addEventListener("input", handleInput); // Updates label on drag
    slider.addEventListener("change", handleChange); // Sends network request on mouseup
  };
}

// NEW HELPER FUNCTION (for step 5)
function handleGeneratedPolygons(newPolygons) {
  if (newPolygons && newPolygons.length > 0) {
    Network.createObjectsBatch({
      objects: newPolygons,
      isAutoGeneration: true,
    });
    showToast(`Generated ${newPolygons.length} new polygons!`);
  } else {
    showToast("Polygon generation failed.", true);
  }

  // Set path to disappear after 3 seconds
  setTimeout(() => {
    State.set("generatedPath", null);
  }, 3000);
}

// NEW HELPER FUNCTION (for step 6)
function resetStatusToDefault() {
  const drawingMode = State.get("drawingMode") || "line";
  let statusText = "Draw by dragging on canvas.";
  if (drawingMode === "poly") statusText = "Click to start drawing a polygon.";
  if (drawingMode === "circle") statusText = "Click and drag to draw a circle.";
  UI.setStatus(statusText);
}

// --- IN handlers.js ---

// --- IN handlers.js ---

export function handleGlobalZoom(zoomFactor) {
  const objects = State.get("objects");
  if (!objects || objects.length === 0) return;

  // 1. Calculate centroid
  let cx = 0,
    cy = 0,
    count = 0;
  objects.forEach((obj) => {
    if (obj.type === "poly" || obj.type === "circle") {
      cx += obj.c.x;
      cy += obj.c.y;
      count++;
    } else if (obj.type === "line") {
      cx += (obj.start.x + obj.end.x) / 2;
      cy += (obj.start.y + obj.end.y) / 2;
      count++;
    }
  });
  if (count === 0) return;
  cx /= count;
  cy /= count;

  // 2. Prepare local state and batch payload
  const batchPayloads = [];
  const updatedObjects = objects.map((o) => {
    const obj = {
      ...o,
      c: o.c ? { ...o.c } : undefined,
      start: o.start ? { ...o.start } : undefined,
      end: o.end ? { ...o.end } : undefined,
    };

    const payload = { id: obj.id };

    if (obj.type === "poly" || obj.type === "circle") {
      obj.c = {
        x: cx + (obj.c.x - cx) * zoomFactor,
        y: cy + (obj.c.y - cy) * zoomFactor,
      };
      payload.c = obj.c;

      if (obj.type === "poly") {
        obj.scale = (obj.scale || 1) * zoomFactor;
        payload.scale = obj.scale;
      }
      if (obj.type === "circle") {
        obj.radius = (obj.radius || 50) * zoomFactor;
        payload.radius = obj.radius;
      }
    } else if (obj.type === "line") {
      obj.start = {
        x: cx + (obj.start.x - cx) * zoomFactor,
        y: cy + (obj.start.y - cy) * zoomFactor,
      };
      obj.end = {
        x: cx + (obj.end.x - cx) * zoomFactor,
        y: cy + (obj.end.y - cy) * zoomFactor,
      };
      obj.height = (obj.height || 4) * zoomFactor;
      payload.start = obj.start;
      payload.end = obj.end;
      payload.height = obj.height;
    }

    batchPayloads.push(payload);
    return obj;
  });

  // 3. Update locally instantly (prevents rapid-click tearing) and send ONE network request
  State.set("objects", updatedObjects);
  Network.updateObjectsBatch(batchPayloads);
}

export function bindUIEvents() {
  const e = UI.elems;

  safeAddEvent(e.joinBtn, "click", () => {
    const name = e.usernameInput.value;
    const passwordInput = document.getElementById("lobbyPasswordInput"); // Find the password input
    const password = passwordInput ? passwordInput.value : null;

    if (name) {
      // Pass both name and password
      Network.joinLobby(name, password);
      State.set("username", name);
      if (e.readyCheckbox) e.readyCheckbox.checked = false;
    } else {
      showToast("Please enter a name.", true);
    }
  });

  safeAddEvent(e.usernameInput, "keydown", (ev) => {
    if (ev.key === "Enter") e.joinBtn.click();
  });
  if (e.readyCheckbox) e.readyCheckbox.disabled = true;
  safeAddEvent(e.readyCheckbox, "change", (ev) => {
    if (!ev.target.disabled) Network.setReady(ev.target.checked);
  });
  safeAddEvent(e.voteCheckbox, "change", (ev) =>
    Network.voteFinish(ev.target.checked),
  );
  safeAddEvent(e.hideUsernamesCheckbox, "change", (ev) =>
    State.set("hideUsernames", ev.target.checked),
  );
  safeAddEvent(e.chatSendBtn, "click", () => {
    const msg = e.chatInput.value;
    if (msg) Network.sendChat(msg);
    e.chatInput.value = "";
  });
  safeAddEvent(e.chatInput, "keydown", (ev) => {
    if (ev.key === "Enter") e.chatSendBtn.click();
  });
  safeAddEvent(e.canvas, "mousedown", handleCanvasDown);
  window.addEventListener("mousemove", handleCanvasMove);
  window.addEventListener("mouseup", handleCanvasUp);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  const sliderHandler = createSliderHandlerFactory(e);
  sliderHandler("width", "line");
  sliderHandler("height", "line");
  sliderHandler("angle", "line");
  sliderHandler("a", "poly"); // 'a' is for angle
  sliderHandler("scale", "poly");
  sliderHandler("radius", "circle");

  // single select handler (remove line/poly separate handlers)
  const createSelectHandler = () => (ev) => {
    const selectedIds = State.get("selectedObjectIds");
    const objects = State.get("objects");

    if (!selectedIds || selectedIds.length === 0) return;

    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (!obj) return;

      // infer property name based on object type
      const propName =
        obj.type === "line"
          ? "lineType"
          : obj.type === "poly"
            ? "polyType"
            : "circleType"; // Simplified logic
      Network.updateObject({ id, [propName]: ev.target.value });
    });
  };

  // hook it up once
  safeAddEvent(e.typeSelect, "change", createSelectHandler());

  safeAddEvent(e.typeSelect, "change", createSelectHandler());

  const createDeleteHandler = () => () => {
    const selectedIds = State.get("selectedObjectIds");
    if (selectedIds.length > 0) {
      selectedIds.forEach((id) => Network.deleteObject(id));
    }
  };

  safeAddEvent(e.deleteBtn, "click", createDeleteHandler());

  safeAddEvent(e.toFrontBtn, "click", createReorderHandler(false));
  safeAddEvent(e.toBackBtn, "click", createReorderHandler(true));
  safeAddEvent(e.polyToFrontBtn, "click", createReorderHandler(false));
  safeAddEvent(e.polyToBackBtn, "click", createReorderHandler(true));

  safeAddEvent(e.copyMapBtn, "click", () => copyLineInfo());
  safeAddEvent(e.copyLineInfoBtn, "click", () => copyLineInfo());
  safeAddEvent(e.pasteMapBtn, "click", () => pasteLines());

  // Find this block around line 832 and replace it:
  safeAddEvent(e.spawnSizeSlider, "input", (ev) => {
    const size = parseInt(ev.target.value, 10);
    if (e.spawnSizeValue) e.spawnSizeValue.innerText = size;
    // ADD THIS LINE to update visual diameter immediately
    State.set("mapSize", size);
  });
  safeAddEvent(e.spawnSizeSlider, "change", (ev) => {
    const size = parseInt(ev.target.value, 10);
    Network.setMapSize(size);
  });
  safeAddEvent(e.popupCloseBtn, "click", () => UI.hide("gameEndPopup"));

  safeAddEvent(e.drawModeBtn, "click", () => {
    const modes = ["line", "poly", "circle"]; // Exclude "select" from toggle cycle
    const currentMode = State.get("drawingMode") || "line";

    // If currently in select mode (from shift), use the mode before shift
    const modeToToggleFrom = drawingModeBeforeShift || currentMode;

    const currentIndex = modes.indexOf(modeToToggleFrom);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];

    State.set("drawingMode", nextMode);
    e.drawModeBtn.textContent = `Mode: ${nextMode.charAt(0).toUpperCase() + nextMode.slice(1)} (M)`;

    // If we were in shift-select mode, update the mode to return to
    if (drawingModeBeforeShift !== null) {
      drawingModeBeforeShift = nextMode;
    }

    State.clearSelectedObjects();
    State.set("drawingShape", null);
  });

  safeAddEvent(e.changeColorsBtn, "click", () => {
    console.log("Change Colors button clicked");
    Network.changeColors();
  });

  // --- Replace this handler ---
  safeAddEvent(e.autoGenerateBtn, "click", () => {
    // Now just shows the popup
    UI.show("autoGeneratePopup");
  });

  // --- AUTO GENERATE POPUP HANDLERS ---

  safeAddEvent(e.agpCloseBtn, "click", () => UI.hide("autoGeneratePopup"));

  // Close popup if user clicks outside
  safeAddEvent(e.autoGeneratePopup, "click", (ev) => {
    if (ev.target === e.autoGeneratePopup) {
      UI.hide("autoGeneratePopup");
    }
  });

  // 3.3 NEW: Generate Random Shapes (Platformer)
  safeAddEvent(e.agpPlatformerBtn, "click", () => {
    if (State.get("objects").length > 0) {
      showToast("Clear the map before auto-generating!", true);
      return;
    }
    const options = UI.getGenerationOptions();
    try {
      const newPolygons = generatePlatformerMap(options);
      handleGeneratedPolygons(newPolygons);
      UI.hide("autoGeneratePopup");
    } catch (err) {
      console.error("Platformer generation error:", err);
      showToast("Generation failed.", true);
    }
  });

  // 3.2 NEW: Generate map from random simulation (AI Map)
  safeAddEvent(e.agpAiMapBtn, "click", () => {
    console.log("Starting AI Map Generation...");
    const options = UI.getGenerationOptions();
    UI.hide("autoGeneratePopup");
    generateParkourMap(options);
  });

  // 3.1 NEW: Start user controlled-simulation (AI Sim)
  safeAddEvent(e.agpAiSimBtn, "click", () => {
    console.log("Starting AI Simulation...");
    const options = UI.getGenerationOptions();
    UI.hide("autoGeneratePopup");
    startGame(options);
  });

  // Replace the entire form submit handler with this:
  safeAddEvent(e.agpForm, "submit", (ev) => {
    ev.preventDefault();
    const submitter = ev.submitter;

    if (State.get("objects").length > 0) {
      showToast("Clear the map before auto-generating!", true);
      return;
    }
    State.set("generatedPath", null);
    const options = UI.getGenerationOptions();
    window._tempGenOptions = options;
    UI.hide("autoGeneratePopup");

    if (submitter && submitter.id === "agpRandomRouteBtn") {
      // Random Path (Path generated internally, polygons returned)
      const newPolygons = generateRandomPathAndPolygons(options);
      handleGeneratedPolygons(newPolygons);
      delete window._tempGenOptions;
      resetStatusToDefault();
    } else {
      // Custom Path (User Draw)
      startPathDrawing(options)
        .then((pathPoints) => {
          // Now receives the raw path points
          // 1. Generate Ribbon Polygons from the drawn path points
          const newPolygons = generatePolygonsFromPathPoints(
            pathPoints,
            options,
          );

          // 2. Handle the results
          handleGeneratedPolygons(newPolygons);

          // 3. Clear the path visual (startPathDrawing leaves it up)
          State.set("generatedPath", null);
        })
        .catch((err) => {
          console.error("Path drawing failed:", err);
          showToast(err.message || "Path drawing cancelled.", true);
          State.set("generatedPath", null); // Clear visual path on error/cancel
        })
        .finally(() => {
          delete window._tempGenOptions;
          resetStatusToDefault();
        });
    }
  });

  safeAddEvent(e.chatAudioBtn, "click", () => {
    const isSoundOn = !State.get("isNotificationSoundOn");
    State.set("isNotificationSoundOn", isSoundOn);
    e.chatAudioBtn.textContent = isSoundOn ? "🔊" : "🔇";
  });

  safeAddEvent(e.btnZoomIn, "click", () => handleGlobalZoom(1.1));
  safeAddEvent(e.btnZoomOut, "click", () => handleGlobalZoom(0.9));

  /* handlers.js -> bindUIEvents() */

  const toggleMoreOptions = (show) => {
    if (show) UI.show("moreOptionsPopup");
    else UI.hide("moreOptionsPopup");
  };

  // 1. Trigger Click
  safeAddEvent(e.moreOptionsTrigger, "click", () => toggleMoreOptions(true));

  // 2. Close Button Click
  safeAddEvent(e.moCloseBtn, "click", () => toggleMoreOptions(false));

  // 3. Click Outside to Close
  safeAddEvent(e.moreOptionsPopup, "mousedown", (ev) => {
    if (ev.target === e.moreOptionsPopup) toggleMoreOptions(false);
  });

  // 4. Escape Key to Close (Add to existing keydown handler or global)
  window.addEventListener("keydown", (ev) => {
    if (
      ev.key === "Escape" &&
      !e.moreOptionsPopup.classList.contains("hidden")
    ) {
      toggleMoreOptions(false);
    }
  });

  // 2. Fix Y Slants (Top/Bottom edges)
  /* Inside handlers.js -> bindUIEvents() -> btnFixY handler */
  safeAddEvent(e.btnFixY, "click", () => {
    toggleMoreOptions(false);
    const objects = State.get("objects");
    const candidates = [];
    const fixes = [];

    objects.forEach((obj) => {
      if (obj.type !== "poly" || !canSelectObject(obj.id)) return;
      const abs = getAbsoluteVertices(obj); // helper function from utils-client
      if (abs.length !== 4) return;

      const sortedByY = [...abs].sort((a, b) => a.y - b.y);
      const topPair = [sortedByY[0], sortedByY[1]].sort((a, b) => a.x - b.x);
      const bottomPair = [sortedByY[2], sortedByY[3]].sort((a, b) => a.x - b.x);

      let needsFix = false;
      let newTL = { ...topPair[0] },
        newTR = { ...topPair[1] };
      let newBL = { ...bottomPair[0] },
        newBR = { ...bottomPair[1] };

      const topDiff = Math.abs(newTL.y - newTR.y);
      if (topDiff > 0.01 && topDiff < 5) {
        const targetY = Math.max(newTL.y, newTR.y);
        newTL.y = targetY;
        newTR.y = targetY;
        needsFix = true;
      }

      const botDiff = Math.abs(newBL.y - newBR.y);
      if (botDiff > 0.01 && botDiff < 5) {
        const targetY = Math.min(newBL.y, newBR.y);
        newBL.y = targetY;
        newBR.y = targetY;
        needsFix = true;
      }

      if (needsFix) {
        candidates.push(obj.id);
        const fixedAbs = abs.map((v) => {
          if (v === topPair[0]) return newTL;
          if (v === topPair[1]) return newTR;
          if (v === bottomPair[0]) return newBL;
          if (v === bottomPair[1]) return newBR;
          return v;
        });
        fixes.push({ id: obj.id, fixedAbs, obj });
      }
    });

    if (candidates.length > 0) {
      State.set("selectedObjectIds", candidates);
      showToastWithButtons("Polygons with slanted top/bottom edges selected.", [
        {
          name: "Fix Selected",
          onClick: () => {
            const activeIds = State.get("selectedObjectIds");
            const batch = [];
            fixes.forEach((f) => {
              if (activeIds.includes(f.id)) {
                const validPoly = createValidPolygonObject(
                  f.fixedAbs,
                  f.obj.polyType,
                  f.obj,
                );
                if (validPoly) {
                  batch.push({
                    id: f.id,
                    v: validPoly.v,
                    c: validPoly.c,
                    a: validPoly.a,
                    scale: validPoly.scale,
                  });
                }
              }
            });
            if (batch.length > 0) {
              Network.updateObjectsBatch(batch); // CRITICAL: This sends the data to the server
              showToast(`Fixed ${batch.length} polygons.`);
            }
          },
        },
      ]);
    } else {
      showToast("No Y-slanted polygons found.");
    }
  });

  // 3. Fix X Slants (Left/Right edges)
  safeAddEvent(e.btnFixX, "click", () => {
    toggleMoreOptions(false);
    const objects = State.get("objects");
    const candidates = [];
    const fixes = [];

    objects.forEach((obj) => {
      if (obj.type !== "poly" || !canSelectObject(obj.id)) return;
      const abs = getAbsoluteVertices(obj);
      if (abs.length !== 4) return;

      const sortedByX = [...abs].sort((a, b) => a.x - b.x);
      const leftPair = [sortedByX[0], sortedByX[1]].sort((a, b) => a.y - b.y);
      const rightPair = [sortedByX[2], sortedByX[3]].sort((a, b) => a.y - b.y);

      let needsFix = false;
      let newTL = { ...leftPair[0] },
        newBL = { ...leftPair[1] };
      let newTR = { ...rightPair[0] },
        newBR = { ...rightPair[1] };

      const leftDiff = Math.abs(newTL.x - newBL.x);
      if (leftDiff > 0.01 && leftDiff < 2) {
        const targetX = Math.max(newTL.x, newBL.x);
        newTL.x = targetX;
        newBL.x = targetX;
        needsFix = true;
      }

      const rightDiff = Math.abs(newTR.x - newBR.x);
      if (rightDiff > 0.01 && rightDiff < 2) {
        const targetX = Math.min(newTR.x, newBR.x);
        newTR.x = targetX;
        newBR.x = targetX;
        needsFix = true;
      }

      if (needsFix) {
        candidates.push(obj.id);
        const fixedAbs = abs.map((v) => {
          if (v === leftPair[0]) return newTL;
          if (v === leftPair[1]) return newBL;
          if (v === rightPair[0]) return newTR;
          if (v === rightPair[1]) return newBR;
          return v;
        });
        fixes.push({ id: obj.id, fixedAbs, obj });
      }
    });

    if (candidates.length > 0) {
      State.set("selectedObjectIds", candidates);
      showToastWithButtons("Polygons with slanted left/right edges selected.", [
        {
          name: "Fix Selected",
          onClick: () => {
            const activeIds = State.get("selectedObjectIds");
            const batch = [];
            fixes.forEach((f) => {
              if (activeIds.includes(f.id)) {
                const validPoly = createValidPolygonObject(
                  f.fixedAbs,
                  f.obj.polyType,
                  f.obj,
                );
                if (validPoly) {
                  batch.push({
                    id: f.id,
                    v: validPoly.v,
                    c: validPoly.c,
                    a: validPoly.a,
                    scale: validPoly.scale,
                  });
                }
              }
            });
            if (batch.length > 0) {
              Network.updateObjectsBatch(batch);
              showToast(`Fixed ${batch.length} polygons.`);
            }
          },
        },
      ]);
    } else {
      showToast("No X-slanted polygons found.");
    }
  });

  // 4. Delete Out of Bounds Objects
  safeAddEvent(e.btnDelOOB, "click", () => {
    toggleMoreOptions(false);
    const objects = State.get("objects");
    const canvas = UI.elems.canvas;
    const cw = canvas.width || 800;
    const ch = canvas.height || 600;
    const candidates = [];

    objects.forEach((obj) => {
      if (!canSelectObject(obj.id)) return;
      let isOOB = true;
      if (obj.type === "poly") {
        const abs = getAbsoluteVertices(obj);
        isOOB = abs.every((v) => v.x < 0 || v.x > cw || v.y < 0 || v.y > ch);
      } else if (obj.type === "line") {
        const end =
          typeof obj.width === "number" && typeof obj.angle === "number"
            ? {
                x:
                  obj.start.x +
                  Math.cos((obj.angle * Math.PI) / 180) * obj.width,
                y:
                  obj.start.y +
                  Math.sin((obj.angle * Math.PI) / 180) * obj.width,
              }
            : obj.end;
        isOOB =
          (obj.start.x < 0 ||
            obj.start.x > cw ||
            obj.start.y < 0 ||
            obj.start.y > ch) &&
          (end.x < 0 || end.x > cw || end.y < 0 || end.y > ch);
      } else if (obj.type === "circle") {
        isOOB =
          obj.c.x + obj.radius < 0 ||
          obj.c.x - obj.radius > cw ||
          obj.c.y + obj.radius < 0 ||
          obj.c.y - obj.radius > ch;
      }
      if (isOOB) candidates.push(obj.id);
    });

    if (candidates.length > 0) {
      State.set("selectedObjectIds", candidates);
      showToastWithButtons("Out of bounds objects selected.", [
        {
          name: "Delete Selected",
          onClick: () => {
            const activeIds = State.get("selectedObjectIds");
            const toDelete = objects.filter((o) => activeIds.includes(o.id));
            activeIds.forEach((id) => Network.deleteObject(id));
            State.clearSelectedObjects();
          },
        },
      ]);
    } else {
      showToast("No completely out-of-bounds objects found.");
    }
  });

  // 5. Merge Convex Polygons
  safeAddEvent(e.btnMergePolys, "click", () => {
    toggleMoreOptions(false);
    const result = window.mergeClosePolygons();
    if (result && result.success) {
      showToast(
        `Successfully merged ${result.mergedCount} polygons into ${result.createdCount} structures.`,
      );
    } else {
      showToast("No exact shared edges found to merge.", true);
    }
  });
  safeAddEvent(document.getElementById("btnAddFrames"), "click", () => {
    const cw = UI.elems.canvas.width;
    const ch = UI.elems.canvas.height;
    const thickness = 200;
    const stickInside = 10;
    const offset = thickness / 2 - stickInside; // 90 units outside

    const frames = [
      // Top Frame
      {
        type: "line",
        start: { x: 0, y: -offset },
        end: { x: cw, y: -offset },
        height: thickness,
      },

      // Bottom Frame
      {
        type: "line",
        start: { x: 0, y: ch + offset },
        end: { x: cw, y: ch + offset },
        height: thickness,
      },

      // Left Frame
      {
        type: "line",
        start: { x: -offset, y: 0 },
        end: { x: -offset, y: ch },
        height: thickness,
      },

      // Right Frame (FIXED)
      {
        type: "line",
        start: { x: cw + offset, y: 0 },
        end: { x: cw + offset, y: ch },
        height: thickness,
      },
    ];

    Network.createObjectsBatch({ objects: frames, isAutoGeneration: false });
    showToast("Canvas frames added successfully.");
    toggleMoreOptions(false);
  });

  // 2. Lines to Polygons Logic
  safeAddEvent(document.getElementById("btnLinesToPolys"), "click", () => {
    const objects = State.get("objects");
    const linesToConvert = objects.filter(
      (obj) => obj.type === "line" && canSelectObject(obj.id),
    );

    if (linesToConvert.length === 0) {
      showToast("No editable lines found to convert.", true);
      return;
    }

    const newPolys = [];
    const idsToDelete = [];

    linesToConvert.forEach((line) => {
      const start = line.start;
      const dx = line.end.x - start.x;
      const dy = line.end.y - start.y;
      const len = Math.hypot(dx, dy);
      const h = (line.height || 4) / 2;

      if (len === 0) return;

      const nx = (-dy / len) * h;
      const ny = (dx / len) * h;

      const corners = [
        { x: start.x + nx, y: start.y + ny },
        { x: start.x - nx, y: start.y - ny },
        { x: line.end.x - nx, y: line.end.y - ny },
        { x: line.end.x + nx, y: line.end.y + ny },
      ];

      const polyObj = createValidPolygonObject(
        corners,
        line.lineType || "none",
        line,
      );

      if (polyObj) {
        newPolys.push(polyObj);
        idsToDelete.push(line.id);
      }
    });

    if (newPolys.length > 0) {
      Network.createObjectsBatch({
        objects: newPolys,
        isAutoGeneration: false,
      });
      idsToDelete.forEach((id) => Network.deleteObject(id));
      showToast(`Converted ${newPolys.length} lines to polygons.`);
    }

    toggleMoreOptions(false);
  });

  // --- Initialize Zone Indicator State ---
  if (!State.get("zoneIndicator")) {
    State.set("zoneIndicator", { x: 300, y: 150, show: false });
  }

  safeAddEvent(e.cbShowZone, "change", (ev) => {
    const zone = State.get("zoneIndicator") || { x: 300, y: 150 };
    State.set("zoneIndicator", { ...zone, show: ev.target.checked });
  });
}

function safeAddEvent(elem, eventName, handler) {
  if (elem) {
    elem.addEventListener(eventName, handler);
  }
}

// --- IN handlers.js ---

window.mergeClosePolygons = () => {
  const objects = State.get("objects");
  let polys = objects.filter((o) => o.type === "poly");

  // --- Math & Geometry Helpers ---
  function distSq(v1, v2) {
    return (v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2;
  }

  function linesIntersect(p1, p2, p3, p4) {
    let det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
    if (det === 0) return false;
    let lambda =
      ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
    let gamma =
      ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
    return 0 < lambda && lambda < 1 && 0 < gamma && gamma < 1;
  }

  function isSelfIntersecting(verts) {
    for (let i = 0; i < verts.length; i++) {
      let a1 = verts[i],
        a2 = verts[(i + 1) % verts.length];
      for (let j = i + 2; j < verts.length; j++) {
        if (i === 0 && j === verts.length - 1) continue;
        let b1 = verts[j],
          b2 = verts[(j + 1) % verts.length];
        if (linesIntersect(a1, a2, b1, b2)) return true;
      }
    }
    return false;
  }

  function isStrictlyConvex(verts) {
    if (verts.length <= 3) return !isSelfIntersecting(verts);
    let isPositive = null;
    for (let i = 0; i < verts.length; i++) {
      let p0 = verts[i],
        p1 = verts[(i + 1) % verts.length],
        p2 = verts[(i + 2) % verts.length];
      let cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (Math.abs(cross) < 0.1) continue;
      if (isPositive === null) isPositive = cross > 0;
      else if (cross > 0 !== isPositive) return false;
    }
    return !isSelfIntersecting(verts);
  }

  // Removes redundant points on flat walls created by merging
  function simplify(verts, epsilon = 0.5) {
    if (verts.length <= 3) return verts;
    let clean = [];
    for (let i = 0; i < verts.length; i++) {
      let prev = verts[(i - 1 + verts.length) % verts.length];
      let curr = verts[i];
      let next = verts[(i + 1) % verts.length];
      let area = Math.abs(
        (prev.x * (curr.y - next.y) +
          curr.x * (next.y - prev.y) +
          next.x * (prev.y - curr.y)) /
          2,
      );
      if (area > epsilon) clean.push(curr);
    }
    return clean.length >= 3 ? clean : verts;
  }

  function getAbsVerts(obj) {
    const a = obj.a || 0,
      s = obj.scale || 1,
      rad = (a * Math.PI) / 180;
    return (obj.v || []).map((lv) => ({
      x: obj.c.x + (lv.x * s * Math.cos(rad) - lv.y * s * Math.sin(rad)),
      y: obj.c.y + (lv.x * s * Math.sin(rad) + lv.y * s * Math.cos(rad)),
    }));
  }

  // --- Prepare Data ---
  let polyData = polys.map((p) => ({
    id: p.id,
    polyType: p.polyType,
    color: p.color,
    verts: getAbsVerts(p),
  }));

  let changed = true,
    iter = 0;
  let mergedIds = new Set();
  const TOLERANCE_SQ = 2.0; // Max squared pixel distance to consider vertices overlapping

  while (changed && iter < 200) {
    changed = false;
    iter++;
    for (let i = 0; i < polyData.length; i++) {
      for (let j = i + 1; j < polyData.length; j++) {
        let pA = polyData[i],
          pB = polyData[j];
        if (pA.polyType !== pB.polyType) continue;

        let mergedVerts = null;
        let A = pA.verts,
          B = pB.verts;

        // Search for a shared edge
        for (let a = 0; a < A.length; a++) {
          let a1 = A[a],
            a2 = A[(a + 1) % A.length];
          for (let b = 0; b < B.length; b++) {
            let b1 = B[b],
              b2 = B[(b + 1) % B.length];

            // If edge A goes opposite to edge B, they are a shared wall
            if (
              distSq(a1, b2) < TOLERANCE_SQ &&
              distSq(a2, b1) < TOLERANCE_SQ
            ) {
              let stitched = [];
              let currA = (a + 1) % A.length;
              while (currA !== a) {
                stitched.push(A[currA]);
                currA = (currA + 1) % A.length;
              }
              stitched.push(A[a]);

              let currB = (b + 1) % B.length;
              while (currB !== b) {
                if (currB !== (b + 1) % B.length) stitched.push(B[currB]);
                currB = (currB + 1) % B.length;
              }

              // Strictly enforce convexity and validity before accepting the merge
              if (isStrictlyConvex(stitched)) {
                mergedVerts = simplify(stitched);
              }
            }
          }
          if (mergedVerts) break;
        }

        if (mergedVerts) {
          mergedIds.add(pA.id);
          mergedIds.add(pB.id);

          polyData.splice(j, 1);
          polyData.splice(i, 1);

          // Recalculate physical center
          let cx = 0,
            cy = 0;
          mergedVerts.forEach((v) => {
            cx += v.x;
            cy += v.y;
          });
          cx /= mergedVerts.length;
          cy /= mergedVerts.length;

          let mergedColor =
            pA.color !== pB.color
              ? Math.random() > 0.5
                ? pA.color
                : pB.color
              : pA.color;

          let newObj = {
            type: "poly",
            c: { x: cx, y: cy },
            v: mergedVerts.map((v) => ({ x: v.x - cx, y: v.y - cy })),
            a: 0,
            scale: 1,
            polyType: pA.polyType,
            color: mergedColor,
          };

          polyData.push({
            id: "NEW_" + Math.random(),
            polyType: pA.polyType,
            color: mergedColor,
            verts: mergedVerts,
            objData: newObj,
          });

          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  // Push updates to network
  Array.from(mergedIds).forEach((id) => {
    if (!id.startsWith("NEW_")) Network.deleteObject(id);
  });

  const finalCreates = polyData
    .filter((p) => p.id.startsWith("NEW_"))
    .map((p) => p.objData);

  if (finalCreates.length > 0) {
    Network.createObjectsBatch({
      objects: finalCreates,
      isAutoGeneration: true,
    });
    return {
      success: true,
      mergedCount: mergedIds.size,
      createdCount: finalCreates.length,
    };
  } else {
    return { success: false };
  }
};
