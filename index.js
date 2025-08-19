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
      if (result.error === "lobbyFull") {
        return socket.emit(EVENTS.LOBBY_FULL);
      } else if (result.error === "duplicateName") {
        return socket.emit(EVENTS.LOBBY_NAME_TAKEN);
      }
      return;
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
  socket.on(EVENTS.CREATE_OBJECT, (objectData) =>
    game.handleObjectCreation(socket.id, objectData),
  );
  socket.on(EVENTS.CREATE_OBJECTS_BATCH, (batchData) =>
    game.handleObjectsCreationBatch(socket.id, batchData),
  );
  socket.on(EVENTS.UPDATE_OBJECT, (updateData) =>
    game.handleObjectUpdate(socket.id, updateData),
  );
  socket.on(EVENTS.DELETE_OBJECT, (objectId) =>
    game.handleObjectDeletion(socket.id, objectId),
  );
  socket.on(EVENTS.REORDER_OBJECT, (reorderData) =>
    game.handleObjectReorder(socket.id, reorderData),
  );
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

    if (typeof message !== "string" || message.trim().length === 0) return;
    if (message.length > 1000) {
      return socket.emit(EVENTS.CHAT_ERROR, "Message is too long (max 1000).");
    }

    const now = Date.now();
    const userHistory = chatLimiter.get(socket.id) || [];
    const recentHistory = userHistory.filter((ts) => now - ts < 10000);

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
    chatLimiter.delete(socket.id);
    game.handleDisconnect(socket.id);
    lobby.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});