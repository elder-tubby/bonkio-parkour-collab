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
} from "./utils-client.js";
import { copyLineInfo, pasteLines } from "./copyPasteLines.js";
import { splitConcaveIntoConvex } from "./splitConvex.js";

// --- State Flags for Mouse Actions ---
let isDraggingObject = false;
let isDraggingSpawn = false;
let isDraggingCapZone = false;
let isDrawingLine = false;
let mouseMovedSinceDown = false;

const keysDown = new Set();
let nudgeLoopId = null;

// --- Canvas Event Handlers ---
function handleCanvasDown(e) {
  if (e.button !== 0 || e.target !== UI.elems.canvas) return;

  const point = pointFromEventOnCanvas(e);
  State.set("mouse", point);
  mouseMovedSinceDown = false;

  // **FIX**: Prevent any object selection if a new shape is currently being drawn.
  if (!State.get("drawingShape")) {
    const hitObjectId = getHitObjectId(point, State.get("objects"));
    if (hitObjectId) {
      State.set("selectedObjectId", hitObjectId);
      isDraggingObject = true;
      const object = State.get("objects").find((o) => o.id === hitObjectId);
      State.set("draggingPreview", {
        mouseStart: point,
        originalObject: object,
        object: { ...object },
      });
      return;
    }
  }

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

  if (State.get("isDrawingPoly")) {
    const currentShape = State.get("drawingShape");
    if (!currentShape || currentShape.type !== "poly") {
      State.set("drawingShape", { type: "poly", vertices: [point] });
      // **FEATURE**: Update status text when drawing begins.
      UI.setStatus(
        "Click to add points, close shape to finish, or 'X' to cancel.",
      );
    } else {
      const vertices = currentShape.vertices;
      if (vertices.length > 1 && distance(point, vertices[0]) < 10) {
        if (vertices.length < 3) {
          State.set("drawingShape", null);
          UI.setStatus("Click on the canvas to start drawing a polygon.");

          return;
        }

        const shapeToSplit = { v: vertices.map((p) => [p.x, p.y]) };
        const convexPolygons = splitConcaveIntoConvex(shapeToSplit);

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
          return { v: relativeVertices, c: center };
        });
        Network.createObjectsBatch({ objects: polygonsToSend });

        State.set("drawingShape", null);
      } else {
        const updatedVertices = [...vertices, point];
        State.set("drawingShape", {
          ...currentShape,
          vertices: updatedVertices,
        });
      }
    }
    return;
  }

  State.set("selectedObjectId", null);
  isDrawingLine = true;
  State.set("startPt", point);
}

function handleCanvasMove(e) {
  const point = pointFromEventOnCanvas(e);
  const lastPoint = State.get("mouse");
  if (point.x !== lastPoint.x || point.y !== lastPoint.y) {
    mouseMovedSinceDown = true;
  }
  State.set("mouse", point);

  // **FEATURE**: Hover Tooltip Logic
  const tooltip = UI.elems.tooltip;
  if (tooltip) {
    const hoveredObject = getHoveredObject(point, State.get("objects"));
    // Show tooltip only if hovering an object that is not currently selected
    if (hoveredObject && hoveredObject.id !== State.get("selectedObjectId")) {
      let tooltipText = "";
      if (hoveredObject.type === "line") {
        const { width, height, angle } = getLineProps(hoveredObject);
        tooltipText = `Type:  Line
  X:     ${hoveredObject.start.x.toFixed(1)}
  Y:     ${hoveredObject.start.y.toFixed(1)}
  W:     ${width.toFixed(1)}
  H:     ${height.toFixed(1)}
  Angle: ${normalizeAngle(angle).toFixed(1)}°`;
      } else if (hoveredObject.type === "poly") {
        tooltipText = `Type: Polygon
  X:    ${hoveredObject.c.x.toFixed(1)}
  Y:    ${hoveredObject.c.y.toFixed(1)}`;
      }
      tooltip.innerHTML = tooltipText;
      tooltip.style.display = "block";
      tooltip.style.left = `${e.clientX + 15}px`;
      tooltip.style.top = `${e.clientY + 15}px`;
    } else {
      tooltip.style.display = "none";
    }
  }

  if (State.get("isDrawingPoly") && State.get("drawingShape")) {
    return; // Keep this to allow live preview line to work without other move logic interfering
  }

  if (isDraggingSpawn) {
    const spawn = State.get("spawnCircle");
    State.set("spawnCircle", { ...spawn, x: point.x, y: point.y });
    return;
  }
  if (isDraggingCapZone) {
    const cz = State.get("capZone");
    State.set("capZone", {
      ...cz,
      x: point.x - cz.width / 2,
      y: point.y - cz.height / 2,
    });
    return;
  }
  if (isDraggingObject) {
    const preview = State.get("draggingPreview");
    if (!preview || !preview.object) return;
    const dx = point.x - preview.mouseStart.x;
    const dy = point.y - preview.mouseStart.y;
    let updatedObject;
    if (preview.object.type === "poly") {
      updatedObject = {
        ...preview.originalObject,
        c: {
          x: preview.originalObject.c.x + dx,
          y: preview.originalObject.c.y + dy,
        },
      };
    } else {
      // 'line'
      updatedObject = {
        ...preview.originalObject,
        start: {
          x: preview.originalObject.start.x + dx,
          y: preview.originalObject.start.y + dy,
        },
        end: {
          x: preview.originalObject.end.x + dx,
          y: preview.originalObject.end.y + dy,
        },
      };
    }
    State.set("draggingPreview", { ...preview, object: updatedObject });
    return;
  }
  if (isDrawingLine) {
    const startPt = State.get("startPt");
    if (startPt) {
      State.set("drawingShape", { type: "line", start: startPt, end: point });
    }
  }
}

// handlers.js

function handleCanvasUp(e) {
  // **FIX**: The original code would 'return' here if isDrawingPoly was true,
  // preventing the flags below from being reset. Removing the early return
  // and letting the full function run fixes the "stuck object" bug.

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
    if (preview && preview.object && mouseMovedSinceDown) {
      const { id, type } = preview.originalObject;
      let payload = { id };
      if (type === "poly") payload.c = preview.object.c;
      if (type === "line") {
        payload.start = preview.object.start;
        payload.end = preview.object.end;
      }
      Network.updateObject(payload);
    }
  }

  // This check prevents a new line from being created upon finishing a polygon click.
  if (isDrawingLine && !State.get("isDrawingPoly")) {
    const startPt = State.get("startPt");
    const endPt = State.get("mouse");
    if (startPt && distance(startPt, endPt) > 5) {
      Network.createObject({ start: startPt, end: endPt });
    }
  }

  // This cleanup logic now runs correctly in all cases.
  isDraggingObject = false;
  isDraggingSpawn = false;
  isDraggingCapZone = false;
  isDrawingLine = false;
  State.set("startPt", null);
  // We avoid clearing the drawingShape for polygons, as it's managed by sequential clicks.
  if (!State.get("isDrawingPoly")) {
    State.set("drawingShape", null);
  }
  State.set("draggingPreview", null);
}
// --- Keyboard Handlers ---

function startNudgeLoop() {
  if (nudgeLoopId) return;

  const nudgeLoop = () => {
    const selectedId = State.get("selectedObjectId");
    if (!selectedId || keysDown.size === 0) {
      stopNudgeLoop();
      return;
    }

    const nudge = { x: 0, y: 0 };
    if (keysDown.has("ArrowUp")) nudge.y -= 1;
    if (keysDown.has("ArrowDown")) nudge.y += 1;
    if (keysDown.has("ArrowLeft")) nudge.x -= 1;
    if (keysDown.has("ArrowRight")) nudge.x += 1;

    if (nudge.x !== 0 || nudge.y !== 0) {
      Network.updateObject({ id: selectedId, nudge });
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

  // FIX: Cancel polygon drawing with 'x'
  if (key === "x" && State.get("isDrawingPoly") && State.get("drawingShape")) {
    e.preventDefault();
    State.set("drawingShape", null);
    UI.setStatus("Click to start drawing a new polygon.");
    return;
  }
  const selectedId = State.get("selectedObjectId");

  const chatInput = UI.elems.chatInput;
  if (key === "enter" && document.activeElement !== chatInput) {
    e.preventDefault();
    chatInput.focus();
    return;
  }
  if (key === "p") {
    e.preventDefault();
    UI.elems.drawPolyBtn?.click();
    return;
  }
  if (key === "z" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleUndoLastObject(); // Call to undefined function, assuming it exists
    return;
  }
  if (key === "h") {
    e.preventDefault();
    const checkbox = UI.elems.hideUsernamesCheckbox;
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      State.set("hideUsernames", checkbox.checked);
    }
    return;
  }
  if (key === "c") {
    copyLineInfo(State.get("objects"));
    return;
  }

  if (!selectedId) return;
  const object = State.get("objects").find((o) => o.id === selectedId);
  if (!object) return;

  // Nudge
  if (e.key.startsWith("Arrow") && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    keysDown.add(e.key);
    startNudgeLoop();
    return;
  }

  if (object.type === "poly") {
    // Angle
    if (e.shiftKey && (key === "arrowleft" || key === "arrowright")) {
      e.preventDefault();
      const step = e.ctrlKey ? 10 : 1;
      const delta = key === "arrowleft" ? -step : step;
      Network.updateObject({ id: selectedId, angleDelta: delta });
      return;
    }
    // Scale
    if (e.altKey && (key === "arrowup" || key === "arrowdown")) {
      e.preventDefault();
      // **FIX**: Add a client-side guard to respect the new max scale value.
      if (key === "arrowup" && object.scale >= 5) return;
      const delta = key === "arrowup" ? 0.1 : -0.1; // Server expects a small delta
      Network.updateObject({ id: selectedId, scaleDelta: delta });
      return;
    }
    switch (key) {
      case "b":
        Network.updateObject({
          id: selectedId,
          polyType: object.polyType === "bouncy" ? "none" : "bouncy",
        });
        break;
      case "d":
        Network.updateObject({
          id: selectedId,
          polyType: object.polyType === "death" ? "none" : "death",
        });
        break;
      case "n":
        Network.updateObject({ id: selectedId, polyType: "none" });
        break;
      case "x":
      case "delete":
      case "backspace":
        Network.deleteObject(selectedId);
        break;
    }
  } else if (object.type === "line") {
    // Width/Height
    if (e.altKey && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      if (key === "arrowleft" || key === "arrowright") {
        const delta = key === "arrowleft" ? -step : step;
        Network.updateObject({ id: selectedId, widthDelta: delta });
      } else if (key === "arrowup" || key === "arrowdown") {
        const delta = key === "arrowup" ? step : -step;
        Network.updateObject({ id: selectedId, heightDelta: delta });
      }
      return;
    }
    // Angle
    if (e.shiftKey && (key === "arrowleft" || key === "arrowright")) {
      e.preventDefault();
      const step = e.ctrlKey ? 10 : 1;
      const delta = key === "arrowleft" ? -step : step;
      Network.updateObject({ id: selectedId, angleDelta: delta });
      return;
    }
    switch (key) {
      case "b":
        Network.updateObject({
          id: selectedId,
          lineType: object.lineType === "bouncy" ? "none" : "bouncy",
        });
        break;
      case "d":
        Network.updateObject({
          id: selectedId,
          lineType: object.lineType === "death" ? "none" : "death",
        });
        break;
      case "n":
        Network.updateObject({ id: selectedId, lineType: "none" });
        break;
      case "x":
      case "delete":
      case "backspace":
        Network.deleteObject(selectedId);
        break;
    }
  }
}
function createSliderHandlerFactory(elems) {
  return (propName, type) => {
    const isPoly = type === "poly";

    // UI uses "angle" in ids (polyAngleSlider / polyAngleValue),
    // but server side uses property "a" for polygon angle.
    // Use uiProp for building DOM keys, keep propName for payload.
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
      const id = State.get("selectedObjectId");
      if (!id) return;

      let parsed = parseFloat(slider.value);

      // FIX: Normalize scale value from slider (10-1000) back to server range (0.1-10)
      if (propName === "scale") {
        parsed = parsed / 100.0;
      }

      const payload = { id };
      payload[propName] = Number.isFinite(parsed) ? parsed : slider.value;
      Network.updateObject(payload);
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

  safeAddEvent(e.drawPolyBtn, "click", () => {
    const isDrawing = !State.get("isDrawingPoly");
    State.set("isDrawingPoly", isDrawing);
    e.drawPolyBtn.textContent = `Draw Polygon (${isDrawing ? "ON" : "OFF"})`;
    e.drawPolyBtn.style.backgroundColor = isDrawing ? "#4CAF50" : "";
    State.set("selectedObjectId", null);
    State.set("drawingShape", null);
    if (isDrawing) {
      UI.setStatus("Click on the canvas to start drawing a polygon.");
    } else {
      UI.setStatus("Draw by dragging on canvas");
    }
  });

  const sliderHandler = createSliderHandlerFactory(e);
  sliderHandler("width", "line");
  sliderHandler("height", "line");
  sliderHandler("angle", "line");
  sliderHandler("a", "poly"); // 'a' is for angle
  sliderHandler("scale", "poly");

  safeAddEvent(e.lineTypeSelect, "change", (ev) => {
    const id = State.get("selectedObjectId");
    if (id) Network.updateObject({ id, lineType: ev.target.value });
  });
  safeAddEvent(e.deleteLineBtn, "click", () => {
    const id = State.get("selectedObjectId");
    if (id) Network.deleteObject(id);
  });
  safeAddEvent(e.polyTypeSelect, "change", (ev) => {
    const id = State.get("selectedObjectId");
    if (id) Network.updateObject({ id, polyType: ev.target.value });
  });
  safeAddEvent(e.deletePolyBtn, "click", () => {
    const id = State.get("selectedObjectId");
    if (id) Network.deleteObject(id);
  });

  safeAddEvent(e.toFrontBtn, "click", () =>
    Network.reorderObject({ id: State.get("selectedObjectId"), toBack: false }),
  );
  safeAddEvent(e.toBackBtn, "click", () =>
    Network.reorderObject({ id: State.get("selectedObjectId"), toBack: true }),
  );
  safeAddEvent(e.polyToFrontBtn, "click", () =>
    Network.reorderObject({ id: State.get("selectedObjectId"), toBack: false }),
  );
  safeAddEvent(e.polyToBackBtn, "click", () =>
    Network.reorderObject({ id: State.get("selectedObjectId"), toBack: true }),
  );

  safeAddEvent(e.copyLineInfoBtn, "click", () =>
    copyLineInfo(State.get("objects")),
  );
  safeAddEvent(e.copyMapBtn, "click", () => copyLineInfo(State.get("objects")));
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
}

function safeAddEvent(elem, eventName, handler) {
  if (elem) {
    elem.addEventListener(eventName, handler);
  }
}
