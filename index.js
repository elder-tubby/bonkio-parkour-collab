// server/index.js
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const LobbyManager = require("./lobbyManager");
const { GameManager } = require("./gameManager");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobby = new LobbyManager(io);
const game = new GameManager(io, lobby);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.emit("connectWithId", socket.id);

  socket.on("joinLobby", (name) => {
    const result = lobby.addPlayer(socket.id, name);
    if (result.error) {
      return socket.emit("lobbyNameTaken");
    }
    lobby.broadcastLobby();
    if (game.active) {
      socket.emit("gameInProgress");
    }
  });

  // --- FIX for Late Join & Game Start (Problems 4 & 5) ---
  socket.on("setReady", (isReady) => {
    if (!lobby.players[socket.id]) return;

    lobby.setReady(socket.id, isReady);

    if (game.active && isReady) {
      // If a game is running and the player readies up, add them to it.
      game.addParticipant(socket.id);
    } else if (!game.active && lobby.canGameStart()) {
      // If no game is running, check if enough players are ready to start one.
      game.start();
    }
  });

  // Game Actions
  socket.on("createLine", (lineData) =>
    game.handleLineCreation(socket.id, lineData),
  );
  socket.on("updateLine", (updateData) =>
    game.handleLineUpdate(socket.id, updateData),
  );
  socket.on("deleteLine", (lineId) =>
    game.handleLineDeletion(socket.id, lineId),
  );
  socket.on("reorderLines", (reorderData) =>
    game.handleLineReorder(socket.id, reorderData),
  );

  // Map Object Actions
  socket.on("setSpawnCircle", (pos) => game.setSpawnCircle(socket.id, pos));
  socket.on("setCapZone", (pos) => game.setCapZone(socket.id, pos));
  socket.on("setMapSize", (size) => game.setMapSize(socket.id, size));

  // Chat
  socket.on("sendChat", (message) => {
    const player = lobby.players[socket.id];
    if (player) {
      io.emit("chatMessage", { name: player.name, message });
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    game.handleDisconnect(socket.id);
    lobby.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
