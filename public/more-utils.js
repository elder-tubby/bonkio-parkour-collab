// small helper: schedule network move to avoid spamming server
const moveTimeouts = new Map();

// Keydown handler: add arrow to set and start loop if needed
// New constant for the nudge amount
const NUDGE_STEP = 1;

const pendingSends = new Map(); // lineId -> timeoutId
const pendingProps = new Map(); // lineId -> { width?, height?, angle? }
const PROP_DEBOUNCE_MS = 150;


function scheduleSendProps(lineId, props) {
  if (!lineId) return;
  const existing = pendingProps.get(lineId) || {};
  pendingProps.set(lineId, { ...existing, ...props });

  const t = pendingSends.get(lineId);
  if (t) clearTimeout(t);

  const to = setTimeout(() => {
    sendPendingProps(lineId);
  }, PROP_DEBOUNCE_MS);

  pendingSends.set(lineId, to);
}

function sendPendingProps(lineId) {
  const props = pendingProps.get(lineId);
  if (!props) return;
  pendingProps.delete(lineId);

  const to = pendingSends.get(lineId);
  if (to) {
    clearTimeout(to);
    pendingSends.delete(lineId);
  }

  // send to server (Network.changeLineProps expects id + props)
  Network.emitLineUpdate({ id: lineId, width: props.width, height: props.height, angle: props.angle });

}

// Flush pending sends for a given id (called on deselect etc.)
function flushPendingProps(lineId) {
  if (!lineId) return;
  if (pendingSends.has(lineId) || pendingProps.has(lineId)) {
    sendPendingProps(lineId);
  }
}


// ---- Canvas & drag-related handlers ----

/*
State usage:
- "startPt" : when user starts drawing a NEW line
- "currentLine": preview while drawing
- "draggingLine": { id, mouseStart, origStart, origEnd } while dragging an existing line
- spawnCircle.dragging / capZone.dragging booleans are stored on their objects
*/

// helper math
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function degToRad(d) {
  return (d * Math.PI) / 180;
}
function radToDeg(r) {
  return (r * 180) / Math.PI;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function computeAngleDeg(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
function endpointFromStartAngleWidth(start, angleDeg, width) {
  const r = degToRad(angleDeg);
  return { x: start.x + Math.cos(r) * width, y: start.y + Math.sin(r) * width };
}


function scheduleMoveLine(id, start, end, delay = 80) {
  if (!id) return;
  if (moveTimeouts.has(id)) clearTimeout(moveTimeouts.get(id));
  const t = setTimeout(() => {
    Network.emitLineUpdate({ id, start, end });
    moveTimeouts.delete(id);
  }, delay);
  moveTimeouts.set(id, t);
}

// Arrow state & animation loop
// Arrow state & animation loop
const _arrowState = {
  keys: new Set(),
  anim: null,
  last: 0,
  shift: false,
  repeatTimer: null, // New: a timer for the delayed repeat
};

// base speeds (px/sec)
const BASE_SPEED = 60; // default hold speed (approx)
const FAST_MULT = 4; // when Shift held
function _arrowLoop(now) {
  if (!_arrowState.last) _arrowState.last = now;
  const dt = Math.min(100, now - _arrowState.last) / 1000;
  _arrowState.last = now;

  if (_arrowState.keys.size === 0) {
    cancelAnimationFrame(_arrowState.anim);
    _arrowState.anim = null;
    _arrowState.last = 0;
    return;
  }

  let dx = 0,
    dy = 0;
  if (_arrowState.keys.has("ArrowLeft")) dx -= 1;
  if (_arrowState.keys.has("ArrowRight")) dx += 1;
  if (_arrowState.keys.has("ArrowUp")) dy -= 1;
  if (_arrowState.keys.has("ArrowDown")) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    if (len !== 0) {
      dx /= len;
      dy /= len;
    }

    // The speed now depends on whether the shift key is down
    const speed = BASE_SPEED * (_arrowState.shift ? FAST_MULT : 1);
    const moveX = dx * speed * dt;
    const moveY = dy * speed * dt;

    const sel = State.get("selectedLineId");
    if (sel) {
      const updated = State.get("lines").map((l) => {
        if (l.id !== sel) return l;
        return {
          ...l,
          start: { x: l.start.x + moveX, y: l.start.y + moveY },
          end: { x: l.end.x + moveX, y: l.end.y + moveY },
        };
      });

      State.set("lines", updated);
      Canvas.draw();

      const line = updated.find((l) => l.id === sel);
      if (line) scheduleMoveLine(sel, line.start, line.end);
    }
  }

  _arrowState.anim = requestAnimationFrame(_arrowLoop);
}

function nudgeSelectedLine(key) {
  let dx = 0,
    dy = 0;
  const step = 1; // single-unit movement for a tap

  if (key === "ArrowLeft") dx = -step;
  if (key === "ArrowRight") dx = step;
  if (key === "ArrowUp") dy = -step;
  if (key === "ArrowDown") dy = step;

  if (dx !== 0 || dy !== 0) {
    const sel = State.get("selectedLineId");
    if (sel) {
      const updated = State.get("lines").map((l) => {
        if (l.id !== sel) return l;
        return {
          ...l,
          start: { x: l.start.x + dx, y: l.start.y + dy },
          end: { x: l.end.x + dx, y: l.end.y + dy },
        };
      });
      State.set("lines", updated);
      Canvas.draw();
      const line = updated.find((l) => l.id === sel);
      if (line) scheduleMoveLine(sel, line.start, line.end);
    }
  }
}


function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function halfVectorFromAngleWidth(angleDeg, width) {
  const r = degToRad(angleDeg);
  return { x: Math.cos(r) * (width / 2), y: Math.sin(r) * (width / 2) };
}

function modifySelectedLineWidth(delta) {
  const sel = State.get("selectedLineId");
  if (!sel) return;
  const lines = State.get("lines").map((l) => {
    if (l.id !== sel) return l;
    const curWidth =
      typeof l.width === "number" ? l.width : distance(l.start, l.end);
    const newWidth = clamp(curWidth + delta, 1, 1000);
    // compute center and derive new endpoints so the line grows/shrinks symmetrically
    const center = midpoint(l.start, l.end);
    const a =
      typeof l.angle === "number" ? l.angle : computeAngleDeg(l.start, l.end);
    const hv = halfVectorFromAngleWidth(a, newWidth);
    const newStart = { x: center.x - hv.x, y: center.y - hv.y };
    const newEnd = { x: center.x + hv.x, y: center.y + hv.y };
    return { ...l, width: newWidth, start: newStart, end: newEnd };
  });
  State.set("lines", lines);
  Canvas.draw();
  const line = lines.find((l) => l.id === sel);
  if (line) {
    // schedule send (debounced)
    scheduleSendProps(sel, { width: line.width });
  }
  UI.updateLineEditorValues(line);
}

function modifySelectedLineHeight(delta) {
  const sel = State.get("selectedLineId");
  if (!sel) return;
  const updated = State.get("lines").map((l) => {
    if (l.id !== sel) return l;
    const cur = typeof l.height === "number" ? l.height : 4;
    const next = Math.max(1, Math.min(1000, cur + delta));
    return { ...l, height: next };
  });
  State.set("lines", updated);
  Canvas.draw();

  const line = updated.find((l) => l.id === sel);
  if (line) {
    // schedule debounced send (you should have scheduleSendProps in this file from prior snippet)
    scheduleSendProps(sel, { height: line.height });
    UI.updateLineEditorValues(line);
  }
}


function normalizeAngle180(angle) {
  // Wrap into [0,180)
  return ((angle % 180) + 180) % 180;
}

function modifySelectedLineAngle(delta) {
  const sel = State.get("selectedLineId");
  if (!sel) return;

  const lines = State.get("lines").map((l) => {
    if (l.id !== sel) return l;

    const curAngle =
      typeof l.angle === "number" ? l.angle : computeAngleDeg(l.start, l.end);

    // Add delta, then normalize to [0, 180)
    let newAngle = normalizeAngle180(curAngle + delta);

    // Rotate around center
    const center = midpoint(l.start, l.end);
    const w = typeof l.width === "number" ? l.width : distance(l.start, l.end);
    const hv = halfVectorFromAngleWidth(newAngle, w);
    const newStart = { x: center.x - hv.x, y: center.y - hv.y };
    const newEnd = { x: center.x + hv.x, y: center.y + hv.y };

    return { ...l, angle: newAngle, start: newStart, end: newEnd };
  });

  State.set("lines", lines);
  Canvas.draw();

  const line = lines.find((l) => l.id === sel);
  if (line) {
    scheduleSendProps(sel, { angle: line.angle });
    UI.updateLineEditorValues(line);
  }
}


