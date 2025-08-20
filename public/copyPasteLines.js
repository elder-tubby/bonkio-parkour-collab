import State from "./state.js";
import { getSpawnDiameter, showToast } from "./utils-client.js";
import UI from "./ui.js";
import * as Network from "./network.js";

export function copyLineInfo() {
  const cz = State.get("capZone");
  const spawn = State.get("spawnCircle");
  const stateObjects = State.get("objects") || [];

  if (!cz) throw new Error("No capZone in state!");

  console.log("copyLineInfo triggered", { stateObjects });

  // canvas / export dims
  const GW = canvas.width;
  const GH = canvas.height;
  const EW = 730;
  const EH = 500;
  const scaleX = EW / GW;
  const scaleY = EH / GH;

  // background and capzone (unchanged)
  const bgLine = {
    id: 0,
    type: "line",
    color: 921102,
    x: 935,
    y: 350,
    width: 1000,
    height: 1000,
    angle: 0,
    isBgLine: true,
    noPhysics: true,
    noGrapple: true,
    isFloor: true,
  };

  const exportedObjects = [];

  exportedObjects.push(bgLine);

  // line id counter (starts at 2 so first exported line gets id = 2)
  let nextObjId = 1;

  for (let idx = 0; idx < stateObjects.length; idx++) {
    const obj = stateObjects[idx];
    if (!obj) continue;

    // POLYGON -> export as poly (preserve original mapping logic)
    if (obj.type === "poly") {
      const c = obj.c || {};
      const v = Array.isArray(obj.v) ? obj.v : [];
      const a = typeof obj.a === "number" ? obj.a : 0;
      const sc = typeof obj.scale === "number" ? obj.scale : 1;
      const polyType = obj.polyType || "normal";

      const centerExternal = gameToExternal(c.x || 0, c.y || 0);
      // keep vertices untouched (no scaling here)
      const externalVertices = v.map(function (p) {
        return {
          x: p && typeof p.x === "number" ? p.x : 0,
          y: p && typeof p.y === "number" ? p.y : 0,
        };
      });

      let color = 16777215;
      let isBouncy = false;
      let isDeath = false;
      if (polyType === "bouncy") {
        color = 10994878;
        isBouncy = true;
      } else if (polyType === "death") {
        color = 12713984;
        isDeath = true;
      }

      exportedObjects.push({
        id: nextObjId++,
        type: "poly",
        color: color,
        isBgLine: false,
        noGrapple: true,
        x: centerExternal.x,
        y: centerExternal.y,
        angle: a,
        scale: sc,
        vertices: externalVertices,
        isBouncy: isBouncy,
        isDeath: isDeath,
      });

      continue;
    }

    // LINE-LIKE -> export as line (type explicitly "line")
    if (obj.type === "line" || obj.start) {
      // inline isNumber check
      const isNumber = function (n) {
        return typeof n === "number" && !Number.isNaN(n);
      };

      // compute centerX/centerY robustly (same logic as before, inlined)
      let centerX = 0;
      let centerY = 0;

      const hasWA = isNumber(obj.width) && isNumber(obj.angle);
      if (hasWA) {
        const rad = (obj.angle * Math.PI) / 180;
        const startSafeX = obj.start && isNumber(obj.start.x) ? obj.start.x : 0;
        const startSafeY = obj.start && isNumber(obj.start.y) ? obj.start.y : 0;
        const endDrawX = startSafeX + Math.cos(rad) * obj.width;
        const endDrawY = startSafeY + Math.sin(rad) * obj.width;
        centerX = (startSafeX + endDrawX) / 2;
        centerY = (startSafeY + endDrawY) / 2;
      } else if (
        obj.end &&
        isNumber(obj.end.x) &&
        isNumber(obj.end.y) &&
        obj.start &&
        isNumber(obj.start.x) &&
        isNumber(obj.start.y)
      ) {
        centerX = (obj.start.x + obj.end.x) / 2;
        centerY = (obj.start.y + obj.end.y) / 2;
      } else if (Array.isArray(obj.points) && obj.points.length >= 2) {
        const first = obj.points[0];
        const last = obj.points[obj.points.length - 1];
        const fx = first && isNumber(first.x) ? first.x : 0;
        const fy = first && isNumber(first.y) ? first.y : 0;
        const lx = last && isNumber(last.x) ? last.x : 0;
        const ly = last && isNumber(last.y) ? last.y : 0;
        centerX = (fx + lx) / 2;
        centerY = (fy + ly) / 2;
      } else if (Array.isArray(obj.vertices) && obj.vertices.length >= 2) {
        const first = obj.vertices[0];
        const last = obj.vertices[obj.vertices.length - 1];
        const fx = first && isNumber(first.x) ? first.x : 0;
        const fy = first && isNumber(first.y) ? first.y : 0;
        const lx = last && isNumber(last.x) ? last.x : 0;
        const ly = last && isNumber(last.y) ? last.y : 0;
        centerX = (fx + lx) / 2;
        centerY = (fy + ly) / 2;
      } else if (Array.isArray(obj.points) && obj.points.length === 1) {
        const p0 = obj.points[0];
        centerX = p0 && isNumber(p0.x) ? p0.x : 0;
        centerY = p0 && isNumber(p0.y) ? p0.y : 0;
      } else if (obj.start && isNumber(obj.start.x) && isNumber(obj.start.y)) {
        centerX = obj.start.x;
        centerY = obj.start.y;
      } else {
        // ultimate fallback
        console.warn(
          "copyLineInfo: line-like missing coord data, defaulting to 0,0",
          obj,
        );
        centerX = 0;
        centerY = 0;
      }

      const externalCenter = gameToExternal(centerX, centerY);

      // compute length & angle
      let length = 0;
      let angle = 0;
      if (hasWA) {
        const rad = (obj.angle * Math.PI) / 180;
        length =
          obj.width *
          Math.hypot(Math.cos(rad) * scaleX, Math.sin(rad) * scaleY);
        angle =
          (Math.atan2(Math.sin(rad) * scaleY, Math.cos(rad) * scaleX) * 180) /
          Math.PI;
      } else {
        // determine two points pA and pB
        let pA = null;
        let pB = null;
        if (
          obj.start &&
          obj.end &&
          isNumber(obj.start.x) &&
          isNumber(obj.start.y) &&
          isNumber(obj.end.x) &&
          isNumber(obj.end.y)
        ) {
          pA = obj.start;
          pB = obj.end;
        } else if (Array.isArray(obj.points) && obj.points.length >= 2) {
          pA = obj.points[0];
          pB = obj.points[obj.points.length - 1];
        } else if (Array.isArray(obj.vertices) && obj.vertices.length >= 2) {
          pA = obj.vertices[0];
          pB = obj.vertices[obj.vertices.length - 1];
        } else if (
          obj.start &&
          isNumber(obj.start.x) &&
          isNumber(obj.start.y)
        ) {
          pA = obj.start;
          pB = obj.start; // zero length
        } else {
          pA = { x: 0, y: 0 };
          pB = { x: 0, y: 0 };
        }

        const dx = ((pB.x || 0) - (pA.x || 0)) * scaleX;
        const dy = ((pB.y || 0) - (pA.y || 0)) * scaleY;
        length = Math.hypot(dx, dy);
        angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      }

      const thicknessLogical = typeof obj.height === "number" ? obj.height : 4;
      const thicknessScaled = thicknessLogical * scaleY;

      // type-based flags/colors (kept exact)
      let isBouncy = false;
      let isDeath = false;
      let bounciness;
      let color;
      switch (obj.lineType) {
        case "bouncy":
          isBouncy = true;
          bounciness = null;
          color = 10994878;
          break;
        case "death":
          isDeath = true;
          bounciness = -1;
          color = 12713984;
          break;
        default:
          bounciness = -1;
          color = typeof obj.color === "number" ? obj.color : 16777215;
      }

      exportedObjects.push({
        id: nextObjId++,
        type: "line",
        color: color,
        isBgLine: false,
        noGrapple: true,
        x: externalCenter.x,
        y: externalCenter.y,
        width: length,
        height: thicknessScaled,
        angle: angle,
        isBouncy: isBouncy,
        isDeath: isDeath,
        bounciness: bounciness,
      });

      continue;
    }
  }
  const capzoneCenterX = cz.x + cz.width / 2;
  const capzoneCenterY = cz.y + cz.height / 2;
  const capZoneExternal = gameToExternal(capzoneCenterX, capzoneCenterY);

  const capZoneLine = {
    id: nextObjId,
    type: "line",
    color: 196865,
    x: capZoneExternal.x,
    y: capZoneExternal.y,
    width: cz.width * scaleX,
    height: cz.height * scaleY,
    angle: 0,
    isBgLine: false,
    noPhysics: false,
    noGrapple: true,
    isCapzone: true,
  };

  exportedObjects.push(capZoneLine);

  const spawnExternal = gameToExternal(spawn.x, spawn.y);
  const mapSize = State.get("mapSize");

  const out = {
    version: 1,
    spawn: { spawnX: spawnExternal.x - 935, spawnY: spawnExternal.y - 350 },
    mapSize: mapSize,
    objects: exportedObjects,
  };

  navigator.clipboard
    .writeText(JSON.stringify(out, null, 2))
    .then(function () {
      showToast("Map data copied!");
    })
    .catch(function (e) {
      showToast("Copy failed: " + e, true);
    });
}

function gameToExternal(gameX, gameY) {
  const GW = canvas.width; // 650
  const GH = canvas.height; // 445.2
  const EW = 730;
  const EH = 500;
  const offsetX = 935;
  const offsetY = 350;

  // Normalize to [0..1]
  const normX = gameX / GW;
  const normY = gameY / GH;

  // Scale to external canvas size
  const scaledX = normX * EW;
  const scaledY = normY * EH;

  // Shift origin from top-left to center
  const finalX = scaledX - EW / 2 + offsetX;
  const finalY = scaledY - EH / 2 + offsetY; // No flip, positive down

  return { x: finalX, y: finalY };
}

// pasteLines.js
// Paste lines exported by copyLineInfo into app state.
// Strictly defensive: will not overwrite existing lines; will skip malformed/irrelevant entries.
// Depends on: State, UI (for elems.canvas), externalToGame(), showToast()
// Place this file where your other clipboard helpers live or import it where needed.

/**
 * Rewritten pasteLines to handle the new JSON format with a unified `objects` array.
 */
export async function pasteLines() {
  const existing = State.get("objects");
  if (Array.isArray(existing) && existing.length > 0) {
    showToast("Cannot paste: Clear all shapes first.", true);
    return;
  }
  let raw;
  try {
    raw = await navigator.clipboard.readText();
  } catch (e) {
    showToast("Unable to read clipboard.", true);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    showToast("Clipboard does not contain valid JSON.", true);
    return;
  }

  if (!data || !Array.isArray(data.objects)) {
    showToast("JSON missing required 'objects' array.", true);
    return;
  }

  const GW = UI.elems.canvas.width;
  const GH = UI.elems.canvas.height;
  if (!(GW > 0 && GH > 0)) {
    showToast("Invalid canvas size.", true);
    return;
  }

  const importedObjects = [];
  let capZoneData = null;

  for (const obj of data.objects) {
    if (!obj) continue;

    if (obj.isCapzone) {
      capZoneData = obj;
      continue;
    }
    if (obj.isBgLine) continue;

    if (obj.type === "poly") {
      const centerGame = externalToGame(obj.x, obj.y);
      const scaleX = GW / 730;
      const scaleY = GH / 500;

      const gameVertices = obj.vertices.map((v) => ({
        x: v.x,
        y: v.y,
      }));

      let polyType = "none";
      if (obj.isBouncy) polyType = "bouncy";
      if (obj.isDeath) polyType = "death";

      importedObjects.push({
        type: "poly",
        c: centerGame,
        v: gameVertices,
        a: obj.angle || 0,
        scale: obj.scale || 1,
        polyType,
      });
    } else if (obj.type === "line") {
      const aExtRad = (obj.angle * Math.PI) / 180;
      const halfLen = obj.width / 2;
      const extStart = {
        x: obj.x - Math.cos(aExtRad) * halfLen,
        y: obj.y - Math.sin(aExtRad) * halfLen,
      };
      const extEnd = {
        x: obj.x + Math.cos(aExtRad) * halfLen,
        y: obj.y + Math.sin(aExtRad) * halfLen,
      };

      const startGame = externalToGame(extStart.x, extStart.y);
      const endGame = externalToGame(extEnd.x, extEnd.y);

      let lineType = "none";
      if (obj.isBouncy) lineType = "bouncy";
      if (obj.isDeath) lineType = "death";

      const height = obj.height / (GH / 500);

      importedObjects.push({
        type: "line",
        start: startGame,
        end: endGame,
        lineType,
        height,
      });
    }
  }

  // Handle spawn
  let spawnGame = { x: GW / 2, y: GH / 2 }; // Default
  if (
    data.spawn &&
    typeof data.spawn.spawnX === "number" &&
    typeof data.spawn.spawnY === "number"
  ) {
    const extSpawnX = data.spawn.spawnX + 935;
    const extSpawnY = data.spawn.spawnY + 350;
    spawnGame = externalToGame(extSpawnX, extSpawnY);
  }

  // Handle CapZone
  let capZoneGame = State.get("capZone"); // Default
  if (capZoneData) {
    const scaleX = GW / 730;
    const scaleY = GH / 500;
    const czCenterGame = externalToGame(capZoneData.x, capZoneData.y);
    const czWidthGame = capZoneData.width * scaleX;
    const czHeightGame = capZoneData.height * scaleY;
    capZoneGame = {
      x: czCenterGame.x - czWidthGame / 2,
      y: czCenterGame.y - czHeightGame / 2,
      width: czWidthGame,
      height: czHeightGame,
    };
  }

  const mapSize = data.mapSize ?? State.get("mapSize");

  const payload = {
    objects: importedObjects,
    spawn: spawnGame,
    capZone: capZoneGame,
    mapSize,
  };

  Network.pasteLines(payload);
  showToast(`Pasting ${importedObjects.length} objects...`);
}

function externalToGame(extX, extY) {
  // Inverse of gameToExternal
  const GW = canvas.width; // e.g. 650
  const GH = canvas.height; // e.g. 445.2
  const EW = 730;
  const EH = 500;
  const offsetX = 935;
  const offsetY = 350;

  // Basic validation
  if (typeof extX !== "number" || typeof extY !== "number") {
    throw new Error("externalToGame: extX/extY must be numbers");
  }
  if (!(GW > 0 && GH > 0)) {
    throw new Error("externalToGame: invalid canvas size");
  }

  // Reverse the transformations from gameToExternal:
  // gameToExternal: finalX = (gameX/GW)*EW - EW/2 + offsetX
  // => scaledX = finalX - offsetX + EW/2
  // => normX = scaledX / EW
  // => gameX = normX * GW
  const scaledX = extX - offsetX + EW / 2;
  const scaledY = extY - offsetY + EH / 2;

  const normX = scaledX / EW;
  const normY = scaledY / EH;

  const gameX = normX * GW;
  const gameY = normY * GH;

  return { x: gameX, y: gameY };
}

  