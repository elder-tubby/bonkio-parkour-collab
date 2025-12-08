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
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
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
    const none = `rgb(${Math.round(clamp(baseR + shift*sign))}, ${Math.round(clamp(baseG + shift*sign))}, ${Math.round(clamp(baseB + shift*sign))})`;
    
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
        getColorDistance(scheme.background, previousScheme.background) > MIN_DIFF_DIST &&
        getColorDistance(scheme.none, previousScheme.none) > MIN_DIFF_DIST &&
        getColorDistance(scheme.bouncy, previousScheme.bouncy) > MIN_DIFF_DIST &&
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
      death: getRandomRgb()
    };
  }

  return bestScheme;
}




module.exports = {
  getSpawnDiameter,
  generateNewColorScheme,
};
