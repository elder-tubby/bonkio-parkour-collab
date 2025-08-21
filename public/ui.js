import { normalizeAngle } from "./utils-client.js";
import State from "./state.js";

// Keep selectors for DOM querying
const SELECTORS = {
  home: "#homeScreen",
  canvasWrap: "#canvasWrapper",
  joinBtn: "#joinBtn",
  usernameInput: "#usernameInput",
  readyCheckbox: "#readyCheckbox",
  readyList: "#readyList",
  playerList: "#playerList",
  voteCheckbox: "#voteCheckbox",
  voteStatus: "#voteStatus",
  canvas: "#canvas",
  chatInput: "#chatInput",
  chatSendBtn: "#chatSendBtn",
  chatMessages: "#chatMessages",
  chatAudioBtn: "#chatAudioBtn",
  gameEndPopup: "#gameEndPopup",
  copyMapBtn: "#copyMapBtn",
  copyLineInfoBtn: "#copyLineInfoBtn",
  popupCloseBtn: "#popup-close",
  lobbyMessage: "#lobbyMessage",
  hideUsernamesCheckbox: "#hideUsernamesCheckbox",
  controlBox: ".control-box", // Selector for the main container
  autoGenerateBtn: "#autoGenerateBtn",
};

class UI {
  constructor() {
    this.elems = {};
  }

  init() {
    for (const key in SELECTORS) {
      this.elems[key] = document.querySelector(SELECTORS[key]);
    }
    if (this.elems.canvas) {
      this.elems.ctx = this.elems.canvas.getContext("2d");
    }

    this._createUnifiedObjectEditor();
    this.setObjectEditorVisible([]); // Set initial state

    // tooltip
    const tooltip = document.createElement("div");
    tooltip.id = "hoverTooltip";
    Object.assign(tooltip.style, {
      position: "fixed",
      display: "none",
      background: "rgba(0, 0, 0, 0.75)",
      color: "white",
      padding: "5px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontFamily: "monospace",
      pointerEvents: "none",
      zIndex: 1001,
      whiteSpace: "pre",
    });
    document.body.appendChild(tooltip);
    this.elems.tooltip = tooltip;
  }

  _createUnifiedObjectEditor() {
    const controlBox = this.elems.controlBox;
    if (!controlBox) return;

    controlBox.innerHTML = ""; // Clear existing content

    // --- Status Text ---
    const status = document.createElement("div");
    status.id = "status";
    controlBox.appendChild(status);
    this.elems.statusText = status;

    // --- Main Editor Container ---
    const container = document.createElement("div");
    container.className = "editor-container";

    // --- Left Column ---
    const leftCol = document.createElement("div");
    leftCol.className = "editor-col editor-col-left";

    // Row 1: Draw Mode, Paste Map
    const leftRow1 = document.createElement("div");
    leftRow1.className = "editor-row";
    const drawModeBtn = this._createButton("drawModeBtn", "Mode: Line (M)");
    const pasteBtn = this._createButton(
      "pasteMapBtn",
      "Paste Map",
      "Paste map from clipboard",
    );
    leftRow1.append(drawModeBtn, pasteBtn);

    // Row 2: Delete, Type Select
    const leftRow2 = document.createElement("div");
    leftRow2.className = "editor-row";
    leftRow2.id = "selectionActionsRow"; // Add this ID
    const deleteBtn = this._createButton(
      "deleteBtn",
      "Delete",
      "Delete selected object(s)",
      false,
    );
    const typeSelect = this._createSelect("typeSelect", "Object type", false);
    leftRow2.append(deleteBtn, typeSelect);

    // Row 3: Z-order
    const leftRow3 = document.createElement("div");
    leftRow3.className = "editor-row";
    leftRow3.id = "zOrderActionsRow"; // Add this ID
    const toFrontBtn = this._createButton(
      "toFrontBtn",
      "Front",
      "Bring to front",
      false,
    );
    const toBackBtn = this._createButton(
      "toBackBtn",
      "Back",
      "Send to back",
      false,
    );
    leftRow3.append(toFrontBtn, toBackBtn);

    leftCol.append(leftRow1, leftRow2, leftRow3);

    // --- Right Column ---
    const rightCol = document.createElement("div");
    rightCol.className = "editor-col editor-col-right";

    const mapSizeRow = this._createSlider(
      "spawnSizeSlider",
      "Map Size",
      1,
      13,
      9,
    );
    // Line sliders
    const lineWidth = this._createSlider(
      "lineWidthSlider",
      "Width",
      1,
      1000,
      100,
      "line-controls",
    );
    const lineHeight = this._createSlider(
      "lineHeightSlider",
      "Height",
      1,
      1000,
      4,
      "line-controls",
    );
    const lineAngle = this._createSlider(
      "lineAngleSlider",
      "Angle",
      0,
      180,
      0,
      "line-controls",
    );
    // Poly sliders
    const polyAngle = this._createSlider(
      "polyAngleSlider",
      "Angle",
      0,
      180,
      0,
      "poly-controls",
    );
    const polyScale = this._createSlider(
      "polyScaleSlider",
      "Scale",
      10,
      500,
      100,
      "poly-controls",
    );

    rightCol.append(
      mapSizeRow,
      lineWidth,
      lineHeight,
      lineAngle,
      polyAngle,
      polyScale,
    );

    container.append(leftCol, rightCol);
    controlBox.appendChild(container);

    // Re-query all dynamically created elements to store them in this.elems
    this._queryDynamicElements();
  }

  setObjectEditorVisible(selectedObjects) {
    const count = Array.isArray(selectedObjects) ? selectedObjects.length : 0;
    const controlBox = this.elems.controlBox;
    if (!controlBox) return;

    let mode = "none";
    let statusText = "Draw by dragging on canvas.";
    const drawingMode = State.get("drawingMode");

    if (count === 0) {
      if (drawingMode === "poly")
        statusText = "Click to start drawing a polygon.";
      if (drawingMode === "select")
        statusText = "Drag on canvas to select objects.";
    } else if (count === 1) {
      const object = selectedObjects[0];
      mode = object.type; // "line" or "poly"
      if (mode === "line") this.updateLineEditorValues(object);
      if (mode === "poly") this.updatePolygonEditorValues(object);
    } else {
      mode = "multi";
      statusText = `${count} objects selected. Use hotkeys to edit.`;
    }

    controlBox.dataset.editorMode = mode;
    this.setStatus(statusText);

    // Enable/disable buttons based on selection
    const isSelection = count > 0;

    // Hide or show the action rows based on selection
    if (this.elems.selectionActionsRow) {
      this.elems.selectionActionsRow.classList.toggle("hidden", !isSelection);
    }
    if (this.elems.zOrderActionsRow) {
      this.elems.zOrderActionsRow.classList.toggle("hidden", !isSelection);
    }
  }

  show(selectorKey) {
    this.elems[selectorKey]?.classList.remove("hidden");
  }
  hide(selectorKey) {
    this.elems[selectorKey]?.classList.add("hidden");
  }

  updateLineEditorValues(line) {
    const w = Math.round(
      line.width ??
        Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y),
    );
    const h = Math.round(line.height ?? 4);
    const a = Math.round(line.angle ?? 0);
    this._updateSlider("lineWidth", w);
    this._updateSlider("lineHeight", h);
    this._updateSlider("lineAngle", normalizeAngle(a));
    if (this.elems.typeSelect)
      this.elems.typeSelect.value = line.lineType || "none";
  }

  updatePolygonEditorValues(poly) {
    const angle = Math.round(poly.a ?? 0);
    const scale = Math.round((poly.scale ?? 1) * 100);
    this._updateSlider("polyAngle", angle);
    this._updateSlider("polyScale", scale);
    if (this.elems.typeSelect)
      this.elems.typeSelect.value = poly.polyType || "none";
  }

  updateLobby(players) {
    if (!this.elems.readyList) return;
    this.elems.readyList.innerHTML = (players || [])
      .map((p) => {
        const status = p.inGame ? "In Game" : p.ready ? "Ready" : "Not Ready";
        const statusClass = p.inGame
          ? "status-in-game"
          : p.ready
            ? "status-ready"
            : "status-not-ready";
        return `<li><span>${p.symbol} ${p.name}</span><span class="${statusClass}">${status}</span></li>`;
      })
      .join("");
  }

  updatePlayers(players) {
    if (!this.elems.playerList) return;
    this.elems.playerList.innerHTML = (players || [])
      .map((p) => `<li><span>${p.symbol} ${p.name}</span></li>`)
      .join("");
  }

  setStatus(text) {
    if (this.elems.statusText) this.elems.statusText.innerText = text;
  }
  setVote(count, total) {
    if (this.elems.voteStatus)
      this.elems.voteStatus.innerText = `${count} / ${total} voted`;
  }
  showLobbyMessage(text) {
    if (this.elems.lobbyMessage) {
      this.elems.lobbyMessage.innerText = text;
      this.elems.lobbyMessage.classList.remove("hidden");
    }
  }
  hideLobbyMessage() {
    this.elems.lobbyMessage?.classList.add("hidden");
  }

  resetControls() {
    if (this.elems.readyCheckbox) this.elems.readyCheckbox.checked = false;
    if (this.elems.voteCheckbox) this.elems.voteCheckbox.checked = false;
    if (this.elems.chatInput) this.elems.chatInput.value = "";
  }
  clearChat() {
    if (this.elems.chatMessages) this.elems.chatMessages.innerHTML = "";
  }

  // File: ui.js

  appendChat({ name, message, isError = false }) {
    if (!this.elems.chatMessages) return;
    const p = document.createElement("p");
    if (isError) p.classList.add("chat-error");

    // Safely add the sender's name
    const senderSpan = document.createElement("span");
    senderSpan.className = "chat-sender";
    senderSpan.textContent = `${name}: `;
    p.appendChild(senderSpan);

    // Regex to find URLs with a capture group
    const urlRegex = /(\b(?:https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    const parts = message.split(urlRegex);

    // Process parts: odd indices are URLs, even are plain text
    parts.forEach((part, index) => {
      if (!part) return; // Skip empty parts
      if (index % 2 === 1) { // This is a URL
        const link = document.createElement("a");
        link.href = part;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = part;
        p.appendChild(link);
      } else { // This is plain text
        p.appendChild(document.createTextNode(part));
      }
    });

    this.elems.chatMessages.appendChild(p);
    this.elems.chatMessages.scrollTop = this.elems.chatMessages.scrollHeight;
  }
  
  setEndReason(text) {
    const msg = this.elems.gameEndPopup?.querySelector("p");
    if (msg) msg.innerText = text;
  }

  toggleLobbyPasswordInput(show) {
    console.log("toggleLobbyPasswordInput called with:", show)
    const existingSection = document.getElementById("lobbyPasswordSection");

    if (show && !existingSection) {
      const section = document.createElement("div");
      section.className = "admin-login-form"; // reuse same style
      section.id = "lobbyPasswordSection";

      section.innerHTML = `
        <input type="password" id="lobbyPasswordInput" placeholder="Lobby Password" autocomplete="off" />
      `;

      this.elems.joinBtn.before(section);
    } else if (!show && existingSection) {
      existingSection.remove();
    }
  }


  // --- PRIVATE HELPER METHODS ---

  _queryDynamicElements() {
    const dynamicIds = [
      "status",
      "drawModeBtn",
      "pasteMapBtn",
      "deleteBtn",
      "typeSelect",
      "toFrontBtn",
      "toBackBtn",
      "selectionActionsRow", // Add this
      "zOrderActionsRow", // Add this
      "spawnSizeSlider",
      "spawnSizeValue",
      "lineWidthSlider",
      "lineWidthValue",
      "lineHeightSlider",
      "lineHeightValue",
      "lineAngleSlider",
      "lineAngleValue",
      "polyAngleSlider",
      "polyAngleValue",
      "polyScaleSlider",
      "polyScaleValue",
    ];
    dynamicIds.forEach((id) => {
      this.elems[id] = this.elems.controlBox.querySelector(`#${id}`);
    });
    // Alias status for consistency
    this.elems.statusText = this.elems.status;
  }

  _createButton(id, text, title = "", disabled = false) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "btn";
    btn.textContent = text;
    if (title) btn.title = title;
    if (disabled) btn.disabled = true;
    return btn;
  }

  _createSelect(id, title = "", disabled = false) {
    const select = document.createElement("select");
    select.id = id;
    select.innerHTML = `<option value="none">None</option><option value="bouncy">Bouncy</option><option value="death">Death</option>`;
    if (title) select.title = title;
    if (disabled) select.disabled = true;
    return select;
  }

  _createSlider(id, labelText, min, max, defaultVal, className = "") {
    const row = document.createElement("div");
    row.className = "slider-row";
    if (className) row.classList.add(className);

    const valueId = id.replace("Slider", "Value"); // Correctly generate the value ID

    row.innerHTML = `
        <label for="${id}">${labelText}</label>
        <input type="range" id="${id}" min="${min}" max="${max}" value="${defaultVal}">
        <span id="${valueId}" class="slider-value">${defaultVal}</span>
    `;
    return row;
  }

  _updateSlider(baseId, value) {
    const slider = this.elems[`${baseId}Slider`];
    const valueEl = this.elems[`${baseId}Value`];
    if (slider) slider.value = String(value);
    if (valueEl) valueEl.innerText = String(value);
  }
}

export default new UI();
