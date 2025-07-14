// app.js
// Orchestrator tying everything together
import UI from "./ui.js";
import State from "./state.js";
import Canvas from "./canvas.js";
import * as Network from "./network.js";
import { bindUIEvents } from "./handlers.js";
import { updateLineTypeUI } from "./utils-client.js";


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
    State.set("capZone", capZone);
    State.set("lines", []);
    UI.hide("lobbyMessage");
    UI.hide("home");
    UI.show("canvasWrap");
    UI.updatePlayers(players);
    UI.setStatus("Draw by dragging on canvas");
    Canvas.draw();
  });
  Network.onGameUpdate(({ players, votes }) => {
    UI.updatePlayers(players);
    UI.setVote(votes, players.length);
  });
  Network.onPlayerLine(({ id, playerId, line, username }) => {
    const { start, end } = line; // ← extract start/end here
    const lines = State.get("lines");

    State.set("lines", [
      ...lines,
      {
        id,
        playerId,
        start: line.start,
        end: line.end,
        username,
        type: "none",
      },
    ]);

    Canvas.draw();
  });

  Network.onChatMessage((msg) => UI.appendChat(msg));
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
    // remove from state
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
    const updated = State.get('lines').map(l =>
      l.id === id ? { ...l, type } : l
    );
    State.set('lines', updated);
    
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
