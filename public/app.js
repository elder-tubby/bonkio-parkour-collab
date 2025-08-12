// app.js
// Orchestrator tying everything together
import UI from "./ui.js";
import State from "./state.js";
import Canvas from "./canvas.js";
import * as Network from "./network.js";
import { bindUIEvents } from "./handlers.js";
import { updateLineTypeUI } from "./utils-client.js";
import { showToast } from "./utils-client.js";
import { getSpawnDiameter } from "./utils-client.js";

function init() {
  UI.init();
  bindUIEvents();

  Network.onLobbyFull(({ max }) => {
    alert(`Sorry, the lobby is full (max ${max} players).`);
  });
  Network.onConnect((id) => State.set("playerId", id));
  Network.onGameInProgress(
    () =>
      UI.show("home") || UI.showLobbyMessage("Game in progress. Please wait."),
  );
  Network.onLobbyUpdate(({ players }) => {
    if (!State.get("gameActive")) UI.show("home");
    UI.updateLobby(players);
  });

  Network.onStartGame(({ capZone, players }) => {
    State.set("gameActive", true);
    State.set("lines", []);
    UI.hide("lobbyMessage");
    UI.hide("home");
    UI.show("canvasWrap");

    // Add some fake players (only UI)
    const fakePlayers = [
      { id: "fake1", name: "Bot_Alice" },
      { id: "fake2", name: "Bot_Bob" },
      { id: "fake3", name: "Bot_Charlie" },
      { id: "fake4", name: "Bot_Alice" },
      { id: "fake5", name: "Bot_Bob" },
      { id: "fake6", name: "Bot_Charlie" }
    ];
    UI.updatePlayers(players);
    UI.setStatus("Draw by dragging on canvas");

    const { width, height } = UI.elems.canvas;
    const { diameter: spawnDiameter } = State.get("spawnCircle");
    State.set("spawnCircle", {
      x: width / 2,
      y: height / 2,
      diameter: spawnDiameter,
      dragging: false,
    });

    const { width: czW, height: czH } = State.get("capZone");
    State.set("capZone", {
      x: width / 2 - czW / 2,
      y: height / 2 - czH / 2 - spawnDiameter - 5,
      width: czW,
      height: czH,
      dragging: false,
    });

    const canvas = UI.elems.canvas;

    // // === Test lines for coordinate mapping verification ===
    // const username = State.get("username") || "System";
    // const thickness = 5; // same stroke width for visibility

    // // Game canvas dimensions
    // const GW = canvas.width;
    // const GH = canvas.height;

    // // Helper to send a horizontal line
    // function drawTestLine(startX, endX, y) {
    //   Network.drawLine({
    //     start: { x: startX, y },
    //     end: { x: endX, y },
    //     username,
    //   });
    // }

    // // 4) Top edge (horizontal center)
    // drawTestLine(0, GW, 0);

    // drawTestLine(0, GW, GH / 4);
    // drawTestLine(0, GW, GH / 2);
    // drawTestLine(0, GW, (GH * 3) / 4);

    // // 6) Full-width horizontal near bottom (5px from bottom)
    // drawTestLine(0, GW, GH - thickness / 2);

    Canvas.draw();
  });

  Network.onGameUpdate(({ players, votes }) => {
    // Add some fake players (only UI)
    const fakePlayers = [
      { id: "fake1", name: "Bot_Alice" },
      { id: "fake2", name: "Bot_Bob" },
      { id: "fake3", name: "Bot_Charlie" },
      { id: "fake4", name: "Bot_Alice" },
      { id: "fake5", name: "Bot_Bob" },
      { id: "fake6", name: "Bot_Charlie" }
    ];
    UI.updatePlayers(players);
    UI.setVote(votes, players.length);
  });
  Network.onPlayerLine(({ id, playerId, line, symbol }) => {
    const lines = State.get("lines");

    State.set("lines", [
      ...lines,
      {
        id,
        playerId,
        start: line.start,
        end: line.end,
        symbol, // store symbol here
        type: "none",
      },
    ]);

    if (playerId === State.get("playerId")) {
      State.set("selectedLineId", id);
    }

    Canvas.draw();
  });


  Network.onChatMessage((msg) => UI.appendChat(msg));

  Network.onChatError(({ reason }) => {
    showToast(reason); // or better: UI.showLobbyMessage(reason) for a few seconds
  });
  Network.onEndGame(({ reason }) => {
    State.set("gameActive", false);
    UI.hide("lobbyMessage");
    UI.hide("canvasWrap");
    UI.show("home");
    UI.resetControls();
    UI.setEndReason(
      reason === "voted"
        ? "All players voted to end."
        : reason === "player_left"
          ? "Only one player left - game ended."
          : "Game ended.",
    );
    UI.show("gameEndPopup");
  });

  Network.onLineDeleted(({ id }) => {
    const lines = State.get("lines").filter((l) => l.id !== id);
    State.set("lines", lines);
    // if we deleted our selected line, clear selection
    if (State.get("selectedLineId") === id) {
      State.set("selectedLineId", null);
    }
    Canvas.draw();
  });

  // also listen for server broadcasts of type‐changes:
  Network.onLineTypeChanged(({ id, type }) => {
    const updated = State.get("lines").map((l) =>
      l.id === id ? { ...l, type } : l,
    );
    State.set("lines", updated);
    Canvas.draw();
  });

  Network.onSpawnCircleMove(({ x, y }) => {
    const spawn = State.get("spawnCircle");
    State.set("spawnCircle", { ...spawn, x, y });
    Canvas.draw();
  });

  Network.onSpawnSizeChange(({ size }) => {
    State.set("mapSize", size);
    const spawn = State.get("spawnCircle");
    State.set("spawnCircle", {
      ...spawn,
      diameter: getSpawnDiameter(),
    });
    Canvas.draw();
  });

  Network.onCapZoneMove(({ x, y }) => {
    const capZone = State.get("capZone");
    State.set("capZone", { ...capZone, x, y });
    Canvas.draw();
  });

  State.onChange((key, val) => {
    if (key === "selectedLineId") {
      UI.elems.deleteLineBtn.disabled = !val;
      // type selector
      UI.elems.lineTypeSelect.disabled = !val;

      // if a line is selected, set the selector to its current type
      if (val) {
        const line = State.get("lines").find((l) => l.id === val);
        updateLineTypeUI(line?.type || "none");
        UI.elems.lineTypeSelect.value = line?.type || "none";
      }
      Canvas.draw();
    }
  });

  // initial screen
  UI.show("home");
}

document.addEventListener("DOMContentLoaded", init);
