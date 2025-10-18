/**
 * gameManager.js - Authoritative Server-Side Game State Manager
 */
const { v4: uuidv4 } = require("uuid");
const { EVENTS } = require("./config");
const { getSpawnDiameter, generateNewColorScheme } = require("./utils");

class GameManager {
  constructor(io, lobby) {
    this.io = io;
    this.lobby = lobby;
    this.reset();
  }
  reset() {
    this.active = false;
    this.objects = [];
    this.participants = [];
    this.votes = {};
    this.capZone = { x: 385, y: 400, width: 30, height: 18.5 };
    this.mapSize = 9;
    this.spawnCircle = {
      x: 400,
      y: 300,
      diameter: getSpawnDiameter(this.mapSize),
    };
    this.colors = {
      background: "rgb(0, 0, 0)",
      none: "rgb(255, 255, 255)",
      bouncy: "rgb(167, 196, 190)",
      death: "rgb(255, 0, 0)",
    };
    this._lastEventTs = new Map();
  }

  start() {
    this.active = true;
    this.objects = [];
    this.participants = Object.keys(this.lobby.players).filter(
      (id) => this.lobby.players[id]?.ready,
    );
    if (this.participants.length < 2) {
      this.active = false;
      return;
    }
    this.participants.forEach((id) => {
      if (this.lobby.players[id]) this.lobby.players[id].inGame = true;
      this.io.to(id).emit(EVENTS.CLEAR_CHAT);
    });
    const payload = this.getStartPayload();
    this.participants.forEach((id) =>
      this.io.to(id).emit(EVENTS.START_GAME, payload),
    );
    this.broadcastGameState();
    this.lobby.broadcastLobby();
  }

  endGame(reason = "unknown") {
    this.io.emit(EVENTS.END_GAME, { reason });
    Object.values(this.lobby.players).forEach((p) => {
      if (p) p.inGame = false;
    });
    this.lobby.resetReady();
    this.reset();
    this.lobby.broadcastLobby();
  }

  addParticipant(playerId) {
    if (
      !this.active ||
      this.participants.includes(playerId) ||
      !this.lobby.players[playerId]
    )
      return;

    this.participants.push(playerId);
    this.votes[playerId] = false;
    if (this.lobby.players[playerId])
      this.lobby.players[playerId].inGame = true;

    this.io
      .to(playerId)
      .emit(EVENTS.GAME_SNAPSHOT, this.getSnapshotFor(playerId));

    this.broadcastGameState();
    this.lobby.broadcastLobby();
  }

  handleDisconnect(playerId) {
    const wasParticipant = this.participants.includes(playerId);
    if (!this.active || !wasParticipant) return;

    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.votes[playerId];

    if (this.participants.length < 2 && this.active) {
      this.endGame("player_left");
    } else {
      this.broadcastGameState();
    }
  }

  voteFinish(playerId, vote) {
    if (!this.active || !this.participants.includes(playerId)) return;
    this.votes[playerId] = !!vote;

    const total = this.participants.length;
    const yesVotes = Object.values(this.votes).filter(Boolean).length;

    if (total > 0 && yesVotes === total) {
      this.endGame("voted");
    } else {
      this.broadcastGameState();
    }
  }

  broadcastGameState() {
    if (!this.active) return;
    const players = this.getGamePlayers();
    const votesCount = Object.values(this.votes).filter(Boolean).length;

    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.GAME_UPDATE, {
        players,
        votes: votesCount,
        totalParticipants: this.participants.length,
      });
    });
  }

  getGamePlayers() {
    return this.participants
      .map((id) => this.lobby.players[id])
      .filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, symbol: p.symbol }));
  }
  getStartPayload() {
    return {
      objects: this.objects,
      players: this.getGamePlayers(),
      capZone: this.capZone,
      spawnCircle: this.spawnCircle,
      mapSize: this.mapSize,
      colors: this.colors,
    };
  }
  getSnapshotFor(playerId) {
    return {
      ...this.getStartPayload(),
      votesCount: Object.values(this.votes).filter(Boolean).length,
      totalParticipants: this.participants.length,
      lobbyPayload: this.lobby.getLobbyPayload(),
    };
  }

  // --- Authoritative Action Handlers ---

  handleObjectCreation(playerId, objectData) {
    if (!this._canPlayerAct(playerId) || !this._allow(playerId, "create", 200))
      return;
    // Client must specify the type of object to create
    if (!objectData || !objectData.type) return;

    const player = this.lobby.players[playerId];
    let newObject = null;

    if (objectData.type === "line") {
      if (
        !this._validPoint(objectData.start) ||
        !this._validPoint(objectData.end)
      )
        return;
      const dx = objectData.end.x - objectData.start.x;
      const dy = objectData.end.y - objectData.start.y;
      if (dx * dx + dy * dy < 25) return; // Ignore tiny lines

      newObject = {
        type: "line",
        id: uuidv4(),
        playerId,
        username: player.name,
        symbol: player.symbol,
        start: objectData.start,
        end: objectData.end,
        lineType: "none",
        height: 4,
        createdAt: Date.now(),
      };
    } else if (objectData.type === "circle") {
      if (
        !this._validPoint(objectData.c) ||
        !(typeof objectData.radius === "number" && objectData.radius > 0)
      )
        return;

      newObject = {
        type: "circle",
        id: uuidv4(),
        playerId,
        username: player.name,
        symbol: player.symbol,
        c: objectData.c,
        radius: Math.max(1, Math.min(1000, objectData.radius)),
        circleType: "none",
        createdAt: Date.now(),
      };
    }

    if (newObject) {
      this.objects.push(newObject);
      this.participants.forEach((id) => {
        this.io.to(id).emit(EVENTS.OBJECT_CREATED, newObject);
      });
    }
  }
  // In gameManager.js, modify the handleObjectsCreationBatch method:
  handleObjectsCreationBatch(playerId, batchData) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._allow(playerId, "createBatch", 500)
    )
      return;
    if (!batchData || !Array.isArray(batchData.objects)) return;
    const isAutoGeneration = batchData.isAutoGeneration === true;
    const player = this.lobby.players[playerId];
    const newObjects = [];

    for (const polyData of batchData.objects) {
      if (
        polyData &&
        Array.isArray(polyData.v) &&
        polyData.v.length >= 3 &&
        this._validPoint(polyData.c)
      ) {
        newObjects.push({
          type: "poly",
          id: uuidv4(),
          playerId: isAutoGeneration ? " " : playerId,
          username: player.name,
          symbol: isAutoGeneration ? " " : player.symbol,
          v: polyData.v,
          c: polyData.c,
          // --- FIX: Use passed-in values or provide defaults ---
          a: polyData.a || 0,
          scale: polyData.scale || 1,
          polyType: polyData.polyType || "none",
          createdAt: Date.now(),
        });
      }
    }

    if (newObjects.length > 0) {
      this.objects.push(...newObjects);
      this.participants.forEach((id) => {
        this.io.to(id).emit(EVENTS.OBJECTS_CREATED_BATCH, newObjects);
      });
    }
  }

  handleObjectDeletion(playerId, objectId) {
    if (!this._canModifyObject(playerId, objectId)) return;
    this.objects = this.objects.filter((o) => o.id !== objectId);
    this.participants.forEach((id) =>
      this.io.to(id).emit(EVENTS.OBJECT_DELETED, { id: objectId }),
    );
  }

  handleObjectUpdate(playerId, payload) {
    if (
      !payload?.id ||
      !this._canModifyObject(playerId, payload.id) ||
      !this._allow(playerId, `update:${payload.id}`, 50)
    )
      return;

    const objIndex = this.objects.findIndex((o) => o.id === payload.id);
    if (objIndex === -1) return;

    const object = this.objects[objIndex];
    if (object.type === "line") {
      this._updateLine(object, payload);
    } else if (object.type === "poly") {
      this._updatePolygon(object, payload);
    } else if (object.type === "circle") {
      this._updateCircle(object, payload);
    }
  }

  _updateLine(currentLine, payload) {
    let updatedLine = { ...currentLine };

    const isMoving =
      (payload.nudge && (payload.nudge.x || payload.nudge.y)) ||
      (this._validPoint(payload.start) && this._validPoint(payload.end));
    const isResizing =
      typeof payload.width === "number" ||
      typeof payload.height === "number" ||
      typeof payload.angle === "number" ||
      payload.widthDelta ||
      payload.heightDelta ||
      payload.angleDelta;

    if (payload.nudge && (payload.nudge.x || payload.nudge.y)) {
      const dx = (payload.nudge.x || 0) * 2;
      const dy = (payload.nudge.y || 0) * 2;
      updatedLine.start = {
        x: updatedLine.start.x + dx,
        y: updatedLine.start.y + dy,
      };
      updatedLine.end = {
        x: updatedLine.end.x + dx,
        y: updatedLine.end.y + dy,
      };
    }
    if (this._validPoint(payload.start) && this._validPoint(payload.end)) {
      updatedLine.start = payload.start;
      updatedLine.end = payload.end;
    }
    if (payload.widthDelta)
      updatedLine.width = (updatedLine.width || 0) + payload.widthDelta;
    if (payload.heightDelta)
      updatedLine.height = (updatedLine.height || 0) + payload.heightDelta;
    if (payload.angleDelta)
      updatedLine.angle = (updatedLine.angle || 0) + payload.angleDelta;
    if (typeof payload.width === "number") updatedLine.width = payload.width;
    if (typeof payload.height === "number") updatedLine.height = payload.height;
    if (typeof payload.angle === "number") updatedLine.angle = payload.angle;
    if (typeof payload.lineType === "string")
      updatedLine.lineType = payload.lineType;

    updatedLine.width = Math.max(1, Math.min(10000, updatedLine.width || 0));
    updatedLine.height = Math.max(1, Math.min(1000, updatedLine.height || 0));
    updatedLine.angle = (((updatedLine.angle || 0) % 360) + 360) % 360;

    if (isMoving && !isResizing) {
      const dx = updatedLine.end.x - updatedLine.start.x;
      const dy = updatedLine.end.y - updatedLine.start.y;
      updatedLine.width = Math.hypot(dx, dy);
      updatedLine.angle = this._computeAngle(
        updatedLine.start,
        updatedLine.end,
      );
    } else if (isResizing) {
      const center = {
        x: (currentLine.start.x + currentLine.end.x) / 2,
        y: (currentLine.start.y + currentLine.end.y) / 2,
      };
      const w = updatedLine.width;
      const aRad = (updatedLine.angle * Math.PI) / 180;
      const halfX = Math.cos(aRad) * (w / 2);
      const halfY = Math.sin(aRad) * (w / 2);
      updatedLine.start = { x: center.x - halfX, y: center.y - halfY };
      updatedLine.end = { x: center.x + halfX, y: center.y + halfY };
    }

    const objIndex = this.objects.findIndex((o) => o.id === updatedLine.id);
    if (objIndex !== -1) this.objects[objIndex] = updatedLine;
    this.participants.forEach((id) =>
      this.io.to(id).emit(EVENTS.OBJECT_UPDATED, updatedLine),
    );
  }

  // Replace your existing _updatePolygon with the snippet below

  _updatePolygon(currentPoly, payload) {
    let updatedPoly = { ...currentPoly };

    // Nudges / center / angle / type / scale handling (preserve existing behavior)
    if (payload.nudge) {
      updatedPoly.c = {
        x: updatedPoly.c.x + (payload.nudge.x || 0) * 2,
        y: updatedPoly.c.y + (payload.nudge.y || 0) * 2,
      };
    }
    if (this._validPoint(payload.c)) updatedPoly.c = payload.c;
    if (payload.angleDelta)
      updatedPoly.a = (updatedPoly.a || 0) + payload.angleDelta;
    if (typeof payload.a === "number") updatedPoly.a = payload.a;
    if (typeof payload.polyType === "string")
      updatedPoly.polyType = payload.polyType;
    updatedPoly.a = (((updatedPoly.a || 0) % 360) + 360) % 360;

    if (payload.scaleDelta) {
      const currentScale =
        typeof updatedPoly.scale === "number" ? updatedPoly.scale : 1;
      updatedPoly.scale = currentScale + payload.scaleDelta;
    }
    if (typeof payload.scale === "number") updatedPoly.scale = payload.scale;
    updatedPoly.scale = Math.max(0.1, Math.min(10, updatedPoly.scale || 1));

    // ---- NEW: accept and validate incoming vertex array payload.v ----
    // Expect payload.v to be an array of {x,y} local vertices (same shape your clients send).
    if (Array.isArray(payload.v)) {
      // sanitize & validate each vertex
      const cleanedVerts = payload.v
        .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
        .filter((p) => this._validPoint(p));

      // If too few verts -> treat as invalid and delete the polygon to avoid corrupt state
      if (cleanedVerts.length < 3) {
        // remove locally and notify participants
        this.objects = this.objects.filter((o) => o.id !== updatedPoly.id);
        this.participants.forEach((id) =>
          this.io.to(id).emit(EVENTS.OBJECT_DELETED, { id: updatedPoly.id }),
        );
        return;
      }

      // Accept the cleaned vertices
      updatedPoly.v = cleanedVerts;
    }

    // Persist updated polygon in server state and broadcast
    const objIndex = this.objects.findIndex((o) => o.id === updatedPoly.id);
    if (objIndex !== -1) this.objects[objIndex] = updatedPoly;

    this.participants.forEach((id) =>
      this.io.to(id).emit(EVENTS.OBJECT_UPDATED, updatedPoly),
    );
  }

  _updateCircle(currentCircle, payload) {
    let updatedCircle = { ...currentCircle };

    if (payload.nudge) {
      updatedCircle.c = {
        x: updatedCircle.c.x + (payload.nudge.x || 0) * 2,
        y: updatedCircle.c.y + (payload.nudge.y || 0) * 2,
      };
    }
    if (this._validPoint(payload.c)) updatedCircle.c = payload.c;
    if (payload.radiusDelta)
      updatedCircle.radius = (updatedCircle.radius || 0) + payload.radiusDelta;
    if (typeof payload.radius === "number")
      updatedCircle.radius = payload.radius;
    if (typeof payload.circleType === "string")
      updatedCircle.circleType = payload.circleType;

    updatedCircle.radius = Math.max(
      1,
      Math.min(1000, updatedCircle.radius || 0),
    );

    const objIndex = this.objects.findIndex((o) => o.id === updatedCircle.id);
    if (objIndex !== -1) this.objects[objIndex] = updatedCircle;

    this.participants.forEach((id) =>
      this.io.to(id).emit(EVENTS.OBJECT_UPDATED, updatedCircle),
    );
  }

  handleObjectsReorder(playerId, { ids, toBack }) {
    if (!this._canPlayerAct(playerId) || !this._allow(playerId, "reorder", 250))
      return;
    if (!Array.isArray(ids) || ids.length === 0) return;

    // Remove selected objects from current list
    const moving = [];
    this.objects = this.objects.filter((o) => {
      if (ids.includes(o.id)) {
        moving.push(o);
        return false;
      }
      return true;
    });

    // Preserve relative order according to ids array
    const orderedMoving = ids
      .map((id) => moving.find((o) => o.id === id))
      .filter(Boolean);

    if (toBack) {
      this.objects = [...orderedMoving, ...this.objects];
    } else {
      this.objects = [...this.objects, ...orderedMoving];
    }

    // Broadcast the new full order to all clients
    this.participants.forEach((pid) => {
      this.io.to(pid).emit(EVENTS.OBJECTS_REORDERED, this.objects);
    });
  }

  setSpawnCircle(playerId, { x, y }) {
    if (
      !this._canPlayerAct(playerId) ||
      !this._validCoord(x) ||
      !this._validCoord(y)
    )
      return;
    this.spawnCircle = { ...this.spawnCircle, x, y };
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.SPAWN_CIRCLE_UPDATED, this.spawnCircle);
    });
  }

  setCapZone(playerId, { x, y, width, height }) {
    if (!this._canPlayerAct(playerId)) return;
    if (this._validCoord(x) && this._validCoord(y)) {
      this.capZone = { ...this.capZone, x, y };
    }
    if (this._validCoord(width) && this._validCoord(height)) {
      this.capZone = { ...this.capZone, width, height };
    }
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.CAP_ZONE_UPDATED, this.capZone);
    });
  }

  setMapSize(playerId, size) {
    if (!this._canPlayerAct(playerId)) return;
    const clampedSize = Math.max(1, Math.min(13, Math.trunc(size)));
    this.mapSize = clampedSize;
    this.spawnCircle.diameter = getSpawnDiameter(this.mapSize);
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.MAP_SIZE_UPDATED, clampedSize);
      // Also update spawn circle since its diameter changed
      this.io.to(id).emit(EVENTS.SPAWN_CIRCLE_UPDATED, this.spawnCircle);
    });
  }

  // in gameManager.js

  handlePasteLines(playerId, pasteData) {
    if (!this._canPlayerAct(playerId) || !this._allow(playerId, "paste", 3000))
      return;

    if (!pasteData || !Array.isArray(pasteData.objects)) return;

    const player = this.lobby.players[playerId];
    const newObjects = [];
    for (const objData of pasteData.objects) {
      if (!objData) continue;

      const base = {
        id: uuidv4(),
        playerId: "", // Pasted objects are unowned until edited
        username: player.name,
        symbol: " ", // Pasted objects have a blank symbol
        createdAt: Date.now(),
      };

      if (
        objData.type === "line" &&
        this._validPoint(objData.start) &&
        this._validPoint(objData.end)
      ) {
        const dx = objData.end.x - objData.start.x;
        const dy = objData.end.y - objData.start.y;
        newObjects.push({
          ...base,
          type: "line",
          start: objData.start,
          end: objData.end,
          lineType: objData.lineType || "none",
          width: Math.hypot(dx, dy),
          height: objData.height || 4,
          angle: this._computeAngle(objData.start, objData.end),
        });
      } else if (
        objData.type === "poly" &&
        this._validPoint(objData.c) &&
        Array.isArray(objData.v)
      ) {
        newObjects.push({
          ...base,
          type: "poly",
          c: objData.c,
          v: objData.v,
          a: objData.a || 0,
          scale: objData.scale || 1,
          polyType: objData.polyType || "none",
        });
      } else if (
        objData.type === "circle" &&
        this._validPoint(objData.c) &&
        typeof objData.radius === "number"
      ) {
        const circleType = objData.circleType || "none";
        newObjects.push({
          ...base,
          type: "circle",
          c: objData.c, // CHANGED: Use the 'c' object directly
          radius: objData.radius,
          circleType: circleType,
        });
      }
    }

    if (newObjects.length > 0) {
      this.objects = newObjects;

      let colorsUpdated = false;
      if (pasteData.colors && typeof pasteData.colors === "object") {
        const { background, none, bouncy, death } = pasteData.colors;
        if (background && none && bouncy && death) {
          this.colors = pasteData.colors;
          colorsUpdated = true;
        }
      }

      if (pasteData.mapSize) this.setMapSize(playerId, pasteData.mapSize);
      if (pasteData.spawn && this._validPoint(pasteData.spawn))
        this.setSpawnCircle(playerId, pasteData.spawn);
      if (pasteData.capZone) this.setCapZone(playerId, pasteData.capZone);

      this.participants.forEach((id) => {
        this.io.to(id).emit(EVENTS.OBJECTS_REORDERED, this.objects);
        if (colorsUpdated) {
          this.io.to(id).emit(EVENTS.COLORS_UPDATED, this.colors);
        }
      });
    }
  }
  handleChangeColors(playerId) {
    console.log("Handling color change request from player:", playerId);
    if (!this._canPlayerAct(playerId)) return;
    console.log("Player can act, checking allow");
    if (!this._allow(playerId, "changeColor", 1000)) return;

    console.log("Changing colors. Old colors: ", this.colors);
    this.colors = generateNewColorScheme(this.colors);
    console.log("New colors: ", this.colors);
    this.participants.forEach((id) => {
      this.io.to(id).emit(EVENTS.COLORS_UPDATED, this.colors);
    });
  }

  // --- Helpers & Validation ---
  _allow(playerId, actionKey, minMs = 50) {
    const key = `${playerId}:${actionKey}`;
    const now = Date.now();
    const last = this._lastEventTs.get(key) || 0;
    if (now - last < minMs) return false;
    this._lastEventTs.set(key, now);
    return true;
  }

  _canPlayerAct(playerId) {
    return this.active && this.participants.includes(playerId);
  }

  _canModifyObject(playerId, objectId) {
    if (!this._canPlayerAct(playerId)) return false;
    const object = this.objects.find((o) => o.id === objectId);
    if (!object) return false;
    // Pasted maps are owned by no one initially, so anyone can edit.
    if (object.symbol === " ") return true;
    const ownerIsPresent = this.participants.includes(object.playerId);
    return object.playerId === playerId || !ownerIsPresent;
  }

  _validCoord(c) {
    return typeof c === "number" && isFinite(c);
  }
  _validPoint(pt) {
    return pt && this._validCoord(pt.x) && this._validCoord(pt.y);
  }
  _computeAngle(start, end) {
    const angle =
      Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
    return ((angle % 360) + 360) % 360;
  }
}

module.exports = { GameManager };
