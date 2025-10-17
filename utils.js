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

// Generate a single random RGB color string
function getRandomColor() {
  const r = randInt(0, 255);
  const g = randInt(0, 255);
  const b = randInt(0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// Calculate squared Euclidean distance between two "rgb(r, g, b)" strings
function colorDistance(color1, color2) {
  const [r1, g1, b1] = color1.match(/\d+/g).map(Number);
  const [r2, g2, b2] = color2.match(/\d+/g).map(Number);
  return Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2);
}

// Main function to generate a new, valid color scheme
function generateNewColorScheme(previousScheme) {
  const MIN_DISTANCE = 10000; // Confidence interval: lower = more similar colors allowed
  let newScheme;
  let isValid = false;

  while (!isValid) {
    newScheme = {
      background: getRandomColor(),
      none: getRandomColor(),
      bouncy: getRandomColor(),
      death: getRandomColor(),
    };

    const colors = Object.values(newScheme);

    // 1. Check for sufficient difference within the new scheme
    const selfConsistent =
      colorDistance(colors[0], colors[1]) > MIN_DISTANCE &&
      colorDistance(colors[0], colors[2]) > MIN_DISTANCE &&
      colorDistance(colors[0], colors[3]) > MIN_DISTANCE &&
      colorDistance(colors[1], colors[2]) > MIN_DISTANCE &&
      colorDistance(colors[1], colors[3]) > MIN_DISTANCE &&
      colorDistance(colors[2], colors[3]) > MIN_DISTANCE;

    // 2. Check that it's different from the previous scheme
    const isNew = Object.keys(newScheme).some(
      (key) =>
        colorDistance(newScheme[key], previousScheme[key]) > MIN_DISTANCE,
    );

    if (selfConsistent && isNew) {
      isValid = true;
    }
  }
  return newScheme;
}

module.exports = {
  getSpawnDiameter,
  generateNewColorScheme,
};
