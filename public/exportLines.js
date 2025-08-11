import State from "./state.js";

export function copyLineInfo(lines) {
  const cz = State.get("capZone");
  const spawn = State.get("spawnCircle");

  if (!cz) throw new Error("No capZone in state!");

  console.log("copyLineInfo triggered", lines);

  if (!Array.isArray(lines) || lines.length === 0) {
    showToast("No lines to copy.");
    return;
  }

  const GW = canvas.width;
  const GH = canvas.height;
  const EW = 730;
  const EH = 500;

  const scaleX = EW / GW;
  const scaleY = EH / GH;

  // Fixed background and cap‑zone entries
  const bgLine = {
    id: 0,
    color: 196865,
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

  // Center of cap zone in game canvas coords
  const capzoneCenterX = cz.x + cz.width / 2;
  const capzoneCenterY = cz.y + cz.height / 2;

  // Convert to external coords (center-based)
  const { x: externalCapzoneX, y: externalCapzoneY } = gameToExternal(
    capzoneCenterX,
    capzoneCenterY,
  );

  // Build external-format cap zone
  const capZoneLine = {
    id: 1,
    color: 196865,
    x: externalCapzoneX,
    y: externalCapzoneY,
    width: cz.width * scaleX, // scale width to external
    height: cz.height * scaleY, // scale height to external
    angle: 0,
    isBgLine: false,
    noPhysics: false,
    noGrapple: true,
    isCapzone: true,
  };

  // Convert each user-drawn line into your target format
  const userLines = lines.map((l, i) => {
    // Apply scale to delta before computing length
    const dx = (l.end.x - l.start.x) * scaleX;
    const dy = (l.end.y - l.start.y) * scaleY;

    const centerX = (l.start.x + l.end.x) / 2;
    const centerY = (l.start.y + l.end.y) / 2;

    const { x: extX, y: extY } = gameToExternal(centerX, centerY);

    const length = Math.hypot(dx, dy); // now in external scale
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    let isBouncy = false;
    let isDeath = false;
    let bounciness;
    let color;

    switch (l.type) {
      case "bouncy":
        isBouncy = true;
        bounciness = null;
        color = 9079434;
        break;
      case "death":
        isDeath = true;
        bounciness = -1;
        color = 12713984;
        break;
      default:
        bounciness = -1;
        color = 16777215;
    }

    return {
      id: i + 2,
      color,
      isBgLine: false,
      noGrapple: true,
      x: extX, // external coordinate
      y: extY, // external coordinate
      width: length, // now scaled to external canvas
      height: 4.452 * scaleY, // thickness scaled vertically
      angle,
      isBouncy,
      isDeath,
      bounciness,
    };
  });
  const { x: extSpawnX, y: extSpawnY } = gameToExternal(spawn.x, spawn.y);

  const out = {
    version: 1,
    spawn: { spawnX: extSpawnX - 935, spawnY: extSpawnY - 350},
    mapSize: 9,
    lines: [bgLine, capZoneLine, ...userLines],
  };

  navigator.clipboard
    .writeText(JSON.stringify(out, null, 2))
    .then(() => showToast("Copied!"))
    .catch((e) => showToast("Copy failed: " + e));
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "1rem",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#333",
    color: "#fff",
    padding: "0.6rem 1rem",
    borderRadius: "5px",
    fontSize: "0.9rem",
    zIndex: 1000,
    opacity: 0,
    transition: "opacity 0.3s ease",
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = 1));
  setTimeout(() => {
    toast.style.opacity = 0;
    toast.addEventListener("transitionend", () => toast.remove());
  }, 2000);
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
