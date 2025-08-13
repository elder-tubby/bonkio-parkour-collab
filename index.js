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
  MOVE_LINE: "moveLine",
  CHANGE_LINE_PROPS: "changeLineProps", // NEW: client -> server
};

const MESSAGE_LIMIT = 5; // max messages
const MAX_MSG_LENGTH = 2000; // characters
const MESSAGE_WINDOW = 10 * 1000; // ms

// We'll store message timestamps in memory
const messageHistory = new Map(); // socket.id -> [timestamps]

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

    const result = lobby.addPlayer(socket.id, name);
    if (result && result.error === "duplicateName") {
      socket.emit("lobbyNameTaken", { reason: "Name already in use" });
      return;
    }

    lobby.addPlayer(socket.id, name);


  });

  socket.on(EVENTS.SET_READY, (isReady) => {
    lobby.setReady(socket.id, isReady);

    if (!game.active) {
      if (lobby.readyCount() >= 2) {
        game.start();
      }
    } else {
      if (isReady) game.addParticipant(socket.id);
      else game.removeParticipant(socket.id);
    }
  });

  socket.on(EVENTS.DRAW_LINE, (line) => {
    game.handleLine(socket.id, line);
  });

  socket.on(EVENTS.DELETE_LINE, (lineId) => {
    game.deleteLine(socket.id, lineId);
  });

  // allow clients to request line moves
  socket.on(EVENTS.MOVE_LINE, ({ id, start, end }) => {
    game.moveLine(socket.id, { id, start, end });
  });

  // handle changeLineProps (width/height/angle)
  socket.on(EVENTS.CHANGE_LINE_PROPS, (payload) => {
    // payload: { id, width?, height?, angle? }
    if (!payload || !payload.id) return;
    game.changeLineProperties(socket.id, payload.id, {
      width: payload.width,
      height: payload.height,
      angle: payload.angle,
    });
  });

  socket.on("spawnSizeChange", ({ size }) => {
    // clamp size
    const clamped = Math.max(1, Math.min(13, size));
    // persist in the GameManager so snapshots include it for late joiners
    game.setMapSize(clamped);
    // GameManager.setMapSize already does: this.mapSize = size; this.io.emit("spawnSizeChange", { size });
    // so no need to call io.emit here again — setMapSize will broadcast.
  });

  socket.on(EVENTS.VOTE_FINISH, (vote) => {
    game.voteFinish(socket.id, vote);
  });

  socket.on(EVENTS.CHAT_MESSAGE, (msg) => {
    const player = lobby.players[socket.id];
    if (!player || typeof msg !== "string") return;

    // length check
    if (msg.length > MAX_MSG_LENGTH) {
      socket.emit("chatError", {
        reason: `Message too long (max ${MAX_MSG_LENGTH} chars)`,
      });
      return;
    }

    // rate limit check
    const now = Date.now();
    if (!messageHistory.has(socket.id)) {
      messageHistory.set(socket.id, []);
    }
    const history = messageHistory.get(socket.id);

    // remove timestamps older than the window
    while (history.length && now - history[0] > MESSAGE_WINDOW) {
      history.shift();
    }

    if (history.length >= MESSAGE_LIMIT) {
      socket.emit("chatError", {
        reason: `You are sending messages too quickly. Please wait.`,
      });
      return;
    }

    // record timestamp & send
    history.push(now);
    io.emit(EVENTS.CHAT_MESSAGE, { name: player.name, message: msg });
  });

  socket.on(EVENTS.DISCONNECT, () => {
    lobby.removePlayer(socket.id);
    game.handleDisconnect(socket.id);
  });

  socket.on(EVENTS.CHANGE_LINE_TYPE, (payload) => {
    game.changeLineType(socket.id, payload.id, payload.type);
  });

  socket.on("spawnCircleMove", ({ x, y, diameter }) => {
    // store & broadcast (if diameter undefined, keep existing)
    const d =
      diameter ?? (game.spawnCircle ? game.spawnCircle.diameter : undefined);
    game.setSpawnCircle(x, y, d);
  });

  socket.on("capZoneMove", ({ x, y, width, height }) => {
    game.setCapZone(x, y, width, height);
  });
});

const PORT = process.env.PORT || config.PORT;

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
