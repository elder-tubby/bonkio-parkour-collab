import { normalizeAngle, getLineProps } from "./utils-client.js"; // <-- MODIFIED
import State from "./state.js";
import { AUTO_GEN_LIMITS } from "./config-client.js";

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
  changeColorsBtn: "#changeColorsBtn",
  autoGenerateBtn: "#autoGenerateBtn",
  autoGeneratePopup: "#autoGeneratePopup",
  agpCloseBtn: "#agpCloseBtn",
  agpForm: "#agpForm",
  agpThickness: "#agpThickness",
  agpDrawBtn: "#agpDrawBtn",
  agpAiSimBtn: "#agpAiSimBtn",
  drawingThicknessSlider: "#drawingThicknessSlider",
  drawingThicknessVal: "#drawingThicknessVal",
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

    // --- Dynamic Popup Creation ---
    const moreOptionsPopup = document.createElement("div");
    moreOptionsPopup.id = "moreOptionsPopup";
    moreOptionsPopup.className = "popup-overlay hidden";

    // Width updated to 620px, added max-height and overflow-y to prevent escaping screen
    moreOptionsPopup.innerHTML = `
        <div class="popup-box" style="width: 620px; max-width: 90vw; max-height: 85vh; overflow-y: auto;">
            <button class="popup-close" id="moCloseBtn">✕</button>
            <h3 style="margin-bottom: 20px; font-size: 1.2rem; color: #fff; text-align: center; border-bottom: 1px solid #333; padding-bottom: 10px;">Advanced Configuration</h3>

            <div class="options-columns-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">

                <!-- LEFT COLUMN: SYSTEM TOGGLES & BRUSH MANAGEMENT -->
                <div class="options-column-left" style="display: flex; flex-direction: column; gap: 15px;">
                    <h4 style="margin: 0; font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Tool Configuration</h4>

                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="cbShowZone" style="cursor: pointer;">
                        <label for="cbShowZone" style="font-size: 13px; color: #ccc; cursor: pointer; user-select: none;">Show zone indicator</label>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                      <input type="checkbox" id="cbUseShades" style="cursor: pointer;">
                      <label for="cbUseShades" style="font-size: 13px; color: #ccc; cursor: pointer; user-select: none;">Use shape color shading</label>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                      <input type="checkbox" id="cbShadeDeath" style="cursor: pointer;">
                      <label for="cbShadeDeath" style="font-size: 13px; color: #ccc; cursor: pointer; user-select: none;">Shade death</label>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                      <input type="checkbox" id="cbShadeBouncy" style="cursor: pointer;">
                      <label for="cbShadeBouncy" style="font-size: 13px; color: #ccc; cursor: pointer; user-select: none;">Shade bouncy</label>
                    </div>

                    <!-- Drawing Mode Interface Component -->
                    <div style="border-top: 1px solid #333; padding-top: 15px; display: flex; flex-direction: column; gap: 12px;">
                      <button id="agpDrawBtn" type="button" class="btn" style="width: 100%; font-size: 12px; font-weight: bold; height: 36px;" title="Toggle continuous drawing mode (Ctrl+D)">
                        Toggle Drawing: OFF (Ctrl+D)
                      </button>

                      <div style="display: flex; flex-direction: column; gap: 6px;">
                        <label for="drawingThicknessSlider" style="font-size: 13px; display: flex; justify-content: space-between; color: #ccc;">
                          <span>Stroke Thickness:</span>
                          <span id="drawingThicknessVal" style="font-weight: bold; color: #4ade80;">20</span>
                        </label>
                        <input type="range" id="drawingThicknessSlider" min="5" max="150" value="20" style="width: 100%; cursor: pointer; margin: 5px 0;">
                      </div>
                    </div>
                </div>

                <!-- RIGHT COLUMN: MACRO STRUCTURAL UTILITIES (NOW A COMPACT GRID) -->
                <div class="options-column-right" style="border-left: 1px solid #222; padding-left: 20px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Map Modifiers</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button id="btnFixY" class="btn" style="font-size: 11px; padding: 6px;">Fix Y Slants</button>
                        <button id="btnFixX" class="btn" style="font-size: 11px; padding: 6px;">Fix X Slants</button>
                        <button id="btnStraightenLines" class="btn" style="font-size: 11px; padding: 6px;">Straighten (2°)</button>
                        <button id="btnLinesToCurvedPolys" class="btn" style="font-size: 11px; padding: 6px;">Curved Polys</button>
                        <button id="btnCurvePolygons" class="btn" style="font-size: 11px; padding: 6px;">Curve Polygons</button>
                        <button id="btnAddFrames" class="btn" style="font-size: 11px; padding: 6px;">Add Frames</button>
                        <button id="btnLinesToPolys" class="btn" style="font-size: 11px; padding: 6px;">Lines to Polys</button>
                        <button id="btnDelOOB" class="btn" style="font-size: 11px; padding: 6px;">Delete OOB</button>
                        <button id="btnMergePolys" class="btn" style="font-size: 11px; padding: 6px;">Merge Polys</button>
                        <button id="btnToggleZone" class="btn" style="font-size: 11px; padding: 6px;">Toggle Zone</button>
                    </div>

                    <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Generate Death Tunnel</h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label for="tunnelPaddingSlider" style="font-size: 12px; display: flex; justify-content: space-between; color: #ccc;">
                                <span>Tunnel Padding (px):</span>
                                <span id="tunnelPaddingVal" style="font-weight: bold; color: #4ade80;">30</span>
                            </label>
                            <input type="range" id="tunnelPaddingSlider" min="5" max="100" value="30" style="width: 100%; cursor: pointer;">
                            <button id="btnGenerateTunnel" class="btn" style="width: 100%; background-color: #dc2626; color: white; font-weight: bold; height: 34px; border: none; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;" title="Generate death polygons around pasted path">
                                Paste & Generate
                            </button>
                        </div>
                    </div>
                </div>
    `;
    document.body.appendChild(moreOptionsPopup);

    this.elems.moreOptionsPopup = moreOptionsPopup;
    this.elems.moCloseBtn = moreOptionsPopup.querySelector("#moCloseBtn");

    this._createUnifiedObjectEditor();
    this.setObjectEditorVisible([]);

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

    /// --- IN ui.js, inside _createUnifiedObjectEditor() ---
    // Replace the colorIndicators block with this:

    const colorIndicators = document.createElement("div");
    colorIndicators.id = "colorIndicators";
    colorIndicators.className = "color-indicators-container";

    // Updated to use elegant <button> tags with the 'btn' class
    colorIndicators.innerHTML = `
        <div style="display:flex; align-items:center; gap: 6px; margin-right: 15px; border-right: 1px solid #444; padding-right: 15px;">
          <span style="font-size: 11px; font-weight: bold; letter-spacing: 1px; color: #ccc;">ZOOM</span>
          <button id="btnZoomOut" class="btn" style="padding: 2px 8px; font-size: 14px; min-width: 28px;">-</button>
          <button id="btnZoomIn" class="btn" style="padding: 2px 8px; font-size: 14px; min-width: 28px;">+</button>
        </div>

        <button id="btnColor-none" class="btn" title="Randomize Normal Color" style="padding: 4px 8px; font-size: 11px; background: transparent; border: 1px solid #444; display: flex; align-items: center; gap: 6px;">
          <span id="colorIndicator-none" class="color-square"></span> Normal
        </button>
        <button id="btnColor-bouncy" class="btn" title="Randomize Bouncy Color" style="padding: 4px 8px; font-size: 11px; background: transparent; border: 1px solid #444; display: flex; align-items: center; gap: 6px;">
          <span id="colorIndicator-bouncy" class="color-square"></span> Bouncy
        </button>
        <button id="btnColor-death" class="btn" title="Randomize Death Color" style="padding: 4px 8px; font-size: 11px; background: transparent; border: 1px solid #444; display: flex; align-items: center; gap: 6px;">
          <span id="colorIndicator-death" class="color-square"></span> Death
        </button>
        <button id="btnColor-background" class="btn" title="Randomize Background Color" style="padding: 4px 8px; font-size: 11px; background: transparent; border: 1px solid #444; display: flex; align-items: center; gap: 6px;">
          <span id="colorIndicator-background" class="color-square"></span> BG
        </button>

        <button id="moreOptionsTrigger" class="btn" style="font-size: 10px; margin-left: 10px; padding: 4px 10px; border: 1px solid #444;">MORE OPTIONS (O)</button>
    `;
    controlBox.appendChild(colorIndicators);

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
    const changeColorsBtn = this._createButton(
      "changeColorsBtn", // Changed from autoGenerateBtn
      "Change Colors",
      "Randomize color scheme",
    );
    const pasteBtn = this._createButton(
      "pasteMapBtn",
      "Paste Map",
      "Paste map from clipboard",
    );
    leftRow1.append(drawModeBtn, pasteBtn, changeColorsBtn);

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
      360,
      0,
      "line-controls",
    );
    // Poly sliders
    const polyAngle = this._createSlider(
      "polyAngleSlider",
      "Angle",
      0,
      360,
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

    const circleRadius = this._createSlider(
      "circleRadiusSlider",
      "Radius",
      1,
      1000,
      50,
      "circle-controls",
    );

    rightCol.append(
      mapSizeRow,
      lineWidth,
      lineHeight,
      lineAngle,
      polyAngle,
      polyScale,
      circleRadius, // Add circle radius slider to the DOM
    );

    container.append(leftCol, rightCol);
    controlBox.appendChild(container);

    // Re-query all dynamically created elements to store them in this.elems
    this._queryDynamicElements();
  }

  // Helper factory
  createSliderHandlerFactory(elems) {
    return (propName, type) => {
      const uiProp = propName === "a" ? "angle" : propName;
      const capitalized = uiProp.charAt(0).toUpperCase() + uiProp.slice(1);
      const prefix = `${type}${capitalized}`;
      const sliderKey = `${prefix}Slider`;
      const valueKey = `${prefix}Value`;

      const slider = elems[sliderKey];
      const valueLabel = elems[valueKey];
      if (!slider) return;

      // 1. Real-time Local Update (Visual Feedback)
      const handleInput = () => {
        const val = slider.value;
        if (valueLabel) valueLabel.innerText = val;

        const selectedIds = State.get("selectedObjectIds");
        if (selectedIds.length === 0) return;

        let parsed = parseFloat(val);
        if (propName === "scale") parsed = parsed / 100.0;

        // Update Local State Immediately
        const objects = State.get("objects");
        let changed = false;
        objects.forEach((obj) => {
          if (selectedIds.includes(obj.id) && obj.type === type) {
            // Update the specific property
            if (propName === "a") obj.a = parsed;
            else if (propName === "angle") obj.angle = parsed;
            else if (propName === "width") obj.width = parsed;
            else if (propName === "height") obj.height = parsed;
            else if (propName === "scale") obj.scale = parsed;
            else if (propName === "radius") obj.radius = parsed;
            changed = true;
          }
        });

        if (changed) {
          State.set("objects", objects); // Trigger canvas redraw
        }
      };

      // 2. Network Update (Commit on release)
      const handleChange = () => {
        if (valueLabel) valueLabel.innerText = slider.value;
        const selectedIds = State.get("selectedObjectIds");
        if (selectedIds.length === 0) return;

        let parsed = parseFloat(slider.value);
        if (propName === "scale") parsed = parsed / 100.0;

        const payload = {};
        payload[propName] = Number.isFinite(parsed) ? parsed : slider.value;

        selectedIds.forEach((id) => {
          Network.updateObject({ id, ...payload });
        });
      };

      slider.addEventListener("input", handleInput);
      slider.addEventListener("change", handleChange);
    };
  }

  setObjectEditorVisible(selectedObjects) {
    const count = Array.isArray(selectedObjects) ? selectedObjects.length : 0;
    const controlBox = this.elems.controlBox;
    if (!controlBox) return;

    const indicators = document.getElementById("colorIndicators");
    if (indicators) {
      indicators.style.display = count > 0 ? "none" : "flex";
    }

    let mode = "none";
    let statusText = ""; // Default to empty
    const drawingMode = State.get("drawingMode");

    if (count === 0) {
      mode = "none";
      if (drawingMode === "poly")
        statusText = "Click to start drawing a polygon.";
      else if (drawingMode === "circle")
        statusText = "Click and drag to draw a circle.";
      else statusText = "Draw by dragging on canvas.";
    } else if (count === 1) {
      const object = selectedObjects[0];
      mode = object.type; // "line", "poly", or "circle"

      if (mode === "line") this.updateLineEditorValues(object);
      if (mode === "poly") this.updatePolygonEditorValues(object);
      if (mode === "circle") this.updateCircleEditorValues(object);
    } else {
      mode = "multi";
      statusText = `${count} objects selected. Use hotkeys to edit.`;
    }

    controlBox.dataset.editorMode = mode;
    this.setStatus(statusText);

    const isSelection = count > 0;
    if (this.elems.selectionActionsRow) {
      this.elems.selectionActionsRow.classList.toggle("hidden", !isSelection);
    }
    if (this.elems.zOrderActionsRow) {
      this.elems.zOrderActionsRow.classList.toggle("hidden", !isSelection);
    }
  }

  updateColorIndicators(colors) {
    if (!colors) return;
    const noneIndicator = document.getElementById("colorIndicator-none");
    const bouncyIndicator = document.getElementById("colorIndicator-bouncy");
    const deathIndicator = document.getElementById("colorIndicator-death");
    const bgIndicator = document.getElementById("colorIndicator-background"); // <-- ADD THIS

    if (noneIndicator) noneIndicator.style.backgroundColor = colors.none;
    if (bouncyIndicator) bouncyIndicator.style.backgroundColor = colors.bouncy;
    if (deathIndicator) deathIndicator.style.backgroundColor = colors.death;
    if (bgIndicator) bgIndicator.style.backgroundColor = colors.background; // <-- ADD THIS
  }

  show(selectorKey) {
    this.elems[selectorKey]?.classList.remove("hidden");
  }
  hide(selectorKey) {
    this.elems[selectorKey]?.classList.add("hidden");
  }

  updateLineEditorValues(line) {
    const { width, height, angle } = getLineProps(line);
    const w = Math.round(width);
    const h = Math.round(height);
    const a = Math.round(angle);
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

  updateCircleEditorValues(circle) {
    const radius = Math.round(circle.radius ?? 50);
    this._updateSlider("circleRadius", radius);
    if (this.elems.typeSelect) {
      this.elems.typeSelect.value = circle.circleType || "none";
    }
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
    const urlRegex =
      /(\b(?:https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi;
    const parts = message.split(urlRegex);

    // Process parts: odd indices are URLs, even are plain text
    parts.forEach((part, index) => {
      if (!part) return; // Skip empty parts
      if (index % 2 === 1) {
        // This is a URL
        const link = document.createElement("a");
        link.href = part;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = part;
        p.appendChild(link);
      } else {
        // This is plain text
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
    console.log("toggleLobbyPasswordInput called with:", show);
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
      "changeColorsBtn",
      "deleteBtn",
      "typeSelect",
      "toFrontBtn",
      "toBackBtn",
      "selectionActionsRow",
      "zOrderActionsRow",
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
      "circleRadiusSlider",
      "circleRadiusValue",
      "btnZoomIn",
      "btnZoomOut",
      "moreOptionsMenuContainer",
      "moreOptionsTrigger",
      "btnFixY",
      "btnFixX",
      "btnStraightenLines",
      "btnLinesToCurvedPolys",
      "btnCurvePolygons",
      "btnDelOOB",
      "btnMergePolys",
      "btnToggleZone",
      "btnAddFrames",
      "btnLinesToPolys",
      "tunnelPaddingSlider",
        "tunnelPaddingVal",
        "btnGenerateTunnel",
      "cbShowZone",
      "cbUseShades",
      "cbShadeDeath",
        "cbShadeBouncy",
      // CRITICAL REGISTRATION FIXES FOR THE DRAWING BUTTONS AND SIMULATORS:
      "agpDrawBtn",
      "drawingThicknessSlider",
      "drawingThicknessVal",
      "btnColor-none",
      "btnColor-bouncy",
      "btnColor-death",
      "btnColor-background",
    ];

    dynamicIds.forEach((id) => {
      this.elems[id] = document.getElementById(id);
    });
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
