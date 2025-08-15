import { EVENTS } from "./events.js";

const socket = window.io();

// ---- EMITTERS (Client -> Server) ----

export function joinLobby(name) {
  socket.emit(EVENTS.JOIN_LOBBY, name);
}

export function setReady(isReady) {
  socket.emit(EVENTS.SET_READY, isReady);
}

export function voteFinish(vote) {
  socket.emit(EVENTS.VOTE_FINISH, vote);
}

export function sendChat(message) {
  socket.emit(EVENTS.SEND_CHAT, message);
}

export function createLine(lineData) {
  socket.emit(EVENTS.CREATE_LINE, lineData);
}

export function pasteLines(pasteData) {
  socket.emit(EVENTS.PASTE_LINES, pasteData);
}

export function deleteLine(lineId) {
  socket.emit(EVENTS.DELETE_LINE, lineId);
}

export function reorderLines(payload) {
  socket.emit(EVENTS.REORDER_LINES, payload);
}

export function updateLine(payload) {
  socket.emit(EVENTS.UPDATE_LINE, payload);
}

export function setSpawnCircle(data) {
  socket.emit(EVENTS.SET_SPAWN_CIRCLE, data);
}

export function setCapZone(data) {
  socket.emit(EVENTS.SET_CAP_ZONE, data);
}

export function setMapSize(size) {
  socket.emit(EVENTS.SET_MAP_SIZE, size);
}

// ---- LISTENERS (Server -> Client) ----

export function onConnectWithId(cb) {
  socket.on(EVENTS.CONNECT_WITH_ID, cb);
}

export function onLobbyFull(cb) {
  socket.on(EVENTS.LOBBY_FULL, cb);
}

export function onLobbyNameTaken(cb) {
  socket.on(EVENTS.LOBBY_NAME_TAKEN, cb);
}

export function onGameInProgress(cb) {
  socket.on(EVENTS.GAME_IN_PROGRESS, cb);
}

export function onLobbyUpdate(cb) {
  socket.on(EVENTS.LOBBY_UPDATE, cb);
}

export function onStartGame(cb) {
  socket.on(EVENTS.START_GAME, cb);
}

export function onGameSnapshot(cb) {
  socket.on(EVENTS.GAME_SNAPSHOT, cb);
}

export function onEndGame(cb) {
  socket.on(EVENTS.END_GAME, cb);
}

export function onGameUpdate(cb) {
  socket.on(EVENTS.GAME_UPDATE, cb);
}

export function onLineCreated(cb) {
  socket.on(EVENTS.LINE_CREATED, cb);
}

export function onLineUpdated(cb) {
  socket.on(EVENTS.LINE_UPDATED, cb);
}

export function onLineDeleted(cb) {
  socket.on(EVENTS.LINE_DELETED, cb);
}

export function onLinesReordered(cb) {
  socket.on(EVENTS.LINES_REORDERED, cb);
}

export function onSpawnCircleUpdate(cb) {
  socket.on(EVENTS.SPAWN_CIRCLE_UPDATED, cb);
}

export function onCapZoneUpdate(cb) {
  socket.on(EVENTS.CAP_ZONE_UPDATED, cb);
}

export function onMapSizeUpdate(cb) {
  socket.on(EVENTS.MAP_SIZE_UPDATED, cb);
}

export function onChatMessage(cb) {
  socket.on(EVENTS.CHAT_MESSAGE, cb);
}

export function onChatError(cb) {
  socket.on(EVENTS.CHAT_ERROR, cb);
}

export function onClearChat(cb) {
  socket.on(EVENTS.CLEAR_CHAT, cb);
}

export { socket };
