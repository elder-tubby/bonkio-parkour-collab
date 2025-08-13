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

  // Player line: server now sends width, height, angle (and type)
  Network.onPlayerLine(
    ({ id, playerId, line, username, symbol, width, height, angle, type }) => {
      const lines = State.get("lines");

      // Ensure we normalize to new schema
      const stored = {
        id,
        playerId,
        start: line.start,
        end: line.end,
        symbol, // store symbol here
        username: username || "",
        type: type || "none",
        width:
          typeof width === "number" ? width : distance(line.start, line.end),
        height: typeof height === "number" ? height : 4,
        angle:
          typeof angle === "number"
            ? angle
            : computeAngleDeg(line.start, line.end),
      };

      State.set("lines", [...lines, stored]);

      if (playerId === State.get("playerId")) {
        State.set("selectedLineId", id);
      }

      Canvas.draw();
    },
  );

  Network.onLineDeleted(({ id }) => {
    const lines = State.get("lines").filter((l) => l.id !== id);
    State.set("lines", lines);
    // if we deleted our selected line, clear selection
    if (State.get("selectedLineId") === id) {
      State.set("selectedLineId", null);
    }
    // Hide editor if open
    UI.hideLineEditor();
    Canvas.draw();
  });

  // lineMoved now can carry width & angle
  Network.onLineMoved(({ id, start, end, width, angle }) => {
    const updated = State.get("lines").map((l) =>
      l.id === id
        ? {
            ...l,
            start,
            end,
            width: typeof width === "number" ? width : distance(start, end),
            angle:
              typeof angle === "number" ? angle : computeAngleDeg(start, end),
          }
        : l,
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

  // Listen to property change events (width/height/angle)
  Network.onLinePropsChanged(({ id, width, height, angle, start, end }) => {
    const updated = State.get("lines").map((l) =>
      l.id === id
        ? {
            ...l,
            width: typeof width === "number" ? width : l.width,
            height: typeof height === "number" ? height : l.height,
            angle: typeof angle === "number" ? angle : l.angle,
            // If server sent explicit start/end, use them; otherwise keep existing
            start: start ? start : l.start,
            end: end ? end : l.end,
          }
        : l,
    );
    State.set("lines", updated);
    // If this line is selected, update sliders
    if (State.get("selectedLineId") === id) {
      const line = updated.find((x) => x.id === id);
      UI.updateLineEditorValues(line);
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

        // Show editor and set values
        UI.showLineEditor(line);
      } else {
        UI.hideLineEditor();
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
        username: l.username || "",
        type: l.type || "none",
        width: typeof l.width === "number" ? l.width : distance(l.start, l.end),
        height: typeof l.height === "number" ? l.height : 4,
        angle:
          typeof l.angle === "number"
            ? l.angle
            : computeAngleDeg(l.start, l.end),
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

// helpers used locally in this file (kept here to avoid adding more shared utilities)
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
function computeAngleDeg(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
