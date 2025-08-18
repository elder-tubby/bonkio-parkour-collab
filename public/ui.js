import { normalizeAngle } from "./utils-client.js";
import State from "./state.js";
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
  statusText: "#status",
  canvas: "#canvas",
  chatInput: "#chatInput",
  chatSendBtn: "#chatSendBtn",
  chatMessages: "#chatMessages",
  gameEndPopup: "#gameEndPopup",
  // kept for backward compatibility; the unified editor will be created dynamically
  lineEditor: "#lineEditor",
  copyMapBtn: "#copyMapBtn",
  copyLineInfoBtn: "#copyLineInfoBtn",
  popupCloseBtn: "#popup-close",
  lobbyMessage: "#lobbyMessage",
  // line-specific selectors (kept)
  deleteLineBtn: "#deleteLineBtn",
  lineTypeSelect: "#lineTypeSelect",
  hideUsernamesCheckbox: "#hideUsernamesCheckbox",
  spawnSizeSlider: "#spawnSizeSlider",
  spawnSizeValue: "#spawnSizeValue",
  lineWidthSlider: "#lineWidthSlider",
  lineHeightSlider: "#lineHeightSlider",
  lineAngleSlider: "#lineAngleSlider",
  lineWidthValue: "#lineWidthValue",
  lineHeightValue: "#lineHeightValue",
  lineAngleValue: "#lineAngleValue",
  orderLabel: "#orderLabel",
  toFrontBtn: "#toFrontBtn",
  toBackBtn: "#toBackBtn",
  pasteMapBtn: "#pasteMapBtn",
  drawModeBtn: "#drawModeBtn",
  // polygon-specific selectors (kept and extended)
  polyEditor: "#polyEditor",
  deletePolyBtn: "#deletePolyBtn",
  polyTypeSelect: "#polyTypeSelect",
  polyScaleSlider: "#polyScaleSlider",
  polyScaleValue: "#polyScaleValue",
  polyAngleSlider: "#polyAngleSlider",
  polyAngleValue: "#polyAngleValue",
  polyToFrontBtn: "#polyToFrontBtn",
  polyToBackBtn: "#polyToBackBtn",
};

class UI {
  constructor() {
    this.elems = {};
    // consistent button width across rows
    this.CONTROL_ELEMENT_WIDTH = "100px";

    // Controls for show/hide logic (keeps compatibility with previous code)
    this.LINE_CONTROLS = [
      "deleteLineBtn",
      "lineTypeSelect",
      "orderLabel",
      "toFrontBtn",
      "toBackBtn",
    ];
    this.POLY_CONTROLS = [
      "deletePolyBtn",
      "polyTypeSelect",
      "polyScaleSlider",
      "polyScaleValue",
      "polyAngleSlider",
      "polyAngleValue",
      "polyToFrontBtn",
      "polyToBackBtn",
    ];

    this.DISPLAY = { PANEL: "flex", CONTROL: "inline-flex", HIDDEN: "none" };
  }

  init() {
    // collect existing DOM nodes referenced in SELECTORS (may be null)
    for (const key in SELECTORS) {
      this.elems[key] = document.querySelector(SELECTORS[key]);
    }

    if (this.elems.canvas) {
      this.elems.ctx = this.elems.canvas.getContext("2d");
    }

    // Build a single unified object editor inside .control-box
    this._createUnifiedObjectEditor();

    // ensure initial visibility as original code intended
    if (this.elems.lineEditor) {
      this.elems.lineEditor.style.fontSize = "12px";
      this.elems.lineEditor.style.fontFamily = "Lexend, system-ui, sans-serif";
    }

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

    // ensure initial editor visibility is consistent (no selected objects)
    this.setObjectEditorVisible([]);
  }

  _createUnifiedObjectEditor() {
    const controlBox = document.querySelector(".control-box");
    if (!controlBox) return;

    // Clear existing controls
    controlBox.innerHTML = "";

    // Status (top row across full width)
    const status = document.createElement("div");
    status.id = "status";
    status.innerText = "Draw by dragging on canvas";
    status.style.width = "100%";
    status.style.textAlign = "center";
    status.style.fontSize = "12px";
    status.style.whiteSpace = "nowrap";
    // status.style.margin = "6px 0";
    controlBox.appendChild(status);
    this.elems.statusText = status;

    // Container layout - compact
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "flex-start";
    container.style.gap = "12px";
    container.style.width = "100%";
    container.style.boxSizing = "border-box";
    // reduce overall vertical footprint
    // container.style.padding = "6px 4px";

    // Left column - EXACTLY 3 rows as requested
    const leftCol = document.createElement("div");
    leftCol.style.display = "flex";
    leftCol.style.flexDirection = "column";
    leftCol.style.gap = "6px";
    leftCol.style.width = "300px"; // fixed to keep alignment predictable
    leftCol.style.boxSizing = "border-box";
    leftCol.style.marginRight = "20px";

    // Row 1: draw mode button + paste map button (aligned)
    const leftRow1 = document.createElement("div");
    leftRow1.style.display = "flex";
    leftRow1.style.alignItems = "center";
    leftRow1.style.justifyContent = "left";
    leftRow1.style.gap = "8px";

    const drawModeBtn = document.createElement("button");
    drawModeBtn.id = "drawModeBtn";
    drawModeBtn.textContent = "Mode: Line (M)";
    drawModeBtn.style.height = "26px";
    drawModeBtn.style.padding = "4px 8px";
    drawModeBtn.style.fontSize = "12px";
    drawModeBtn.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    drawModeBtn.style.boxSizing = "border-box";
    this.elems.drawModeBtn = drawModeBtn;

    const pasteBtn = document.createElement("button");
    pasteBtn.id = "pasteMapBtn";
    pasteBtn.textContent = "Paste Map";
    pasteBtn.title = "Paste map from clipboard";
    pasteBtn.setAttribute("aria-label", "Paste Map");
    pasteBtn.type = "button";
    pasteBtn.style.height = "26px";
    pasteBtn.style.padding = "4px 8px";
    pasteBtn.style.fontSize = "12px";
    pasteBtn.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    pasteBtn.style.boxSizing = "border-box";

    leftRow1.appendChild(drawModeBtn);
    leftRow1.appendChild(pasteBtn);

    // Row 2: Delete and Type select
    const leftRow2 = document.createElement("div");
    leftRow2.style.display = "flex";
    leftRow2.style.alignItems = "center";
    leftRow2.style.justifyContent = "left";
    leftRow2.style.gap = "8px";

    const deleteLineBtn = document.createElement("button");
    deleteLineBtn.id = "deleteLineBtn";
    deleteLineBtn.disabled = true;
    deleteLineBtn.textContent = "Delete";
    deleteLineBtn.style.height = "26px";
    deleteLineBtn.style.padding = "4px 8px";
    deleteLineBtn.style.fontSize = "12px";
    deleteLineBtn.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    deleteLineBtn.style.boxSizing = "border-box";
    deleteLineBtn.title = "Delete selected object";

    // unified poly delete (kept for compatibility)
    const deletePolyBtn = document.createElement("button");
    deletePolyBtn.id = "deletePolyBtn";
    deletePolyBtn.disabled = true;
    deletePolyBtn.textContent = "Delete";
    deletePolyBtn.style.height = "26px";
    deletePolyBtn.style.padding = "4px 8px";
    deletePolyBtn.style.fontSize = "12px";
    deletePolyBtn.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    deletePolyBtn.style.boxSizing = "border-box";
    deletePolyBtn.title = "Delete selected polygon";

    const typeSelect = document.createElement("select");
    typeSelect.id = "lineTypeSelect";
    typeSelect.disabled = true;
    typeSelect.innerHTML = `<option value="none">None</option><option value="bouncy">Bouncy</option><option value="death">Death</option>`;
    typeSelect.style.height = "26px";
    typeSelect.style.fontSize = "12px";
    typeSelect.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    typeSelect.style.boxSizing = "border-box";
    typeSelect.title = "Object type";

    const polyTypeSelect = document.createElement("select");
    polyTypeSelect.id = "polyTypeSelect";
    polyTypeSelect.disabled = true;
    polyTypeSelect.innerHTML = `<option value="none">None</option><option value="bouncy">Bouncy</option><option value="death">Death</option>`;
    polyTypeSelect.style.height = "26px";
    polyTypeSelect.style.fontSize = "12px";
    polyTypeSelect.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    polyTypeSelect.style.boxSizing = "border-box";
    polyTypeSelect.title = "Polygon type"; // hidden until poly selected

    // append both selects to the row (we'll show/hide them in setObjectEditorVisible/_toggle)
    leftRow2.appendChild(deleteLineBtn);
    leftRow2.appendChild(deletePolyBtn);
    leftRow2.appendChild(typeSelect);
    leftRow2.appendChild(polyTypeSelect);

    // Row 3: Move to Front / Back (aligned)
    const leftRow3 = document.createElement("div");
    leftRow3.style.display = "flex";
    leftRow3.style.alignItems = "center";
    leftRow3.style.justifyContent = "left";
    leftRow3.style.gap = "8px";

    const toFrontBtn = document.createElement("button");
    toFrontBtn.id = "toFrontBtn";
    toFrontBtn.textContent = "Front";
    toFrontBtn.title = "Bring to front";
    toFrontBtn.style.height = "26px";
    toFrontBtn.style.padding = "4px 8px";
    toFrontBtn.style.fontSize = "12px";
    toFrontBtn.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    toFrontBtn.style.boxSizing = "border-box";

    const toBackBtn = document.createElement("button");
    toBackBtn.id = "toBackBtn";
    toBackBtn.textContent = "Back";
    toBackBtn.title = "Send to back";
    toBackBtn.style.height = "26px";
    toBackBtn.style.padding = "4px 8px";
    toBackBtn.style.fontSize = "12px";
    toBackBtn.style.minWidth = this.CONTROL_ELEMENT_WIDTH;
    toBackBtn.style.boxSizing = "border-box";

    leftRow3.appendChild(toFrontBtn);
    leftRow3.appendChild(toBackBtn);

    // Append rows into left column (exactly three rows)
    leftCol.appendChild(leftRow1);
    leftCol.appendChild(leftRow2);
    leftCol.appendChild(leftRow3);

    // Right column - up to 4 rows, compact spacing
    const rightCol = document.createElement("div");
    rightCol.style.display = "flex";
    rightCol.style.flexDirection = "column";
    rightCol.style.gap = "6px"; // slightly smaller spacing
    rightCol.style.flex = "1";
    rightCol.style.minWidth = "320px";
    rightCol.style.boxSizing = "border-box";

    // Make a generic compact slider row factory
    const makeCompactSliderRow = (id, labelText, min, max, defaultVal) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "8px";
      row.style.width = "100%";

      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.style.width = "110px";
      label.style.textAlign = "left";
      label.style.fontSize = "12px";

      const match = labelText.match(/^([^(]+)(\(.*\))$/);
      if (match) {
        const mainSpan = document.createElement("span");
        mainSpan.textContent = match[1].trim() + " ";
        const smallSpan = document.createElement("span");
        smallSpan.textContent = match[2];
        smallSpan.style.fontSize = "10px";
        smallSpan.style.opacity = "0.7";
        label.appendChild(mainSpan);
        label.appendChild(smallSpan);
      } else {
        label.textContent = labelText;
      }

      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = String(min);
      input.max = String(max);
      input.value = String(defaultVal);
      input.style.flex = "1";
      input.style.height = "24px";
      input.style.margin = "0 8px";

      const value = document.createElement("div");
      value.id = `${id}Value`;
      value.style.width = "48px";
      value.style.textAlign = "right";
      value.style.fontSize = "12px";
      value.innerText = input.value;

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(value);

      return { row, input, value, label };
    };

    // Row 1 (right): Map Size slider (compact)
    const mapSizeRow = makeCompactSliderRow(
      "spawnSizeSlider",
      "Map Size:",
      1,
      13,
      9,
    );

    // Line editing rows: width / height / angle (compact)
    const lineWidth = makeCompactSliderRow(
      "lineWidthSlider",
      "Width (ALT + L/R)",
      1,
      1000,
      100,
    );
    const lineHeight = makeCompactSliderRow(
      "lineHeightSlider",
      "Height (ALT + U/D)",
      1,
      1000,
      4,
    );
    const lineAngle = makeCompactSliderRow(
      "lineAngleSlider",
      "Angle (SHIFT + L/R)",
      0,
      180,
      0,
    );

    // Polygon controls appended after line controls (angle then scale)
    const polyAngle = makeCompactSliderRow(
      "polyAngleSlider",
      "Angle (SHIFT + L/R)",
      0,
      180,
      0,
    );
    const polyScale = makeCompactSliderRow(
      "polyScaleSlider",
      "Scale (ALT + U/D)",
      10,
      500,
      100,
    );

    // append rows into right column (in this order)
    rightCol.appendChild(mapSizeRow.row);
    rightCol.appendChild(lineWidth.row);
    rightCol.appendChild(lineHeight.row);
    rightCol.appendChild(lineAngle.row);
    // poly controls appended but visually hidden unless poly selected
    // we'll keep them available for toggling
    rightCol.appendChild(polyAngle.row);
    rightCol.appendChild(polyScale.row);

    // Append left & right into container
    container.appendChild(leftCol);
    container.appendChild(rightCol);
    controlBox.appendChild(container);

    // Assign to this.elems for access elsewhere (IDs preserved)
    this.elems.lineEditor = rightCol; // editor container
    // Left elems
    this.elems.drawModeBtn = drawModeBtn;
    this.elems.pasteMapBtn = pasteBtn;
    this.elems.deleteLineBtn = deleteLineBtn;
    this.elems.deletePolyBtn = deletePolyBtn;
    this.elems.lineTypeSelect = typeSelect;
    this.elems.polyTypeSelect = polyTypeSelect;
    this.elems.toFrontBtn = toFrontBtn;
    this.elems.toBackBtn = toBackBtn;

    // Right elems (sliders & values)
    this.elems.spawnSizeSlider = mapSizeRow.input;
    this.elems.spawnSizeValue = mapSizeRow.value;
    this.elems.lineWidthSlider = lineWidth.input;
    this.elems.lineWidthValue = lineWidth.value;
    this.elems.lineHeightSlider = lineHeight.input;
    this.elems.lineHeightValue = lineHeight.value;
    this.elems.lineAngleSlider = lineAngle.input;
    this.elems.lineAngleValue = lineAngle.value;
    this.elems.polyAngleSlider = polyAngle.input;
    this.elems.polyAngleValue = polyAngle.value;
    this.elems.polyScaleSlider = polyScale.input;
    this.elems.polyScaleValue = polyScale.value;

    // keep older keys for compatibility
    this.elems.pasteMapBtn = pasteBtn;
    this.elems.orderLabel = this.elems.orderLabel || null;
    this.elems.copyMapBtn = this.elems.copyMapBtn || null;
    this.elems.copyLineInfoBtn = this.elems.copyLineInfoBtn || null;
    this.elems.popupCloseBtn = this.elems.popupCloseBtn || null;

    // Make sure poly controls are hidden by default (no selection)
    // these actual show/hide toggles controlled by setObjectEditorVisible
    polyAngle.row.style.display = "none";
    polyScale.row.style.display = "none";
  }

  // A single function to control visibility and syncing
  setObjectEditorVisible(selectedObjects) {
    const count = Array.isArray(selectedObjects) ? selectedObjects.length : 0;
    const statusEl = this.elems.statusText;

    if (count === 0) {
      if (statusEl) statusEl.style.display = "block";
      // hide specific controls
      this._toggleControlGroup("line", false);
      this._toggleControlGroup("poly", false);
      const mode = State.get("drawingMode");
      let statusText = "Draw by dragging on canvas.";
      if (mode === "poly") statusText = "Click to start drawing a polygon.";
      if (mode === "select") statusText = "Drag on canvas to select objects.";
      this.setStatus(statusText);
    } else if (count === 1) {
      const object = selectedObjects[0];
      if (statusEl) statusEl.style.display = "none";

      if (object.type === "line") {
        this._toggleControlGroup("poly", false);
        this._toggleControlGroup("line", true);
        this.updateLineEditorValues(object);
      } else if (object.type === "poly") {
        this._toggleControlGroup("line", false);
        this._toggleControlGroup("poly", true);
        this.updatePolygonEditorValues(object);
      }
    } else {
      // Multi-selection
      if (statusEl) statusEl.style.display = "block";
      this._toggleControlGroup("line", false);
      this._toggleControlGroup("poly", false);
      this.setStatus(`${count} objects selected. Use hotkeys to edit.`);
    }
  }

  _toggleControlGroup(type, show) {
    const isPoly = type === "poly";

    // Line group toggles:
    // Delete button, type select, and line sliders
    if (this.elems.deleteLineBtn)
      this.elems.deleteLineBtn.style.display =
        !isPoly && show ? "inline-flex" : "none";
    if (this.elems.lineTypeSelect)
      this.elems.lineTypeSelect.style.display =
        !isPoly && show ? "inline-flex" : "none";
    if (this.elems.lineWidthSlider)
      this.elems.lineWidthSlider.parentElement.style.display =
        !isPoly && show ? "flex" : "none";
    if (this.elems.lineHeightSlider)
      this.elems.lineHeightSlider.parentElement.style.display =
        !isPoly && show ? "flex" : "none";
    if (this.elems.lineAngleSlider)
      this.elems.lineAngleSlider.parentElement.style.display =
        !isPoly && show ? "flex" : "none";

    // Poly group toggles:
    if (this.elems.deletePolyBtn)
      this.elems.deletePolyBtn.style.display =
        isPoly && show ? "inline-flex" : "none";
    if (this.elems.polyTypeSelect)
      this.elems.polyTypeSelect.style.display =
        isPoly && show ? "inline-flex" : "none";
    if (this.elems.polyAngleSlider)
      this.elems.polyAngleSlider.parentElement.style.display =
        isPoly && show ? "flex" : "none";
    if (this.elems.polyScaleSlider)
      this.elems.polyScaleSlider.parentElement.style.display =
        isPoly && show ? "flex" : "none";

    // Buttons enabled/disabled
    const lineControls = [
      "deleteLineBtn",
      "lineTypeSelect",
      "toFrontBtn",
      "toBackBtn",
    ];
    lineControls.forEach((key) => {
      const el = this.elems[key];
      if (el && "disabled" in el) el.disabled = !show;
    });

    const polyControls = [
      "deletePolyBtn",
      "polyTypeSelect",
      "polyToFrontBtn",
      "polyToBackBtn",
    ];
    polyControls.forEach((key) => {
      const el = this.elems[key];
      if (el && "disabled" in el) el.disabled = !show;
    });
  }

  show(selectorKey) {
    this._setDisplay(selectorKey, this.DISPLAY.PANEL);
  }
  hide(selectorKey) {
    this._setDisplay(selectorKey, this.DISPLAY.HIDDEN);
  }

  updateLineEditorValues(line) {
    const w = Math.round(
      line.width ??
        Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y),
    );
    const h = Math.round(line.height ?? 4);
    const a = Math.round(line.angle ?? 0);

    if (this.elems.lineWidthSlider)
      this.elems.lineWidthSlider.value = String(w);
    if (this.elems.lineHeightSlider)
      this.elems.lineHeightSlider.value = String(h);
    if (this.elems.lineAngleSlider)
      this.elems.lineAngleSlider.value = String(normalizeAngle(a));

    if (this.elems.lineWidthValue)
      this.elems.lineWidthValue.innerText = String(w);
    if (this.elems.lineHeightValue)
      this.elems.lineHeightValue.innerText = String(h);
    if (this.elems.lineAngleValue)
      this.elems.lineAngleValue.innerText = String(normalizeAngle(a));

    if (this.elems.lineTypeSelect)
      this.elems.lineTypeSelect.value = line.lineType || "none";
  }

  updatePolygonEditorValues(poly) {
    const angle = Math.round(poly.a ?? 0);
    const scale = Math.round((poly.scale ?? 1) * 100);

    if (this.elems.polyAngleSlider)
      this.elems.polyAngleSlider.value = String(angle);
    if (this.elems.polyAngleValue)
      this.elems.polyAngleValue.innerText = String(angle);

    if (this.elems.polyScaleSlider)
      this.elems.polyScaleSlider.value = String(scale);
    if (this.elems.polyScaleValue)
      this.elems.polyScaleValue.innerText = String(scale);

    if (this.elems.polyTypeSelect)
      this.elems.polyTypeSelect.value = poly.polyType || "none";
  }

  updateLobby(players) {
    if (!this.elems.readyList) return;
    this.elems.readyList.innerHTML = (players || [])
      .map((p) => {
        const status = p.inGame ? "In Game" : p.ready ? "Ready" : "Not ready";
        const color = p.inGame ? "#ffc107" : p.ready ? "#28a745" : "#dc3545";
        return `<li><span>${p.symbol} ${p.name}</span><span style="color:${color}; margin-left: 8px">${status}</span></li>`;
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
    const msg = this.elems.lobbyMessage;
    if (msg) {
      msg.innerText = text;
      msg.style.display = "block";
    }
  }
  hideLobbyMessage() {
    if (this.elems.lobbyMessage) this.elems.lobbyMessage.style.display = "none";
  }

  resetControls() {
    if (this.elems.readyCheckbox) this.elems.readyCheckbox.checked = false;
    if (this.elems.voteCheckbox) this.elems.voteCheckbox.checked = false;
    if (this.elems.chatInput) this.elems.chatInput.value = "";
  }

  clearChat() {
    if (this.elems.chatMessages) this.elems.chatMessages.innerHTML = "";
  }

  appendChat({ name, message, isError = false }) {
    if (!this.elems.chatMessages) return;
    const p = document.createElement("p");
    if (isError) {
      p.style.color = "#dc3545";
      p.style.fontStyle = "italic";
    }
    p.innerHTML = `<span class="chat-sender">${name}:</span> ${message}`;
    this.elems.chatMessages.appendChild(p);
    this.elems.chatMessages.scrollTop = this.elems.chatMessages.scrollHeight;
  }

  setEndReason(text) {
    const msg = this.elems.gameEndPopup?.querySelector("p");
    if (msg) msg.innerText = text;
  }

  _setDisplay(elemOrKey, display) {
    const el =
      typeof elemOrKey === "string" ? this.elems[elemOrKey] : elemOrKey;
    if (el) el.style.display = display;
  }
}

export default new UI();
