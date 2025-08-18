// public/events.js
export const EVENTS = {
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

  SPAWN_CIRCLE_UPDATED: "spawnCircleUpdated",
  CAP_ZONE_UPDATED: "capZoneUpdated",
  MAP_SIZE_UPDATED: "mapSizeUpdated",
  CLEAR_CHAT: "clearChat",
  CHAT_MESSAGE: "chatMessage",
  CHAT_ERROR: "chatError",
  OBJECT_CREATED: "objectCreated", // Replaces LINE_CREATED
  OBJECTS_CREATED_BATCH: "objectsCreatedBatch", // Replaces POLYGONS_CREATED_BATCH
  OBJECT_UPDATED: "objectUpdated", // Replaces LINE_UPDATED, POLYGON_UPDATED
  OBJECT_DELETED: "objectDeleted", // Replaces LINE_DELETED, POLYGON_DELETED
  OBJECTS_REORDERED: "objectsReordered",

  // Client -> Server
  JOIN_LOBBY: "joinLobby",
  SET_READY: "setReady",
  VOTE_FINISH: "voteFinish",
  SEND_CHAT: "sendChat",
  CREATE_OBJECT: "createObject", // Replaces CREATE_LINE
  CREATE_OBJECTS_BATCH: "createObjectsBatch", // Replaces CREATE_POLYGONS_BATCH
  DELETE_OBJECT: "deleteObject", // Replaces DELETE_LINE, DELETE_POLYGON
  REORDER_OBJECT: "reorderObject", // Replaces REORDER_LINE, REORDER_POLYGON
  UPDATE_OBJECT: "updateObject",
  SET_SPAWN_CIRCLE: "setSpawnCircle",
  SET_CAP_ZONE: "setCapZone",
  SET_MAP_SIZE: "setMapSize",
  PASTE_LINES: "pasteLines",
};
