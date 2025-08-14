/**
 * index.js - Main Server Entry Point
 *
 * This file sets up the Express server, initializes Socket.IO, and wires up
 * the core application logic modules (LobbyManager, GameManager).
 *
 * It defines a single point of entry for all incoming socket events and
 * delegates the handling of those events to the appropriate manager.
 */

const path = require("path");
const express = require("express");
const http = require("http");
const socketio = require("socket.io");

const config = require("./config");
const LobbyManager = require("./lobbyManager");
const { GameManager } = require("./gameManager");

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
  },
});

// --- Serve static client files ---
app.use(express.static(path.join(__dirname, "public")));

// --- Create singleton managers ---
const lobby = new LobbyManager(io);
const game = new GameManager(io, lobby);

// --- Centralized Event Names (Client -> Server) ---
const EVENTS = {
  // Connection / Lobby
  JOIN_LOBBY: "joinLobby",
  SET_READY: "setReady",
  DISCONNECT: "disconnect",

  // Game Flow
  VOTE_FINISH: "voteFinish",

  // Line Manipulation
  DRAW_LINE: "drawLine",
  UPDATE_LINE: "updateLine",
  DELETE_LINE: "deleteLine",
  REORDER_LINE: "reorderLine",

  // Map Object Manipulation
  UPDATE_SPAWN_CIRCLE: "updateSpawnCircle",
  UPDATE_CAP_ZONE: "updateCapZone",
  UPDATE_MAP_SIZE: "updateMapSize",

  // Communication
  CHAT_MESSAGE: "chatMessage",
};

// --- Rate Limiting for Chat ---
const CHAT_CONFIG = {
  MESSAGE_LIMIT: 5,
  MESSAGE_WINDOW_MS: 10000,
  MAX_MSG_LENGTH: 250,
};
const messageHistory = new Map();

// --- Main Connection Handler ---
io.on("connection", (socket) => {
  if (game.active) {
    socket.emit("gameInProgress");
  }

  // --- Lobby Handlers ---
  socket.on(EVENTS.JOIN_LOBBY, (name) => {
    if (Object.keys(lobby.players).length >= config.MAX_PLAYERS) {
      return socket.emit("lobbyFull");
    }
    const result = lobby.addPlayer(socket.id, name);
    if (result && result.error === "duplicateName") {
      return socket.emit("lobbyNameTaken");
    }
  });

  socket.on(EVENTS.SET_READY, (isReady) => {
    lobby.setReady(socket.id, isReady);
    // Check if the game should start
    if (!game.active && lobby.areAllPlayersReady()) {
      game.start();
    }
  });

  // --- Game Handlers ---
  socket.on(EVENTS.VOTE_FINISH, (vote) => {
    game.voteFinish(socket.id, vote);
  });

  // --- Line & Map Object Handlers (Delegated to GameManager) ---
  socket.on(EVENTS.DRAW_LINE, (lineData) => {
    game.handleLineCreation(socket.id, lineData);
  });

  socket.on(EVENTS.UPDATE_LINE, (payload) => {
    game.handleLineUpdate(socket.id, payload);
  });

  socket.on(EVENTS.DELETE_LINE, (lineId) => {
    game.handleLineDeletion(socket.id, lineId);
  });

  socket.on(EVENTS.REORDER_LINE, (payload) => {
    game.handleLineReorder(socket.id, payload);
  });

  socket.on(EVENTS.UPDATE_SPAWN_CIRCLE, (data) => {
    game.setSpawnCircle(socket.id, data);
  });

  socket.on(EVENTS.UPDATE_CAP_ZONE, (data) => {
    game.setCapZone(socket.id, data);
  });

  socket.on(EVENTS.UPDATE_MAP_SIZE, (size) => {
    game.setMapSize(socket.id, size);
  });

  // --- Chat Handler with Rate Limiting ---
  socket.on(EVENTS.CHAT_MESSAGE, (msg) => {
    const player = lobby.players[socket.id];
    if (!player || typeof msg !== "string" || !msg.trim()) return;

    const trimmedMsg = msg.slice(0, CHAT_CONFIG.MAX_MSG_LENGTH);

    const now = Date.now();
    const history = messageHistory.get(socket.id) || [];
    const recentMessages = history.filter(
      (ts) => now - ts < CHAT_CONFIG.MESSAGE_WINDOW_MS,
    );

    if (recentMessages.length >= CHAT_CONFIG.MESSAGE_LIMIT) {
      return socket.emit("chatError", {
        reason: "You're sending messages too quickly.",
      });
    }

    recentMessages.push(now);
    messageHistory.set(socket.id, recentMessages);

    io.emit("chatMessage", { name: player.name, message: trimmedMsg });
  });

  // --- Disconnect Handler ---
  socket.on(EVENTS.DISCONNECT, () => {
    const playerName = lobby.players[socket.id]?.name;
    game.handleDisconnect(socket.id); // Handle game logic first
    lobby.removePlayer(socket.id); // Then update lobby
    messageHistory.delete(socket.id);
    if (playerName) {
      console.log(`Player ${playerName} (${socket.id}) disconnected.`);
    }
  });
});

// --- Start Server ---
const PORT = process.env.PORT || config.PORT;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
