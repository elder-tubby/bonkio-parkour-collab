// config.js
module.exports = {
  EVENTS: {
    // Server -> Client
    CONNECT_WITH_ID: "connectWithId",
    LOBBY_FULL: "lobbyFull",
    LOBBY_NAME_TAKEN: "lobbyNameTaken",
    GAME_IN_PROGRESS: "gameInProgress",
    LOBBY_UPDATE: "lobbyUpdate",
    START_GAME: "startGame",
    GAME_SNAPSHOT: "gameSnapshot",
    END_GAME: "endGame",
    GAME_UPDATE: "gameUpdate",
    LINE_CREATED: "lineCreated",
    LINE_UPDATED: "lineUpdated",
    LINE_DELETED: "lineDeleted",
    LINES_REORDERED: "linesReordered",
    SPAWN_CIRCLE_UPDATED: "spawnCircleUpdated",
    CAP_ZONE_UPDATED: "capZoneUpdated",
    MAP_SIZE_UPDATED: "mapSizeUpdated",
    CLEAR_CHAT: "clearChat",
    CHAT_MESSAGE: "chatMessage",
    CHAT_ERROR: "chatError",

    // Client -> Server
    JOIN_LOBBY: "joinLobby",
    SET_READY: "setReady",
    VOTE_FINISH: "voteFinish",
    SEND_CHAT: "sendChat",
    CREATE_LINE: "createLine",
    DELETE_LINE: "deleteLine",
    REORDER_LINES: "reorderLines",
    UPDATE_LINE: "updateLine",
    SET_SPAWN_CIRCLE: "setSpawnCircle",
    SET_CAP_ZONE: "setCapZone",
    SET_MAP_SIZE: "setMapSize",
    PASTE_LINES: "pasteLines",
  },
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
