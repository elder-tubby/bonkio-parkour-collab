/**
 * network.js - Client-Side Network Interface
 *
 * This file abstracts all communication with the server's Socket.IO endpoint.
 * It provides a clean, consistent API for both emitting events to the server
 * and subscribing to events received from the server.
 */

// Assuming socket.io client is loaded globally, e.g., via a <script> tag.
const socket = window.io();

// ---- EMITTERS (Client -> Server) ----

export function joinLobby(name) {
  socket.emit("joinLobby", name);
}

export function setReady(isReady) {
  socket.emit("setReady", isReady);
}

export function voteFinish(vote) {
  socket.emit("voteFinish", vote);
}

export function sendChat(message) {
  // NOTE: The server listens for "sendChat", but the original file emitted "chatMessage".
  // This has been corrected to align with the server (`index.js`).
  socket.emit("sendChat", message);
}

// Line and Map Object Manipulation

// FIX: Renamed from drawLine and corrected event name to match server
export function createLine(lineData) {
  socket.emit("createLine", lineData);
}

export function deleteLine(lineId) {
  socket.emit("deleteLine", lineId);
}

// FIX: Renamed from reorderLine and corrected event name to match server
export function reorderLines(payload) {
  socket.emit("reorderLines", payload);
}

/**
 * Unified emitter for all types of line updates.
 * @param {object} payload - Must include `id` and any of:
 * start, end, width, height, angle, type,
 * widthDelta, heightDelta, angleDelta, nudge {x, y}
 */
// FIX: Renamed from emitLineUpdate for consistency
export function updateLine(payload) {
  socket.emit("updateLine", payload);
}

// FIX: Renamed from emitSpawnCircleUpdate and corrected event name
export function setSpawnCircle(data) {
  socket.emit("setSpawnCircle", data);
}

// FIX: Renamed from emitCapZoneUpdate and corrected event name
export function setCapZone(data) {
  socket.emit("setCapZone", data);
}

// FIX: Renamed from emitSpawnSizeChange and corrected event name
export function setMapSize(size) {
  socket.emit("setMapSize", size);
}

// ---- LISTENERS (Server -> Client) ----

// Connection
export function onConnectWithId(cb) {
  socket.on("connectWithId", cb);
}

export function onLobbyFull(cb) {
  socket.on("lobbyFull", cb);
}
export function onLobbyNameTaken(cb) {
  socket.on("lobbyNameTaken", cb);
}
export function onGameInProgress(cb) {
  socket.on("gameInProgress", cb);
}

// Lobby and Game Flow
export function onLobbyUpdate(cb) {
  socket.on("lobbyUpdate", cb);
}
export function onStartGame(cb) {
  socket.on("startGame", cb);
}
export function onGameSnapshot(cb) {
  socket.on("gameSnapshot", cb);
}
export function onEndGame(cb) {
  socket.on("endGame", cb);
}
export function onGameUpdate(cb) {
  socket.on("gameUpdate", cb);
}

// Authoritative State Updates
export function onLineCreated(cb) {
  socket.on("lineCreated", cb);
}
export function onLineUpdated(cb) {
  socket.on("lineUpdated", cb);
}
export function onLineDeleted(cb) {
  socket.on("lineDeleted", cb);
}
export function onLinesReordered(cb) {
  socket.on("linesReordered", cb);
}

export function onSpawnCircleUpdate(cb) {
  socket.on("spawnCircleUpdated", cb);
}
export function onCapZoneUpdate(cb) {
  socket.on("capZoneUpdated", cb);
}
export function onMapSizeUpdate(cb) {
  socket.on("mapSizeUpdated", cb);
}

// Chat
export function onChatMessage(cb) {
  socket.on("chatMessage", cb);
}
export function onChatError(cb) {
  socket.on("chatError", cb);
}
export function onClearChat(cb) {
  socket.on("clearChat", cb);
}

// Utility: expose raw socket if needed for debugging or special cases
export { socket };
