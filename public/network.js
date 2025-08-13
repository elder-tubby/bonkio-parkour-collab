// network.js
// Encapsulates all Socket.io interactions
const socket = window.io();

// Emitters
export function joinLobby(name) {
  socket.emit("joinLobby", name);
}

export function setReady(isReady) {
  socket.emit("setReady", isReady);
}

export function voteFinish(vote) {
  socket.emit("voteFinish", vote);
}

export function drawLine(line) {
  socket.emit("drawLine", line);
}

export function sendChat(message) {
  socket.emit("chatMessage", message);
}

export function deleteLine(lineId) {
  socket.emit("deleteLine", lineId);
}

export function changeLineType(payload) {
  socket.emit("changeLineType", payload);
}

// New: change line properties (width, height, angle)
export function changeLineProps(payload) {
  // payload: { id, width?, height?, angle? }
  socket.emit("changeLineProps", payload);
}

export function moveLine(payload) {
  socket.emit("moveLine", payload);
}

// Handlers
export function onLobbyUpdate(cb) {
  socket.on("lobbyUpdate", cb);
}

export function onGameInProgress(cb) {
  socket.on("gameInProgress", cb);
}

export function onStartGame(cb) {
  socket.on("startGame", cb);
}

export function onGameUpdate(cb) {
  socket.on("gameUpdate", cb);
}

export function onPlayerLine(cb) {
  socket.on("playerLine", cb);
}

export function onChatMessage(cb) {
  socket.on("chatMessage", cb);
}

export function onEndGame(cb) {
  socket.on("endGame", cb);
}

export function onLobbyFull(cb) {
  socket.on("lobbyFull", cb);
}

export function onConnect(cb) {
  socket.on("connect", () => cb(socket.id));
}

export function onLineDeleted(cb) {
  socket.on("lineDeleted", cb);
}

export function onLineTypeChanged(handler) {
  socket.on("lineTypeChanged", handler);
}

// New: clients can listen to property updates
export function onLinePropsChanged(handler) {
  socket.on("linePropsChanged", handler);
}

// lineMoved event (server now also includes width & angle when applicable)
export function onLineMoved(cb) {
  socket.on("lineMoved", cb);
}

export function onSpawnCircleMove(cb) {
  socket.on("spawnCircleMove", cb);
}

export function onCapZoneMove(cb) {
  socket.on("capZoneMove", cb);
}

export function onChatError(cb) {
  socket.on("chatError", cb);
}

export function emitSpawnCircleMove(x, y) {
  socket.emit("spawnCircleMove", { x, y });
}

export function emitCapZoneMove(x, y) {
  socket.emit("capZoneMove", { x, y });
}

export function emitSpawnSizeChange(size) {
  socket.emit("spawnSizeChange", { size });
}

export function onSpawnSizeChange(cb) {
  socket.on("spawnSizeChange", cb);
}

export function onGameSnapshot(cb) {
  socket.on("gameSnapshot", cb);
}

export function onLobbyNameTaken(cb) {
  socket.on("lobbyNameTaken", cb);
}