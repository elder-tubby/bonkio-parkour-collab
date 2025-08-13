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
      UI.show("home") ||
      UI.showLobbyMessage("Game in progress. Choose a name to join"),
  );
  Network.onLobbyUpdate(({ players }) => {
    State.set("lobbyPlayers", players || []);
    if (!State.get("gameActive")) UI.show("home");
    UI.updateLobby(players);
  });

  Network.onGameUpdate(({ players, votes }) => {
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

  Network.onLineMoved(({ id, start, end }) => {
    const updated = State.get("lines").map((l) =>
      l.id === id ? { ...l, start, end } : l,
    );
    State.set("lines", updated);
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

    // Update the UI controls so the slider and label reflect the authoritative value
    if (UI.elems.spawnSizeSlider) UI.elems.spawnSizeSlider.value = String(size);
    if (UI.elems.spawnSizeValue)
      UI.elems.spawnSizeValue.innerText = String(size);

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

  function initializeGameView({
    capZone,
    players,
    spawnCircle,
    mapSize,
    lines,
    votesCount = 0,
    totalParticipants = 0,
  }) {
    State.set("gameActive", true);

    State.set(
      "lines",
      (lines || []).map((l) => ({
        id: l.id,
        playerId: l.playerId,
        start: l.start,
        end: l.end,
        symbol: l.symbol || l.username || "",
        type: l.type || "none",
      })),
    );

    UI.hide("lobbyMessage");
    UI.hide("home");
    UI.show("canvasWrap");
    UI.updatePlayers(players);

    // show vote counts properly; fallback to players.length if totalParticipants missing
    const yes = typeof votesCount === "number" ? votesCount : 0;
    const total =
      typeof totalParticipants === "number" && totalParticipants > 0
        ? totalParticipants
        : players.length;
    UI.setVote(yes, total);

    UI.setStatus("Draw by dragging on canvas");

    State.set("mapSize", mapSize ?? State.get("mapSize"));

    // after setting State.set("mapSize", mapSize ?? State.get("mapSize"));
    const authoritativeMapSize = State.get("mapSize");
    if (UI.elems.spawnSizeSlider)
      UI.elems.spawnSizeSlider.value = String(authoritativeMapSize);
    if (UI.elems.spawnSizeValue)
      UI.elems.spawnSizeValue.innerText = String(authoritativeMapSize);

    const canvas = UI.elems.canvas;
    const { width, height } = canvas;
    const spawnDiameter =
      (spawnCircle && spawnCircle.diameter) || getSpawnDiameter();

    State.set("spawnCircle", {
      x: (spawnCircle && spawnCircle.x) ?? width / 2,
      y: (spawnCircle && spawnCircle.y) ?? height / 2,
      diameter: spawnDiameter,
      dragging: false,
    });

    State.set("capZone", {
      x:
        (capZone && capZone.x) ??
        width / 2 - ((capZone && capZone.width) || 20) / 2,
      y:
        (capZone && capZone.y) ??
        height / 2 -
          ((capZone && capZone.height) || 12.4) / 2 -
          spawnDiameter -
          5,
      width: (capZone && capZone.width) || 20,
      height: (capZone && capZone.height) || 12.4,
      dragging: false,
    });

    Canvas.draw();
  }

  // Use the dedicated func for both handlers

  Network.onStartGame(({ capZone, players }) => {
    // Votes data missing, so pass zero / players.length
    initializeGameView({
      capZone,
      players,
      spawnCircle: null,
      mapSize: null,
      lines: [],
      votesCount: 0,
      totalParticipants: players.length,
    });
  });

  Network.onGameSnapshot(
    ({
      capZone,
      players,
      spawnCircle,
      mapSize,
      lines,
      votesCount,
      totalParticipants,
      lobbyPayload,
    }) => {
      if (lobbyPayload && Array.isArray(lobbyPayload.players)) {
        UI.updateLobby(lobbyPayload.players);
        State.set("lobbyPlayers", lobbyPayload.players);
      }

      initializeGameView({
        capZone,
        players,
        spawnCircle,
        mapSize,
        lines,
        votesCount,
        totalParticipants,
      });
    },
  );
}
document.addEventListener("DOMContentLoaded", init);
