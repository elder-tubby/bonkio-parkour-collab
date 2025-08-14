
// config.js
export default {
  PORT: 3000,
  CAP_ZONE_OPTIONS: [
    { x: 10, y: 10 },
    { x: 608, y: 10 },
  ],
  CAP_ZONE_SIZE: 30,
  MAX_PLAYERS: 8,
  // Add a set of symbols to choose from
  PLAYER_SYMBOLS: [
    "💃🏽",
    "👖",
    "💀",
    "🎶",
    "👀",
    "🦄",
    "🌷",
    "🙏",
    "🌈",
    "🌧",
    "☕️",
    "🎩",
    "🖕🏽",
    "✅",
    "🔥",
    "👩‍🍳",
  ],
  getSymbolFromName: function (name) {
    const normalizedName = name.toLowerCase();

    const symbolRules = {
      cook: "👩‍🍳",
      chef: "👩‍🍳",
      dance: "💃🏽",
      jeans: "👖",
      skull: "💀",
      music: "🎶",
      eye: "👀",
      unicorn: "🦄",
      tulip: "🌷",
      pray: "🙏",
      rainbow: "🌈",
      rain: "🌧",
      coffee: "☕️",
      hat: "🎩",
      fire: "🔥",
      ok: "✅",
      check: "✅",
      aa1134: "🦃",
      jumper: "🌈",
      salama: "⚡",
      otter: "🦦",
      duck: "🦆",
    };

    for (const keyword in symbolRules) {
      if (normalizedName.includes(keyword)) {
        return symbolRules[keyword];
      }
    }
    // Return a random symbol from the main array if no keyword matches
    return this.PLAYER_SYMBOLS[
      Math.floor(Math.random() * this.PLAYER_SYMBOLS.length)
    ];
  },
};
