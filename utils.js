function getSpawnDiameter(mapSize) {
  let diameter = 18; // Default value
  const sizeMap = {
    13: 10,
    12: 12,
    11: 14,
    10: 16,
    9: 18,
    8: 20,
    7: 24,
    6: 26,
    5: 30,
    4: 34,
    3: 40,
    2: 48,
    1: 60,
  };
  return sizeMap[mapSize] || diameter;
}

// Helper to get a random integer
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- PASTE THESE FUNCTIONS INTO public/utils-client.js ---

// Helper: Calculate Euclidean distance between two RGB strings "rgb(r, g, b)"
function getColorDistance(c1, c2) {
  if (!c1 || !c2) return 0;
  const m1 = c1.match(/\d+/g);
  const m2 = c2.match(/\d+/g);
  if (!m1 || !m2) return 0;

  const [r1, g1, b1] = m1.map(Number);
  const [r2, g2, b2] = m2.map(Number);

  return Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2),
  );
}

// Helper: Random RGB generator
function getRandomRgb() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
}

// 1. Smart Color Scheme Generator
function generateNewColorScheme(previousScheme) {
  // Minimum distance between any two colors in the scheme
  const MIN_SELF_DIST = 80;
  // Minimum distance between any new color and its counterpart in the old scheme
  const MIN_DIFF_DIST = 100;

  let attempts = 0;
  let bestScheme = null;

  while (attempts < 100) {
    attempts++;

    // Generate candidates
    // We try to make background and none (walls) related but distinct
    const baseR = Math.floor(Math.random() * 256);
    const baseG = Math.floor(Math.random() * 256);
    const baseB = Math.floor(Math.random() * 256);

    // Background
    const bg = `rgb(${baseR}, ${baseG}, ${baseB})`;

    // None (Walls) - Shifted version of BG
    const shift = 40 + Math.random() * 60; // significant shift
    const sign = Math.random() > 0.5 ? 1 : -1;
    const clamp = (x) => Math.max(0, Math.min(255, x));
    const none = `rgb(${Math.round(clamp(baseR + shift * sign))}, ${Math.round(clamp(baseG + shift * sign))}, ${Math.round(clamp(baseB + shift * sign))})`;

    // Bouncy & Death - Completely random distinct colors
    const bouncy = getRandomRgb();
    const death = getRandomRgb();

    const scheme = { background: bg, none, bouncy, death };
    const colors = Object.values(scheme);

    // Check 1: Self-Consistency (Are all new colors distinct from each other?)
    let selfConsistent = true;
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        if (getColorDistance(colors[i], colors[j]) < MIN_SELF_DIST) {
          selfConsistent = false;
          break;
        }
      }
    }
    if (!selfConsistent) continue;

    // Check 2: Difference from Previous Scheme (if exists)
    if (previousScheme) {
      const isDistinctFromOld =
        getColorDistance(scheme.background, previousScheme.background) >
          MIN_DIFF_DIST &&
        getColorDistance(scheme.none, previousScheme.none) > MIN_DIFF_DIST &&
        getColorDistance(scheme.bouncy, previousScheme.bouncy) >
          MIN_DIFF_DIST &&
        getColorDistance(scheme.death, previousScheme.death) > MIN_DIFF_DIST;

      if (!isDistinctFromOld) continue;
    }

    // If we passed checks, this is a valid scheme
    bestScheme = scheme;
    break;
  }

  // Fallback if constraints were too hard
  if (!bestScheme) {
    bestScheme = {
      background: getRandomRgb(),
      none: getRandomRgb(),
      bouncy: getRandomRgb(),
      death: getRandomRgb(),
    };
  }

  return bestScheme;
}

// --- IN gameManager.js (Top Level Utilities) ---

function hslToRgbStr(h, s, l) {
  // Ensure math cannot produce NaN or undefined
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `rgb(${Math.round(255 * f(0))}, ${Math.round(255 * f(8))}, ${Math.round(255 * f(4))})`;
}

function getDistinctColor(index, isDarkBg) {
  const h = (index * 137.508) % 360; // Golden angle ensures distinct hues
  const s = 60 + Math.random() * 30;
  const l = isDarkBg ? 65 + Math.random() * 20 : 30 + Math.random() * 20;
  return hslToRgbStr(h, s, l);
}

function getShade(rgbStr, variation) {
  // Strict fallback to ensure no object receives "0" or invalid colors
  if (!rgbStr || typeof rgbStr !== "string") return "rgb(255,255,255)";
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return "rgb(255,255,255)";

  const [r, g, b] = match.map(Number);
  const shift = Math.floor((Math.random() * 2 - 1) * variation);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  return `rgb(${clamp(r + shift)}, ${clamp(g + shift)}, ${clamp(b + shift)})`;
}

function generateBeautifulColorScheme() {
  // Pre-curated excellent combinations ensuring contrast
  const curatedThemes = [
    {
      name: "Monochrome Classic",
      bg: "rgb(250,250,250)",
      none: "rgb(200,200,200)",
      bouncy: "rgb(120,120,120)",
      death: "rgb(10,10,10)",
      isDark: false,
    },
    {
      name: "Dark Void",
      bg: "rgb(15,15,18)",
      none: "rgb(200,200,200)",
      bouncy: "rgb(0,255,170)",
      death: "rgb(255,40,40)",
      isDark: true,
    },
    {
      name: "Blueprint",
      bg: "rgb(20,50,150)",
      none: "rgb(255,255,255)",
      bouncy: "rgb(100,200,255)",
      death: "rgb(255,200,0)",
      isDark: true,
    },
    {
      name: "Parchment",
      bg: "rgb(245,235,220)",
      none: "rgb(150,130,110)",
      bouncy: "rgb(50,100,200)",
      death: "rgb(30,30,30)",
      isDark: false,
    },
    {
      name: "Cyberpunk",
      bg: "rgb(20,0,40)",
      none: "rgb(0,255,255)",
      bouncy: "rgb(255,0,255)",
      death: "rgb(255,255,0)",
      isDark: true,
    },
  ];

  // 50% chance to use a curated theme, 50% chance for a completely procedural HSL theme
  if (Math.random() > 0.5) {
    const t = curatedThemes[Math.floor(Math.random() * curatedThemes.length)];
    return {
      isDark: t.isDark,
      colors: {
        background: t.bg,
        none: t.none,
        bouncy: t.bouncy,
        death: t.death,
      },
    };
  } else {
    const isDark = Math.random() > 0.5;
    const bgH = Math.floor(Math.random() * 360);
    const normalH = (bgH + 180 + Math.random() * 60 - 30) % 360; // Complementary to BG
    const fgL = isDark ? 70 : 30;

    return {
      isDark: isDark,
      colors: {
        background: hslToRgbStr(bgH, 15, isDark ? 10 : 90),
        none: hslToRgbStr(normalH, 40, fgL),
        bouncy: hslToRgbStr((normalH + 60) % 360, 80, fgL),
        death: hslToRgbStr((normalH + 200) % 360, 80, fgL),
      },
    };
  }
}

module.exports = {
  getShade,
  hslToRgbStr,
  getSpawnDiameter,
  getDistinctColor,
  generateNewColorScheme,
  generateBeautifulColorScheme,
};
