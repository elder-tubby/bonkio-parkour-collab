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
  Network.onConnectWithId((id) => State.set("socketId", id));

  Network.onLobbyUpdate(({ players, gameActive }) => {
    State.set("players", players || []);
    UI.updateLobby(players || []);
    const me = (players || []).find((p) => p.id === State.get("socketId"));
    if (UI.elems.readyCheckbox) UI.elems.readyCheckbox.disabled = !me;
    State.set("gameActive", !!gameActive);
  });

  Network.onGameInProgress(() =>
    UI.showLobbyMessage("Game in progress. Set 'Ready' to join."),
  );
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
      reason === "voted" ? "All players voted to end." : "All players left.",
    );
    UI.show("gameEndPopup");
    UI.showLobbyMessage("Drawing will start when 2 players are ready.");
  });
  Network.onObjectCreated((newObject) => {
    State.set("objects", [...State.get("objects"), newObject]);
    if (newObject.playerId === State.get("socketId")) {
      State.set("selectedObjectIds", [newObject.id]);
    }
  });

  Network.onObjectsCreatedBatch((newObjects) => {
    if (Array.isArray(newObjects) && newObjects.length > 0) {
      State.set("objects", [...State.get("objects"), ...newObjects]);
      State.set(
        "selectedObjectIds",
        newObjects.map((o) => o.id),
      );
    }
  });

  Network.onObjectUpdated((updatedObject) => {
    const objects = State.get("objects").map((o) =>
      o.id === updatedObject.id ? updatedObject : o,
    );
    State.set("objects", objects);
    // Only update editor if this is the *only* selected object
    const selectedIds = State.get("selectedObjectIds");
    if (selectedIds.length === 1 && selectedIds[0] === updatedObject.id) {
      if (updatedObject.type === "line")
        UI.updateLineEditorValues(updatedObject);
      if (updatedObject.type === "poly")
        UI.updatePolygonEditorValues(updatedObject);
    }
  });

  Network.onObjectDeleted(({ id }) => {
    State.set(
      "objects",
      State.get("objects").filter((o) => o.id !== id),
    );
    State.removeSelectedObjectId(id);
  });

  Network.onObjectsReordered((reorderedObjects) =>
    State.set("objects", reorderedObjects || []),
  );

  Network.onSpawnCircleUpdate((spawnCircle) =>
    State.set("spawnCircle", spawnCircle),
  );
  Network.onCapZoneUpdate((capZone) => State.set("capZone", capZone));
  Network.onMapSizeUpdate((mapSize) => {
    State.set("mapSize", mapSize);
    if (UI.elems.spawnSizeSlider) UI.elems.spawnSizeSlider.value = mapSize;
    if (UI.elems.spawnSizeValue) UI.elems.spawnSizeValue.innerText = mapSize;
  });
  Network.onChatMessage((msg) => UI.appendChat(msg));
  Network.onChatError((errorMsg) => showToast(errorMsg, true));
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

  State.onChange((key) => {
    const visualKeys = [
      "objects",
      "drawingShape",
      "draggingPreview",
      "capZone",
      "spawnCircle",
      "selectedObjectIds",
      "hideUsernames",
      "selectionBox",
    ];
    if (visualKeys.includes(key)) scheduleDraw();

    switch (key) {
      case "selectedObjectIds":
        const selectedIds = State.get(key);
        const selectedObjects = State.get("objects").filter((o) =>
          selectedIds.includes(o.id),
        );
        UI.setObjectEditorVisible(selectedObjects);
        break;
      case "mapSize":
        const spawn = State.get("spawnCircle");
        if (spawn)
          State.set("spawnCircle", {
            ...spawn,
            diameter: getSpawnDiameter(State.get(key)),
          });
        break;
    }
  });
}

function initializeGameView(payload = {}) {
  const myId = State.get("socketId");
  const isParticipant = (payload.players || []).some((p) => p.id === myId);

  if (Array.isArray(payload.players) && !isParticipant) {
    return;
  }

  UI.clearChat();
  State.set("hideUsernames", false);
  if (UI.elems.hideUsernamesCheckbox)
    UI.elems.hideUsernamesCheckbox.checked = false;
  if (UI.elems.voteCheckbox) UI.elems.voteCheckbox.checked = false;

  State.set("gameActive", true);
  State.set("objects", payload.objects || []);
  State.set("players", payload.players || []);
  State.set("capZone", payload.capZone);
  State.set("spawnCircle", payload.spawnCircle);
  State.set("mapSize", payload.mapSize ?? 9);

  UI.hide("home");
  UI.show("canvasWrap");
  UI.updatePlayers(payload.players || []);
}

document.addEventListener("DOMContentLoaded", main);
