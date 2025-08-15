/**
 * app.js - Client-Side Orchestrator
 */
import UI from "./ui.js";
import State from "./state.js";
import Canvas from "./canvas.js";
import * as Network from "./network.js";
import { bindUIEvents } from "./handlers.js";
import { showToast, getSpawnDiameter } from "./utils-client.js";

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

  Network.onLobbyUpdate(({ players, gameActive }) => {
    State.set("players", players || []);
    UI.updateLobby(players || []);

    // FIX 13: Enable ready checkbox only after the user has successfully joined the lobby.
    const me = (players || []).find((p) => p.id === State.get("socketId"));
    if (UI.elems.readyCheckbox) {
      UI.elems.readyCheckbox.disabled = !me;
    }

    // Derive whether a game is active:
    // Prefer explicit server flag, but if missing rely on per-player inGame flags.
    const anyInGame = players.some((p) => !!p.inGame);
    const isGameActive =
      typeof gameActive === "boolean" ? gameActive : anyInGame;

    // Persist gameActive in client state so other code can rely on it
    State.set("gameActive", !!isGameActive);

    // FIX 14b: Update game status display for users who haven't joined yet.
    if (gameActive) {
      // UI.setStatus("Draw by dragging on canvas");
      UI.showLobbyMessage("Game in progress. Set 'Ready' to join.");
    } else {
      const readyCount = (players || []).filter((p) => p.ready).length;
    }
  });

  Network.onGameInProgress(() =>
    UI.showLobbyMessage("Game in progress. Set 'Ready' to join."),
  );

  // Game Flow
  // We still listen for start/snapshot, but the initializer verifies whether this client
  // is actually a participant before switching to the canvas view.
  Network.onStartGame(initializeGameView);
  Network.onGameSnapshot(initializeGameView);

  Network.onGameUpdate(({ players, votes, totalParticipants }) => {
    UI.updatePlayers(players || []);
    UI.setVote(votes ?? 0, totalParticipants ?? 0);
  });

  Network.onEndGame(({ reason }) => {
    State.set("gameActive", false);
    if (UI.elems && UI.elems.readyCheckbox) {
      UI.elems.readyCheckbox.checked = false;
    }
    UI.hide("canvasWrap");
    UI.show("home");
    UI.setEndReason(
      reason === "voted" ? "All players voted to end." : "A player left.",
    );
    UI.show("gameEndPopup");
    UI.showLobbyMessage("Drawing will start when 2 players are ready.");
  });

  // Authoritative State Changes
  Network.onLineCreated((newLine) => {
    State.set("lines", [...State.get("lines"), newLine]);
    // Auto-select the newly-created line FOR THE CREATOR ONLY
    if (newLine.playerId === State.get("socketId")) {
      State.set("selectedLineId", newLine.id);
    }
  });

  Network.onLineUpdated((updatedLine) => {
    const lines = State.get("lines").map((l) =>
      l.id === updatedLine.id ? updatedLine : l,
    );
    State.set("lines", lines);
    if (State.get("selectedLineId") === updatedLine.id) {
      UI.updateLineEditorValues(updatedLine);
    }
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
  Network.onChatError((errorMsg) => showToast(errorMsg));
  Network.onClearChat(() => UI.clearChat());
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

        const newDiameter = getSpawnDiameter(value);
        const spawn = State.get("spawnCircle");
        if (spawn) {
          State.set("spawnCircle", { ...spawn, diameter: newDiameter });
        }
        break;
    }
  });
}

/**
 * initializeGameView
 * - Only actually switches to game canvas if this client is included in payload.players.
 * - If payload.players exists and the current client is NOT listed, show the lobby
 *   (with "Game in progress" status) so the late user can join via Ready.
 */
function initializeGameView(payload = {}) {
  // If `players` is present (start payload includes the list), check if this client is included.
  const playersList = Array.isArray(payload.players) ? payload.players : null;
  const myId = State.get("socketId");

  if (playersList) {
    const amParticipant = playersList.some((p) => p.id === myId);
    if (!amParticipant) {
      // Late joiner or someone not in the active participant list:
      // update lobby display and set status, but DO NOT switch to canvas.
      if (payload.lobbyPayload) {
        State.set("players", payload.lobbyPayload.players || []);
        UI.updateLobby(payload.lobbyPayload.players || []);
      } else {
        State.set("players", playersList || []);
        UI.updateLobby(playersList || []);
      }

      // Mark game active so UI shows correct status, but keep user in lobby/home.
      State.set("gameActive", true);
      UI.setStatus("Draw by dragging on canvas.");
      UI.hide("canvasWrap");
      UI.show("home");

      // If server sent votesCount / totalParticipants for display, show them.
      if (payload.votesCount !== undefined) {
        UI.setVote(payload.votesCount, payload.totalParticipants || 0);
      }
      return; // bail — do not initialize game view for non-participants
    }
  }

  // If we reach here, either players list wasn't provided (fallback) or this client is a participant.
  UI.clearChat(); // FIX 8: Clear chat history when a new game starts or when joining one.

  // ===== FIX: Reset hide-names & vote UI state at game start =====
  // Ensure names are visible by default and any vote checkbox is unchecked.
  State.set("hideUsernames", false);
  if (UI.elems) {
    if (UI.elems.hideUsernamesCheckbox)
      UI.elems.hideUsernamesCheckbox.checked = false;
    if (UI.elems.voteCheckbox) UI.elems.voteCheckbox.checked = false;
  }
  // Reset displayed vote counts to zero (server may override below if it sent values).
  UI.setVote(
    0,
    payload.totalParticipants ?? (payload.players || []).length ?? 0,
  );
  //

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

  UI.hide("home");
  UI.show("canvasWrap");
  UI.updatePlayers(payload.players || []);
}

document.addEventListener("DOMContentLoaded", main);
