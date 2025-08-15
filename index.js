// server/index.js
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const LobbyManager = require("./lobbyManager");
const { GameManager } = require("./gameManager");
const { EVENTS } = require("./config");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobby = new LobbyManager(io, () => game.active);
const game = new GameManager(io, lobby);
const chatLimiter = new Map();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.emit(EVENTS.CONNECT_WITH_ID, socket.id);

  // Send current lobby and game state to new connections
  socket.emit(EVENTS.LOBBY_UPDATE, {
    players: lobby.getLobbyPayload().players,
    gameActive: game.active,
  });
  if (game.active) {
    socket.emit(EVENTS.GAME_SNAPSHOT, game.getSnapshotFor(socket.id));
  }

  socket.on(EVENTS.JOIN_LOBBY, (name) => {
    const result = lobby.addPlayer(socket.id, name);
    if (result.error) {
      return socket.emit(EVENTS.LOBBY_NAME_TAKEN);
    }
    lobby.broadcastLobby();
    if (game.active) {
      socket.emit(EVENTS.GAME_IN_PROGRESS);
    }
  });

  socket.on(EVENTS.SET_READY, (isReady) => {
    if (!lobby.players[socket.id]) return;

    lobby.setReady(socket.id, isReady);

    if (game.active && isReady) {
      game.addParticipant(socket.id);
    } else if (!game.active && lobby.canGameStart()) {
      game.start();
    }
  });

  // Game Actions
  socket.on(EVENTS.CREATE_LINE, (lineData) =>
    game.handleLineCreation(socket.id, lineData),
  );
  socket.on(EVENTS.UPDATE_LINE, (updateData) =>
    game.handleLineUpdate(socket.id, updateData),
  );
  socket.on(EVENTS.DELETE_LINE, (lineId) =>
    game.handleLineDeletion(socket.id, lineId),
  );
  socket.on(EVENTS.REORDER_LINES, (reorderData) =>
    game.handleLineReorder(socket.id, reorderData),
  );
  // New event handler for pasted lines
  socket.on(EVENTS.PASTE_LINES, (pasteData) =>
    game.handlePasteLines(socket.id, pasteData),
  );

  // Map Object Actions
  socket.on(EVENTS.SET_SPAWN_CIRCLE, (pos) =>
    game.setSpawnCircle(socket.id, pos),
  );
  socket.on(EVENTS.SET_CAP_ZONE, (pos) => game.setCapZone(socket.id, pos));
  socket.on(EVENTS.SET_MAP_SIZE, (size) => game.setMapSize(socket.id, size));

  // Voting
  socket.on(EVENTS.VOTE_FINISH, (vote) => {
    if (lobby.players[socket.id]) {
      game.voteFinish(socket.id, vote);
    }
  });

  // Chat
  socket.on(EVENTS.SEND_CHAT, (message) => {
    const player = lobby.players[socket.id];
    if (!player) return;

    // Message validation
    if (typeof message !== "string" || message.trim().length === 0) return;
    if (message.length > 1000) {
      return socket.emit(EVENTS.CHAT_ERROR, "Message is too long (max 1000).");
    }

    // Rate limiting
    const now = Date.now();
    const userHistory = chatLimiter.get(socket.id) || [];
    const recentHistory = userHistory.filter((ts) => now - ts < 10000); // 10 seconds

    if (recentHistory.length >= 5) {
      return socket.emit(
        EVENTS.CHAT_ERROR,
        "You are sending messages too quickly.",
      );
    }

    recentHistory.push(now);
    chatLimiter.set(socket.id, recentHistory);

    io.emit(EVENTS.CHAT_MESSAGE, { name: player.name, message });
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    chatLimiter.delete(socket.id); // Clean up on disconnect
    game.handleDisconnect(socket.id);
    lobby.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
