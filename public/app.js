/**
 * app.js - Client-Side Orchestrator
 *
 * This file ties all client-side modules together. It is responsible for:
 * 1. Initializing the application state and UI.
 * 2. Setting up listeners for authoritative events from the server via the Network module.
 * 3. Updating the central `State` based on server events, which in turn drives UI changes.
 * 4. Binding user input handlers.
 */


import UI from "./ui.js";
import State from "./state.js";
import Canvas from "./canvas.js";
import * as Network from "./network.js";
import { bindUIEvents } from "./handlers.js";

function main() {
  console.log("Initializing application...");

  // Initialize UI element cache and bind user event handlers
  UI.init();
  bindUIEvents();

  // Set up all network event listeners and state change watchers
  bindNetworkEvents();
  watchStateChanges();

  // Initial draw
  Canvas.draw();
  console.log("Application initialized.");
}

/**
 * Binds handlers to all incoming network events from the server.
 * This is the primary mechanism for receiving authoritative state.
 */
function bindNetworkEvents() {
  // Connection & Lobby
  Network.onConnect((id) => State.set("socketId", id));
  Network.onLobbyFull(() => alert("Sorry, the lobby is full."));
  Network.onLobbyNameTaken(() =>
    alert("That username is taken. Please choose another."),
  );
  Network.onGameInProgress(() =>
    UI.showLobbyMessage("Game in progress. Set 'Ready' to join."),
  );

  // Game Flow
  Network.onLobbyUpdate(({ players }) => {
    // Correctly destructure the payload
    State.set("players", players || []);
    UI.updateLobby(players || []);
  });
  Network.onStartGame(initializeGameView);
  Network.onGameSnapshot(initializeGameView); // Snapshots use the same init logic
  Network.onEndGame(({ reason }) => {
    State.set("gameActive", false);

    const reasonText =
      reason === "voted"
        ? "All players voted to end the game."
        : reason === "player_left"
          ? "The game ended because only one player was left."
          : "The game has ended.";

    UI.setEndReason(reasonText);
    UI.show("gameEndPopup");
    UI.hide("canvasWrap");
    UI.show("home");
  });
  // Network.onGameUpdate(({ players, votes, totalParticipants }) => {
  //     UI.updatePlayers(players || []);
  //     UI.setVote(votes ?? 0, totalParticipants ?? 0);
  // });

  // Authoritative State Changes
  Network.onLineCreated((newLine) => {
    const lines = State.get("lines") || [];
    if (!lines.find((l) => l.id === newLine.id)) {
      State.set("lines", [...lines, newLine]);
    }
  });

  Network.onLineUpdated((updatedLine) => {
    const lines = (State.get("lines") || []).map((l) =>
      l.id === updatedLine.id ? updatedLine : l,
    );
    State.set("lines", lines);
  });

  Network.onLineDeleted(({ id }) => {
    const lines = (State.get("lines") || []).filter((l) => l.id !== id);
    State.set("lines", lines);
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
  Network.onChatError((err) =>
    UI.appendChat({ name: "System", message: err.reason, isError: true }),
  );
  Network.onClearChat(() => UI.clearChat());
}

/**
 * Sets up listeners for changes to the global `State` object.
 * This allows the UI to react to any state change, regardless of its origin.
 */
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
    // Schedule a redraw for any visual state change
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

    // Handle specific UI updates based on state changes
    switch (key) {
      case "selectedLineId":
        if (value) {
          const line = (State.get("lines") || []).find((l) => l.id === value);
          UI.showLineEditor(line); // Use the comprehensive UI method
        } else {
          UI.hideLineEditor();
        }
        break;

      case "mapSize":
        if (UI.elems.spawnSizeSlider)
          UI.elems.spawnSizeSlider.value = String(value);
        if (UI.elems.spawnSizeValue)
          UI.elems.spawnSizeValue.innerText = String(value);
        break;
    }
  });
}

/**
 * Initializes the game view with data from the server.
 * Used for both starting a new game and for late-joiners receiving a snapshot.
 */
function initializeGameView(payload = {}) {
  State.set("gameActive", true);
  State.set("lines", payload.lines || []);
  State.set("players", payload.players || []);
  State.set("capZone", payload.capZone);
  State.set("spawnCircle", payload.spawnCircle);
  State.set("mapSize", payload.mapSize ?? 9);

  // If this is a snapshot for a late-joiner, it may contain extra info
  if (payload.lobbyPayload) {
    UI.updateLobby(payload.lobbyPayload.players || []);
  }
  if (
    payload.votesCount !== undefined &&
    payload.totalParticipants !== undefined
  ) {
    UI.setVote(payload.votesCount, payload.totalParticipants);
  }

  // Manually transition the UI from lobby to game view
  UI.hide("home");
  UI.show("canvasWrap");
  UI.updatePlayers(payload.players || []);
}

// Run the application once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", main);
