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
} from "./utils-client.js";
import { copyLineInfo, pasteLines } from "./copyPasteLines.js";
import { splitConcaveIntoConvex } from "./splitConvex.js";
import { generate as generateMap } from "./auto-generator.js";
import { showToast } from "./utils-client.js";

// --- State Flags for Mouse Actions ---
let isDraggingObject = false;
let isDraggingSpawn = false;
let isDraggingCapZone = false;
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

  const point = pointFromEventOnCanvas(e);
  State.set("mouse", point);
  mouseMovedSinceDown = false;
  mouseDownTime = Date.now();

  const drawingMode = State.get("drawingMode");

  // quick-hit: spawn / cap zone
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

    const polygonsToSend = convexPolygons.map((convexPoly) => {
      const absoluteVertices = convexPoly.v.map((p) => ({ x: p[0], y: p[1] }));
      const center = calculatePolygonCenter(absoluteVertices);
      const relativeVertices = absoluteVertices.map((p) => ({
        x: p.x - center.x,
        y: p.y - center.y,
      }));
      return { v: relativeVertices, c: center };
    });
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
            const newCenter = calculatePolygonCenter(absoluteVertices);
            const newRelative = localVerticesFromAbsolute(
              absoluteVertices,
              newCenter,
              previewObj.a || 0,
              previewObj.scale || 1,
            );

            // IMPORTANT: update local state first so UI doesn't revert or treat this as an object-move
            const objs = State.get("objects") || [];
            const updatedObjs = objs.map((o) =>
              o.id === objectId ? { ...o, v: newRelative, c: newCenter } : o,
            );
            State.set("objects", updatedObjs);

            // then broadcast the canonical change to the server
            Network.updateObject({
              id: objectId,
              v: newRelative,
              c: newCenter,
            });
          } else {
            // Multiple convex polygons -> create new objects, remove original
            const polygonsToSend = convexPolygons.map((convexPoly) => {
              const absoluteVertices = convexPoly.v.map((p) => ({
                x: p[0],
                y: p[1],
              }));
              const center = calculatePolygonCenter(absoluteVertices);
              const relativeVertices = absoluteVertices.map((p) => ({
                x: p.x - center.x,
                y: p.y - center.y,
              }));
              // --- FIX: Inherit properties from the original object ---
              return {
                v: relativeVertices,
                c: center,
                a: originalObject.a || 0,
                scale: originalObject.scale || 1,
                polyType: originalObject.polyType || "none",
              };
            });

            // Create the new polygons first, then delete the old
            Network.deleteObject(objectId);
            Network.createObjectsBatch({ objects: polygonsToSend });
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

function startNudgeLoop() {
  if (nudgeLoopId) return;

  const nudgeLoop = () => {
    const selectedIds = State.get("selectedObjectIds");
    if (selectedIds.length === 0 || keysDown.size === 0) {
      stopNudgeLoop();
      return;
    }

    const nudge = { x: 0, y: 0 };
    if (keysDown.has("ArrowUp")) nudge.y -= 1;
    if (keysDown.has("ArrowDown")) nudge.y += 1;
    if (keysDown.has("ArrowLeft")) nudge.x -= 1;
    if (keysDown.has("ArrowRight")) nudge.x += 1;

    if (nudge.x !== 0 || nudge.y !== 0) {
      selectedIds.forEach((id) => {
        Network.updateObject({ id, nudge });
      });
    }
    nudgeLoopId = requestAnimationFrame(nudgeLoop);
  };
  nudgeLoopId = requestAnimationFrame(nudgeLoop);
}

function stopNudgeLoop() {
  if (nudgeLoopId) {
    cancelAnimationFrame(nudgeLoopId);
    nudgeLoopId = null;
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
    case "z":
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleUndoLastObject();
      }
      return;
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

    const handleInput = () => {
      if (valueLabel) valueLabel.innerText = slider.value;
      const selectedIds = State.get("selectedObjectIds");
      if (selectedIds.length === 0) return;

      let parsed = parseFloat(slider.value);
      if (propName === "scale") {
        parsed = parsed / 100.0;
      }

      const payload = {};
      payload[propName] = Number.isFinite(parsed) ? parsed : slider.value;
      selectedIds.forEach((id) => {
        Network.updateObject({ id, ...payload });
      });
    };

    slider.addEventListener("input", handleInput);
  };
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

  safeAddEvent(e.spawnSizeSlider, "input", (ev) => {
    const size = parseInt(ev.target.value, 10);
    if (e.spawnSizeValue) e.spawnSizeValue.innerText = size;
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

  // In handlers.js, inside bindUIEvents()

  // --- Replace this handler ---
  safeAddEvent(e.autoGenerateBtn, "click", () => {
    // Now just shows the popup
    UI.show("autoGeneratePopup");
  });

  // --- Add these new handlers ---
  safeAddEvent(e.agpCloseBtn, "click", () => UI.hide("autoGeneratePopup"));

  // Close popup if user clicks outside the content box
  safeAddEvent(e.autoGeneratePopup, "click", (ev) => {
    if (ev.target === e.autoGeneratePopup) {
      UI.hide("autoGeneratePopup");
    }
  });

  // Handle the "Generate" button click
  safeAddEvent(e.agpForm, "submit", (ev) => {
    ev.preventDefault();

    // 1. Safety Check
    if (State.get("objects").length > 0) {
      showToast("Clear the map before auto-generating!", true);
      return;
    }

    // 2. Get validated options from UI
    const options = UI.getGenerationOptions();

    // 3. Run generation
    const newPolygons = generateMap(options);

    // 4. Send to server and give feedback
    if (newPolygons && newPolygons.length > 0) {
      Network.createObjectsBatch({
        objects: newPolygons,
        isAutoGeneration: true,
      });
      showToast(`Generated ${newPolygons.length} new polygons!`);
      UI.hide("autoGeneratePopup"); // Auto-close on success
    } else {
      showToast("Map generation failed. Please try again.", true);
    }
  });

  safeAddEvent(e.chatAudioBtn, "click", () => {
    const isSoundOn = !State.get("isNotificationSoundOn");
    State.set("isNotificationSoundOn", isSoundOn);
    e.chatAudioBtn.textContent = isSoundOn ? "🔊" : "🔇";
  });
}

function safeAddEvent(elem, eventName, handler) {
  if (elem) {
    elem.addEventListener(eventName, handler);
  }
}
