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

export function deleteLine(lineId) {
  socket.emit("deleteLine", lineId);
}

export function onLineDeleted(cb) {
  socket.on("lineDeleted", cb);
}

export function onLineTypeChanged(handler) {
  socket.on("lineTypeChanged", handler);
}

export function changeLineType(payload) {
  socket.emit("changeLineType", payload);
}

export function emitSpawnCircleMove(x, y) {
  socket.emit("spawnCircleMove", { x, y });
}

export function onSpawnCircleMove(cb) {
  socket.on("spawnCircleMove", cb);
}

export function emitCapZoneMove(x, y) {
  socket.emit("capZoneMove", { x, y });
}

export function onCapZoneMove(cb) {
  socket.on("capZoneMove", cb);
}
