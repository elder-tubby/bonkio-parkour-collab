import State from "./state.js";



export function copyLineInfo(lines, canvasWidth, canvasHeight) {
  const cz = State.get("capZone");
  if (!cz) throw new Error("No capZone in state!");
  
  console.log("copyLineInfo triggered", lines);

  if (!Array.isArray(lines) || lines.length === 0) {
    showToast("No lines to copy.");
    return;
  }

  const offsetX = 935 - canvasWidth / 2;
  const offsetY = 350 - canvasHeight / 2;

  // Fixed background and cap‑zone entries
  const fixed1 = {
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
console.log("cz.x:", cz.x);  
  const capX = (cz.x > 10) ? 670 : -20;


  const fixed2 = {
    id: 1,
    color: 196865,
    x: 935 - canvasWidth/2 + capX,
    y: 350 - canvasHeight/2 + cz.y - 20,
    width: 30,
    height: 30,
    angle: 0,
    isBgLine: false,
    noPhysics: false,
    noGrapple: true,
    isCapzone: true,
  };

  // Convert each user‑drawn line into your target format
  const userLines = lines.map((l, i) => {
    const dx = l.end.x - l.start.x;
    const dy = l.end.y - l.start.y;
    const centerX = (l.start.x + l.end.x) / 2 + offsetX;
    const centerY = (l.start.y + l.end.y) / 2 + offsetY;
    const length  = Math.hypot(dx, dy);
    const angle   = Math.atan2(dy, dx) * (180 / Math.PI);

    // Determine type flags, bounciness, and color
    let isBouncy = false;
    let isDeath  = false;
    let bounciness;
    let color;

    switch (l.type) {
      case 'bouncy':
        isBouncy    = true;
        isDeath     = false;
        bounciness  = null;
        color       = 9079434;
        break;
      case 'death':
        isBouncy    = false;
        isDeath     = true;
        bounciness  = -1;
        color       = 12713984;
        break;
      case 'none':
      default:
        isBouncy    = false;
        isDeath     = false;
        bounciness  = -1;
        color       = 16777215;
    }

    return {
      id:        i + 2,
      color,
      isBgLine:  false,
      noGrapple: true,
      x:         centerX,
      y:         centerY,
      width:     length,
      height:    5,
      angle,
      isBouncy,
      isDeath,
      bounciness
    };
  });

  const out = {
    version: 1,
    spawn:   { spawnX: 99999, spawnY: 99999 },
    mapSize: 9,
    lines:   [fixed1, fixed2, ...userLines],
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
