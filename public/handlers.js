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

const keysDown = new Set();
let nudgeLoopId = null;

// --- Canvas Event Handlers ---
function handleCanvasDown(e) {
  if (e.button !== 0 || e.target !== UI.elems.canvas) return;

  const point = pointFromEventOnCanvas(e);
  State.set("mouse", point);
  mouseMovedSinceDown = false;
  mouseDownTime = Date.now();
  const drawingMode = State.get("drawingMode");

  const spawn = State.get("spawnCircle");
  if (spawn && distance(point, spawn) < spawn.diameter / 2 + 5) {
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

  // Don't auto-clear selection for poly mode here; we need special behaviour:
  if (!e.shiftKey && drawingMode !== "poly") {
    State.clearSelectedObjects();
  }

  // If already drawing (adding vertices) then add the next point
  if (State.get("drawingShape")) {
    if (drawingMode === "poly") {
      addPolygonPoint(point);
    }
    return;
  }

  const hitObjectId = getHitObjectId(point, State.get("objects"));

  if (hitObjectId && canSelectObject(hitObjectId)) {
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

    const selectedObjects = State.get("objects").filter((o) =>
      State.isSelected(o.id),
    );
    State.set("draggingPreview", {
      mouseStart: point,
      originalObjects: selectedObjects.map((o) => ({ ...o })),
    });
    return;
  }

  // Click on empty canvas while in poly mode:
  if (drawingMode === "poly") {
    const selectedIds = State.get("selectedObjectIds") || [];
    if (selectedIds.length > 0) {
      // If an object is already selected, just deselect and DO NOT start drawing.
      State.clearSelectedObjects();
      console.log("Cleared selection.");
      return;
    }

    // Otherwise — start polygon drawing immediately on this single tap
    State.set("drawingShape", { type: "poly", vertices: [point] });
    UI.setStatus(
      "Click to add points, close shape to finish, or 'X' to cancel.",
    );
    return;
  }

  // Action on empty canvas depends on the current mode
  if (drawingMode === "line" || drawingMode === "select") {
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
  } else if (drawingMode === "poly") {
    // Defer starting polygon to handle brief clicks
  }
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
    Network.createObjectsBatch({ objects: polygonsToSend });

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
      -radius,          // Half off the left
      Math.min(width + radius, point.x) // Half off the right
    );
    const y = Math.max(
      -radius,          // Half off the top
      Math.min(height + radius, point.y) // Half off the bottom
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
      -halfWidth,                   // Half off the left
      Math.min(canvasWidth - halfWidth, point.x) // Half off the right
    );
    const y = Math.max(
      -halfHeight,                  // Half off the top
      Math.min(canvasHeight - halfHeight, point.y) // Half off the bottom
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
      if (originalObject.type === "poly") {
        updatedObject = {
          ...originalObject,
          c: {
            x: originalObject.c.x + dx,
            y: originalObject.c.y + dy,
          },
        };
      } else {
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
    }
  }
}

function handleCanvasUp(e) {
  const drawingMode = State.get("drawingMode");

  if (isDraggingSpawn) {
    const spawn = State.get("spawnCircle");
    Network.setSpawnCircle({ x: spawn.x, y: spawn.y });
  }
  if (isDraggingCapZone) {
    const cz = State.get("capZone");
    Network.setCapZone({ x: cz.x, y: cz.y });
  }
  if (isDraggingObject) {
    const preview = State.get("draggingPreview");
    if (preview && preview.objects && mouseMovedSinceDown) {
      preview.objects.forEach((obj) => {
        let payload = { id: obj.id };
        if (obj.type === "poly") payload.c = obj.c;
        if (obj.type === "line") {
          payload.start = obj.start;
          payload.end = obj.end;
        }
        Network.updateObject(payload);
      });
    }
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
      Network.createObject({ start: startPt, end: endPt });
    }
  }

  // Cleanup
  isDraggingObject = false;
  isDraggingSpawn = false;
  isDraggingCapZone = false;
  isDrawing = false;
  State.set("startPt", null);
  State.set("selectionBox", null);
  State.set("draggingPreview", null);
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
  if (keysDown.size === 0) {
    stopNudgeLoop();
  }
}

function handleKeyDown(e) {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "SELECT"))
    return;
  if (!State.get("gameActive")) return;

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
        const objectIds = objects.map((o) => o.id);
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
    selectedIds.forEach((id) => Network.reorderObject({ id, toBack: true }));
    return;
  }
  if (key === "]") {
    e.preventDefault();
    selectedIds.forEach((id) => Network.reorderObject({ id, toBack: false }));
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

function createSliderHandlerFactory(elems) {
  return (propName, type) => {
    const isPoly = type === "poly";
    const uiProp = propName === "a" ? "angle" : propName;
    const capitalized = uiProp.charAt(0).toUpperCase() + uiProp.slice(1);
    const prefix = isPoly ? `poly${capitalized}` : `line${capitalized}`;
    const sliderKey = `${prefix}Slider`;
    const valueKey = `${prefix}Value`;

    const slider = elems[sliderKey];
    const valueLabel = elems[valueKey];
    if (!slider) return;

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
    if (name) {
      Network.joinLobby(name);
      State.set("username", name);
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

  const createSelectHandler = (type) => (ev) => {
    const selectedIds = State.get("selectedObjectIds");
    const propName = type === "line" ? "lineType" : "polyType";
    if (selectedIds.length > 0) {
      selectedIds.forEach((id) => {
        Network.updateObject({ id, [propName]: ev.target.value });
      });
    }
  };

  safeAddEvent(e.lineTypeSelect, "change", createSelectHandler("line"));
  safeAddEvent(e.polyTypeSelect, "change", createSelectHandler("poly"));

  const createDeleteHandler = () => () => {
    const selectedIds = State.get("selectedObjectIds");
    if (selectedIds.length > 0) {
      selectedIds.forEach((id) => Network.deleteObject(id));
    }
  };

  safeAddEvent(e.deleteLineBtn, "click", createDeleteHandler());
  safeAddEvent(e.deletePolyBtn, "click", createDeleteHandler());

  const createReorderHandler = (toBack) => () => {
    const selectedIds = State.get("selectedObjectIds");
    if (selectedIds.length > 0) {
      selectedIds.forEach((id) => Network.reorderObject({ id, toBack }));
    }
  };

  safeAddEvent(e.toFrontBtn, "click", createReorderHandler(false));
  safeAddEvent(e.toBackBtn, "click", createReorderHandler(true));
  safeAddEvent(e.polyToFrontBtn, "click", createReorderHandler(false));
  safeAddEvent(e.polyToBackBtn, "click", createReorderHandler(true));

  safeAddEvent(e.copyMapBtn, "click", () => copyLineInfo());
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
    const modes = ["line", "poly", "select"];
    const currentMode = State.get("drawingMode") || "line";
    const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
    const nextMode = modes[nextIndex];
    State.set("drawingMode", nextMode);
    e.drawModeBtn.textContent = `Mode: ${nextMode.charAt(0).toUpperCase() + nextMode.slice(1)} (M)`;

    State.clearSelectedObjects();
    State.set("drawingShape", null);
  });

  safeAddEvent(e.chatAudioBtn, "click", () => {
    const isSoundOn = !State.get("isChatSoundOn");
    State.set("isChatSoundOn", isSoundOn);
  });

  safeAddEvent(e.autoGenerateBtn, "click", () => {
    // Safety Check: Do not run if objects already exist.
    if (State.get("objects").length > 0) {
      showToast("Clear the map before auto-generating!", true);
      return;
    }

    const newPolygons = generateMap();

    if (newPolygons && newPolygons.length > 0) {
      Network.createObjectsBatch({ objects: newPolygons });
      showToast("Map generated successfully!");
    } else {
      showToast("Map generation failed. Please try again.", true);
    }
  });
}

function safeAddEvent(elem, eventName, handler) {
  if (elem) {
    elem.addEventListener(eventName, handler);
  }
}
