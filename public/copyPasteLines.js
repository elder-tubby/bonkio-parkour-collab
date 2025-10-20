import State from "./state.js";
import { getSpawnDiameter, showToast } from "./utils-client.js";
import UI from "./ui.js";
import * as Network from "./network.js";

export function copyLineInfo() {
  const cz = State.get("capZone");
  const spawn = State.get("spawnCircle");
  const stateObjects = State.get("objects") || [];
  const colors = State.get("colors"); // Get current colors

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
    color: rgbToDecimal(colors.background),
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

      let isBouncy = false;
      let isDeath = false;
      let colorDecimal; // Use a specific variable
      if (polyType === "bouncy") {
        colorDecimal = rgbToDecimal(colors.bouncy);
        isBouncy = true;
      } else if (polyType === "death") {
        colorDecimal = rgbToDecimal(colors.death);
        isDeath = true;
      } else {
        colorDecimal = rgbToDecimal(colors.none);
      }

      exportedObjects.push({
        id: nextObjId++,
        type: "poly",
        color: colorDecimal,
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

    if (obj.type === "circle") {
      const c = obj.c || { x: 0, y: 0 };
      const radius = typeof obj.radius === "number" ? obj.radius : 50;
      const circleType = obj.circleType || "normal";

      const centerExternal = gameToExternal(c.x, c.y);
      const scaleAvg = (scaleX + scaleY) / 2;
      const radiusExternal = radius * scaleAvg;

      let isBouncy = false;
      let isDeath = false;
      let colorDecimal;
      if (circleType === "bouncy") {
        colorDecimal = rgbToDecimal(colors.bouncy);
        isBouncy = true;
      } else if (circleType === "death") {
        colorDecimal = rgbToDecimal(colors.death);
        isDeath = true;
      } else {
        colorDecimal = rgbToDecimal(colors.none);
      }

      exportedObjects.push({
        id: nextObjId++,
        type: "circle",
        color: colorDecimal,
        x: centerExternal.x,
        y: centerExternal.y,
        radius: radiusExternal,
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
      let colorDecimal;
      switch (obj.lineType) {
        case "bouncy":
          isBouncy = true;
          bounciness = null;
          colorDecimal = rgbToDecimal(colors.bouncy);
          break;
        case "death":
          isDeath = true;
          bounciness = -1;
          colorDecimal = rgbToDecimal(colors.death);
          break;
        default:
          bounciness = -1;
          colorDecimal = rgbToDecimal(colors.none);
      }

      exportedObjects.push({
        id: nextObjId++,
        type: "line",
        color: colorDecimal,
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
    colors: colors,
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
// In public/copyPasteLines.js

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

  // --- NEW: Handle old format ---
  // Check for 'objects' array first, if not found, check for 'lines' array
  const objectList = data.objects || data.lines;

  if (!data || !Array.isArray(objectList)) {
    showToast("JSON missing required 'objects' or 'lines' array.", true);
    return;
  }

  // Determine if we are using the old format
  const isOldFormat = !data.objects && data.lines;
  // --- End new logic ---

  let importedColors = null; // Will hold the final colors object

  // Check for modern 'colors' object first
  if (data.colors && typeof data.colors === "object") {
    const { background, none, bouncy, death } = data.colors;
    if (background && none && bouncy && death) {
      importedColors = data.colors;
    }
  } else if (isOldFormat) {
    // --- NEW: Extract colors from old format if 'colors' object is missing ---
    let foundColors = {
      background: null,
      none: null,
      bouncy: null,
      death: null,
    };
    // Find the first instance of each type to get its color
    for (const line of objectList) {
      if (!line) continue;
      const colorDecimal = line.color; // Old format uses decimal

      // --- Important: Extract BG color even if noPhysics is true ---
      if (line.isBgLine && foundColors.background === null) {
        foundColors.background = decimalToRgb(colorDecimal);
      }
      // --- Skip further color extraction if it's a noPhysics object (unless it's BG) ---
      if (line.noPhysics === true && !line.isBgLine) continue;

      // Extract other colors only from objects that have physics
      if (line.isBouncy && foundColors.bouncy === null) {
        foundColors.bouncy = decimalToRgb(colorDecimal);
      } else if (line.isDeath && foundColors.death === null) {
        foundColors.death = decimalToRgb(colorDecimal);
      } else if (
        !line.isBgLine &&
        !line.isBouncy &&
        !line.isDeath &&
        foundColors.none === null
      ) {
        // Assume it's 'none' if not background, bouncy, or death
        foundColors.none = decimalToRgb(colorDecimal);
      }

      // Stop searching if all found
      if (
        foundColors.background &&
        foundColors.none &&
        foundColors.bouncy &&
        foundColors.death
      ) {
        break;
      }
    }
    // Use defaults if any color type wasn't found
    importedColors = {
      background:
        foundColors.background ||
        State.get("colors").background ||
        "rgb(0, 0, 0)",
      none:
        foundColors.none || State.get("colors").none || "rgb(255, 255, 255)",
      bouncy:
        foundColors.bouncy ||
        State.get("colors").bouncy ||
        "rgb(167, 196, 190)",
      death: foundColors.death || State.get("colors").death || "rgb(255, 0, 0)",
    };
    // --- End color extraction ---
  }
  const GW = UI.elems.canvas.width;
  const GH = UI.elems.canvas.height;
  if (!(GW > 0 && GH > 0)) {
    showToast("Invalid canvas size.", true);
    return;
  }

  const importedObjects = [];
  let capZoneData = null;

  for (const obj of objectList) {
    // Use the determined objectList
    if (!obj) continue;
    // --- NEW: Skip objects if noPhysics is true (unless it's the background) ---
    if (obj.noPhysics === true && !obj.isBgLine) {
      continue; // Ignore this object
    }
    if (obj.isCapzone) {
      capZoneData = obj;
      continue;
    }
    if (obj.isBgLine) continue;

    // --- NEW: Force type to 'line' if old format is detected ---
    const objType = isOldFormat ? "line" : obj.type;

    if (objType === "poly") {
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
    } else if (objType === "circle") {
      const centerGame = externalToGame(obj.x, obj.y);
      const scaleX = GW / 730;
      const scaleY = GH / 500;
      const scaleAvg = (scaleX + scaleY) / 2;
      const radiusGame = obj.radius / scaleAvg;

      let circleType = "none";
      if (obj.isBouncy) circleType = "bouncy";
      if (obj.isDeath) circleType = "death";

      importedObjects.push({
        type: "circle",
        c: centerGame,
        radius: radiusGame,
        circleType,
      });
    } else if (objType === "line") {
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
      // Safely check properties that might not exist in old format
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

  let spawnGame = { x: GW / 2, y: GH / 2 }; // Default to center
  if (
    data.spawn &&
    typeof data.spawn.spawnX === "number" &&
    typeof data.spawn.spawnY === "number"
  ) {
    const extSpawnX = data.spawn.spawnX + 935;
    const extSpawnY = data.spawn.spawnY + 350;
    const potentialSpawnGame = externalToGame(extSpawnX, extSpawnY); // Calculate potential new spawn

    // --- NEW: Check if the calculated spawn is within canvas bounds ---
    if (
      potentialSpawnGame.x >= 0 &&
      potentialSpawnGame.x <= GW &&
      potentialSpawnGame.y >= 0 &&
      potentialSpawnGame.y <= GH
    ) {
      // Only update spawnGame if the coordinates are valid
      spawnGame = potentialSpawnGame;
    } else {
      console.warn(
        "Pasted spawn coordinates are outside canvas bounds. Using default spawn.",
      );
      // Optional: show a toast message to the user
      // showToast("Pasted spawn is outside canvas. Using default.", true);
    }
    // --- End new check ---
  }

  // Handle CapZone
  let capZoneGame = State.get("capZone"); // Default
  if (capZoneData) {
    // 1. Get the new center position from the pasted data (works for line or poly)
    const czCenterGame = externalToGame(capZoneData.x, capZoneData.y);

    // 2. Get the *current* (existing) dimensions from the state
    const currentCZ = State.get("capZone");
    const czWidthGame = currentCZ.width;
    const czHeightGame = currentCZ.height;

    // 3. Validate that the new center position is within canvas bounds
    if (
      czCenterGame.x >= 0 &&
      czCenterGame.x <= GW &&
      czCenterGame.y >= 0 &&
      czCenterGame.y <= GH
    ) {
      // 4. Set the new capzone with *new position* but *old dimensions*
      capZoneGame = {
        x: czCenterGame.x - czWidthGame / 2, // new top-left x
        y: czCenterGame.y - czHeightGame / 2, // new top-left y
      };
    } else {
      console.warn(
        "Pasted cap zone center is outside canvas bounds. Ignoring.",
      );
      // capZoneGame remains the default from State
    }
  }

  const mapSize = data.mapSize ?? State.get("mapSize");

  const payload = {
    objects: importedObjects,
    spawn: spawnGame,
    capZone: capZoneGame,
    mapSize,
    colors: importedColors,
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

function rgbToDecimal(rgbString) {
  if (!rgbString) return 16777215; // Default to white
  const [r, g, b] = rgbString.match(/\d+/g).map(Number);
  return (r << 16) | (g << 8) | b;
}

function decimalToRgb(decimal) {
  if (typeof decimal !== "number") return "rgb(255, 255, 255)";
  const r = (decimal >> 16) & 0xff;
  const g = (decimal >> 8) & 0xff;
  const b = decimal & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}
