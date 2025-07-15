// index.js
// ----------------------------
// Wire up Express, HTTP server, Socket.io, and your managers.

const path = require("path");
const express = require("express");
const http = require("http");
const socketio = require("socket.io");

const config = require("./config");
const LobbyManager = require("./lobbyManager");
const GameManager = require("./gameManager");

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const { MAX_PLAYERS } = require("./config");

// Serve your client-side bundle
app.use(express.static(path.join(__dirname, "public")));

// Create singletons
const lobby = new LobbyManager(io);
const game = new GameManager(io, lobby);

// Centralize your event names
const EVENTS = {
  JOIN_LOBBY: "joinLobby",
  SET_READY: "setReady",
  DRAW_LINE: "drawLine",
  VOTE_FINISH: "voteFinish",
  CHAT_MESSAGE: "chatMessage",
  DISCONNECT: "disconnect",
  GAME_IN_PRG: "gameInProgress",
  DELETE_LINE: "deleteLine",
  CHANGE_LINE_TYPE: "changeLineType",
  LINE_TYPE_CHANGED: "lineTypeChanged",
};

io.on("connection", (socket) => {
  // If a round is already in-flight, let them know immediately
  if (game.active) {
    socket.emit(EVENTS.GAME_IN_PRG);
  }

  socket.on(EVENTS.JOIN_LOBBY, (name) => {
    const currentCount = Object.keys(lobby.players).length;
    if (currentCount >= MAX_PLAYERS) {
      // tell the client the lobby is full
      socket.emit("lobbyFull", { max: MAX_PLAYERS });
      return;
    }

    lobby.addPlayer(socket.id, name);
  });

  socket.on(EVENTS.SET_READY, (isReady) => {
    lobby.setReady(socket.id, isReady);
    // auto‑start if ≥2 ready and no game running
    if (!game.active && lobby.readyCount() >= 2) {
      game.start();
    }
  });

  socket.on(EVENTS.DRAW_LINE, (line) => {
    game.handleLine(socket.id, line);
  });

  socket.on(EVENTS.DELETE_LINE, (lineId) => {
    game.deleteLine(socket.id, lineId);
  });

  socket.on(EVENTS.CHANGE_LINE_TYPE, (payload) => {
    game.changeLineType(socket.id, payload.id, payload.type);
  });

  socket.on(EVENTS.VOTE_FINISH, (vote) => {
    game.voteFinish(socket.id, vote);
  });

  socket.on(EVENTS.CHAT_MESSAGE, (msg) => {
    const player = lobby.players[socket.id];
    if (player && typeof msg === "string") {
      io.emit(EVENTS.CHAT_MESSAGE, { name: player.name, message: msg });
    }
  });

  socket.on(EVENTS.DISCONNECT, () => {
    lobby.removePlayer(socket.id);
    game.handleDisconnect(socket.id);
  });

  socket.on(EVENTS.CHANGE_LINE_TYPE, (payload) => {
    game.changeLineType(socket.id, payload.id, payload.type);
  });
});

const PORT = process.env.PORT || config.PORT;

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
