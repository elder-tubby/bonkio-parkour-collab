/**
 * app.js - Client-Side Orchestrator
 */
import UI from "./ui.js";
import State from "./state.js";
import Canvas from "./canvas.js";
import * as Network from "./network.js";
import { bindUIEvents } from "./handlers.js";
import { getSpawnDiameter } from "./utils-client.js";

function main() {
  UI.init();
  bindUIEvents();
  bindNetworkEvents();
  watchStateChanges();
  Canvas.draw();
}

function bindNetworkEvents() {
  // Connection & Lobby
  Network.onConnectWithId((id) => State.set("socketId", id));

  Network.onLobbyUpdate(({ players }) => {
    State.set("players", players || []);
    UI.updateLobby(players || []);
  });
  Network.onGameInProgress(() =>
    UI.showLobbyMessage("Game in progress. Set 'Ready' to join."),
  );

  // Game Flow
  Network.onStartGame(initializeGameView);
  Network.onGameSnapshot(initializeGameView);
  Network.onGameUpdate(({ players, votes, totalParticipants }) => {
    UI.updatePlayers(players || []);
    UI.setVote(votes ?? 0, totalParticipants ?? 0);
  });

  // FIX: Reworked the game end logic to correctly transition UI states.
  Network.onEndGame(({ reason }) => {
    State.set("gameActive", false);
    // 1. Hide the game canvas.
    UI.hide("canvasWrap");
    // 2. Show the home screen.
    UI.show("home");
    // 3. Set the reason in the popup.
    UI.setEndReason(
      reason === "voted" ? "All players voted to end." : "A player left.",
    );
    // 4. Show the popup as an overlay on top of the home screen.
    UI.show("gameEndPopup");
  });

  // Authoritative State Changes
  Network.onLineCreated((newLine) => {
    State.set("lines", [...State.get("lines"), newLine]);
  });
  Network.onLineUpdated((updatedLine) => {
    const lines = State.get("lines").map((l) =>
      l.id === updatedLine.id ? updatedLine : l,
    );
    State.set("lines", lines);
  });
  Network.onLineDeleted(({ id }) => {
    State.set(
      "lines",
      State.get("lines").filter((l) => l.id !== id),
    );
    if (State.get("selectedLineId") === id) {
      State.set("selectedLineId", null);
    }
  });
  Network.onLinesReordered((reorderedLines) => {
    State.set("lines", reorderedLines || []);
  });
  Network.onSpawnCircleUpdate((spawnCircle) =>
    State.set("spawnCircle", spawnCircle),
  );
  Network.onCapZoneUpdate((capZone) => State.set("capZone", capZone));
  Network.onMapSizeUpdate((mapSize) => State.set("mapSize", mapSize));

  // Chat
  Network.onChatMessage((msg) => UI.appendChat(msg));
}

function watchStateChanges() {
  let drawPending = false;
  const scheduleDraw = () => {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => {
      Canvas.draw();
      drawPending = false;
    });
  };

  State.onChange((key, value) => {
    const visualKeys = [
      "lines",
      "currentLine",
      "draggingPreview",
      "capZone",
      "spawnCircle",
      "selectedLineId",
      "hideUsernames",
    ];
    if (visualKeys.includes(key)) {
      scheduleDraw();
    }

    switch (key) {
      case "selectedLineId":
        const line = (State.get("lines") || []).find((l) => l.id === value);
        UI.showLineEditor(line);
        break;

      case "mapSize":
        if (UI.elems.spawnSizeSlider)
          UI.elems.spawnSizeSlider.value = String(value);
        if (UI.elems.spawnSizeValue)
          UI.elems.spawnSizeValue.innerText = String(value);

        const newDiameter = getSpawnDiameter();
        const spawn = State.get("spawnCircle");
        if (spawn) {
          State.set("spawnCircle", { ...spawn, diameter: newDiameter });
        }
        break;
    }
  });
}

function initializeGameView(payload = {}) {
  State.set("gameActive", true);
  State.set("lines", payload.lines || []);
  State.set("players", payload.players || []);
  State.set("capZone", payload.capZone);
  State.set("spawnCircle", payload.spawnCircle);
  State.set("mapSize", payload.mapSize ?? 9);

  if (payload.lobbyPayload) {
    UI.updateLobby(payload.lobbyPayload.players || []);
  }
  if (payload.votesCount !== undefined) {
    UI.setVote(payload.votesCount, payload.totalParticipants);
  }

  // FIX: This is the core fix for the "disappearing canvas" bug.
  // The home screen must be hidden before the canvas is shown.
  UI.hide("home");
  UI.show("canvasWrap");
  UI.updatePlayers(payload.players || []);
}

document.addEventListener("DOMContentLoaded", main);
