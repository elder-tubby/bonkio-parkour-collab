import { normalizeAngle } from "./utils-client.js";

/*
Centralized selectors. Keep this complete and authoritative.
*/
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
  lineEditor: "#lineEditor", // Added for clarity

  // line controls
  copyMapBtn: "#copyMapBtn",
  copyLineInfoBtn: "#copyLineInfoBtn",
  popupCloseBtn: "#popup-close",
  lobbyMessage: "#lobbyMessage",
  deleteLineBtn: "#deleteLineBtn",
  lineTypeSelect: "#lineTypeSelect",
  hideUsernamesCheckbox: "#hideUsernamesCheckbox",

  // sliders & values
  spawnSizeSlider: "#spawnSizeSlider",
  spawnSizeValue: "#spawnSizeValue",
  lineWidthSlider: "#lineWidthSlider",
  lineHeightSlider: "#lineHeightSlider",
  lineAngleSlider: "#lineAngleSlider",
  lineWidthValue: "#lineWidthValue",
  lineHeightValue: "#lineHeightValue",
  lineAngleValue: "#lineAngleValue",

  // new controls (front/back)
  orderLabel: "#orderLabel",
  toFrontBtn: "#toFrontBtn",
  toBackBtn: "#toBackBtn",
  pasteMapBtn: "#pasteMapBtn",
};

class UI {
  constructor() {
    this.elems = {};
    this.CONTROL_ELEMENT_WIDTH = "80px"; // single source of truth for btn/select width

    // groupings for consistent bulk toggles
    this.LINE_CONTROLS = [
      "pasteMapBtn",
      "deleteLineBtn",
      "lineTypeSelect",
      "orderLabel",
      "toFrontBtn",
      "toBackBtn",
    ];

    this.SLIDER_KEYS = [
      "lineWidthSlider",
      "lineHeightSlider",
      "lineAngleSlider",
      "lineWidthValue",
      "lineHeightValue",
      "lineAngleValue",
    ];

    // default display strings
    this.DISPLAY = {
      PANEL: "flex",
      CONTROL: "inline-flex",
      HIDDEN: "none",
    };
  }

  init() {
    // single place to query DOM
    for (const key in SELECTORS) {
        this.elems[key] = document.querySelector(SELECTORS[key]);
    }

    if (this.elems.canvas) {
      this.elems.ctx = this.elems.canvas.getContext("2d");
    }

    // build editor area deterministically (creates DOM if missing)
    this._createLineEditor();

    // ensure defaults: everything related to line editing starts hidden/disabled
    this.setLineSelectionVisible(false, /* isNew */ true);

    // style tweaks
    if (this.elems.lineEditor) {
      this.elems.lineEditor.style.fontSize = "12px";
      this.elems.lineEditor.style.fontFamily = "Lexend, system-ui, sans-serif";
    }
  }

  _createLineEditor() {
    const controlBox = document.querySelector(".control-box");
    if (!controlBox) return;

    // clear and re-create deterministically
    controlBox.innerHTML = "";

    // STATUS (placed above the editor and centered)
    let status = document.querySelector("#status");
    if (!status) {
      status = document.createElement("div");
      status.id = "status";
      status.innerText = "Draw by dragging on canvas";
    }
    status.style.width = "100%";
    status.style.textAlign = "center";
    status.style.fontSize = "12px";
    status.style.whiteSpace = "nowrap";
    status.style.marginBottom = "8px";
    controlBox.appendChild(status);
    this.elems.statusText = status;

    // container for the editor columns
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "flex-start";
    container.style.gap = "12px";
    container.style.width = "100%";
    container.style.boxSizing = "border-box";

    // LEFT column (stacked rows)
    const leftCol = document.createElement("div");
    leftCol.style.display = "flex";
    leftCol.style.flexDirection = "column";
    leftCol.style.gap = "8px";
    leftCol.style.width = "150px";

    // Row: Map Size
    const rowMapSize = document.createElement("div");
    rowMapSize.style.display = "flex";
    rowMapSize.style.alignItems = "center";
    rowMapSize.style.gap = "20px";

    const spawnLabel = document.createElement("label");
    spawnLabel.setAttribute("for", "spawnSizeSlider");
    spawnLabel.style.whiteSpace = "nowrap";
    spawnLabel.style.width = "120px";
    spawnLabel.style.fontSize = "12px";
    spawnLabel.innerText = "Map Size:";

    let spawnSlider = document.querySelector("#spawnSizeSlider");
    if (!spawnSlider) {
      spawnSlider = document.createElement("input");
      spawnSlider.type = "range";
      spawnSlider.id = "spawnSizeSlider";
      spawnSlider.min = "1";
      spawnSlider.max = "13";
      spawnSlider.value = "6";
    }
    spawnSlider.style.flex = "1";
    spawnSlider.style.height = "20px";
    spawnSlider.style.marginRight = "0px";
    spawnSlider.style.minWidth = "150px";
    spawnSlider.style.maxWidth = "360px";

    let spawnVal = document.querySelector("#spawnSizeValue");
    if (!spawnVal) {
      spawnVal = document.createElement("span");
      spawnVal.id = "spawnSizeValue";
    }
    spawnVal.style.minWidth = "10px";
    spawnVal.style.textAlign = "right";
    spawnVal.innerText = spawnSlider.value;
    spawnVal.style.flexShrink = "0";

    this.elems.spawnSizeSlider = spawnSlider;
    this.elems.spawnSizeValue = spawnVal;

    rowMapSize.appendChild(spawnLabel);
    rowMapSize.appendChild(spawnSlider);
    rowMapSize.appendChild(spawnVal);
    leftCol.appendChild(rowMapSize);

    // Row: Paste / Delete / Type (three slots)
    const rowDelete = document.createElement("div");
    rowDelete.style.display = "flex";
    rowDelete.style.alignItems = "center";
    rowDelete.style.gap = "8px";
    rowDelete.style.width = "100%";
    rowDelete.style.justifyContent = "space-between";

    // Paste button
    let pasteBtn = document.querySelector("#pasteMapBtn");
    if (!pasteBtn) {
      pasteBtn = document.createElement("button");
      pasteBtn.id = "pasteMapBtn";
      pasteBtn.disabled = true; // disabled by default; app logic may enable
      pasteBtn.textContent = "Paste Map";
      pasteBtn.title = "Paste map from clipboard";
      pasteBtn.setAttribute("aria-label", "Paste Map");
      pasteBtn.type = "button";
    }
    pasteBtn.style.height = "22px";
    pasteBtn.style.padding = "4px 4px";
    pasteBtn.style.fontSize = "12px";
    pasteBtn.style.width = this.CONTROL_ELEMENT_WIDTH;

    // Delete button
    let deleteBtn = document.querySelector("#deleteLineBtn");
    if (!deleteBtn) {
      deleteBtn = document.createElement("button");
      deleteBtn.id = "deleteLineBtn";
      deleteBtn.disabled = true;
      deleteBtn.textContent = "Delete";
    }
    deleteBtn.style.height = "22px";
    deleteBtn.style.padding = "4px 4px";
    deleteBtn.style.fontSize = "12px";
    deleteBtn.style.width = this.CONTROL_ELEMENT_WIDTH;
    deleteBtn.title = "Delete selected line";

    // Type select
    let typeSelect = document.querySelector("#lineTypeSelect");
    if (!typeSelect) {
      typeSelect = document.createElement("select");
      typeSelect.id = "lineTypeSelect";
      typeSelect.disabled = true;
      typeSelect.innerHTML = `<option value="none">None</option><option value="bouncy">Bouncy</option><option value="death">Death</option>`;
    }
    typeSelect.style.height = "22px";
    typeSelect.style.fontSize = "12px";
    typeSelect.style.width = this.CONTROL_ELEMENT_WIDTH;
    typeSelect.title = "Line type";

    const leftSlot = document.createElement("div");
    leftSlot.style.display = "flex";
    leftSlot.style.alignItems = "center";
    leftSlot.style.justifyContent = "flex-start";
    leftSlot.style.width = "120px";
    leftSlot.appendChild(pasteBtn);

    const middleSlot = document.createElement("div");
    middleSlot.style.display = "flex";
    middleSlot.style.alignItems = "center";
    middleSlot.style.justifyContent = "center";
    middleSlot.style.flex = "1";
    middleSlot.appendChild(deleteBtn);

    const rightSlot = document.createElement("div");
    rightSlot.style.display = "flex";
    rightSlot.style.alignItems = "center";
    rightSlot.style.justifyContent = "flex-end";
    rightSlot.style.width = "120px";
    rightSlot.appendChild(typeSelect);

    rowDelete.appendChild(leftSlot);
    rowDelete.appendChild(middleSlot);
    rowDelete.appendChild(rightSlot);
    leftCol.appendChild(rowDelete);

    // Row: Order / Front & Back
    const rowOrder = document.createElement("div");
    rowOrder.style.display = "flex";
    rowOrder.style.alignItems = "center";
    rowOrder.style.gap = "8px";
    rowOrder.style.width = "100%";
    rowOrder.style.justifyContent = "space-between";

    const orderLabel = document.createElement("span");
    orderLabel.innerText = "Move line to:";
    orderLabel.id = "orderLabel";
    orderLabel.style.fontSize = "11px";
    orderLabel.style.opacity = "0.9";
    orderLabel.style.width = "80px";

    const buttonGroup = document.createElement("div");
    buttonGroup.style.display = "flex";
    buttonGroup.style.gap = "8px";
    buttonGroup.style.alignItems = "center";

    const toFrontBtn = document.createElement("button");
    toFrontBtn.id = "toFrontBtn";
    toFrontBtn.textContent = "Front";
    toFrontBtn.title = "Bring to front";
    toFrontBtn.setAttribute("aria-label", "Bring to front");
    toFrontBtn.style.height = "22px";
    toFrontBtn.style.padding = "4px 4px";
    toFrontBtn.style.fontSize = "12px";
    toFrontBtn.style.width = this.CONTROL_ELEMENT_WIDTH;

    const toBackBtn = document.createElement("button");
    toBackBtn.id = "toBackBtn";
    toBackBtn.textContent = "Back";
    toBackBtn.title = "Send to back";
    toBackBtn.setAttribute("aria-label", "Send to back");
    toBackBtn.style.height = "22px";
    toBackBtn.style.padding = "4px 4px";
    toBackBtn.style.fontSize = "12px";
    toBackBtn.style.width = this.CONTROL_ELEMENT_WIDTH;

    buttonGroup.appendChild(toFrontBtn);
    buttonGroup.appendChild(toBackBtn);

    const orderLeftSlot = document.createElement("div");
    orderLeftSlot.style.display = "flex";
    orderLeftSlot.style.alignItems = "center";
    orderLeftSlot.style.justifyContent = "flex-start";
    orderLeftSlot.style.width = "120px";
    orderLeftSlot.appendChild(orderLabel);

    const orderMiddleSlot = document.createElement("div");
    orderMiddleSlot.style.display = "flex";
    orderMiddleSlot.style.alignItems = "center";
    orderMiddleSlot.style.justifyContent = "center";
    orderMiddleSlot.style.flex = "1";
    orderMiddleSlot.appendChild(buttonGroup);

    const orderRightSlot = document.createElement("div");
    orderRightSlot.style.display = "flex";
    orderRightSlot.style.alignItems = "center";
    orderRightSlot.style.justifyContent = "flex-end";
    orderRightSlot.style.width = "120px";

    rowOrder.appendChild(orderLeftSlot);
    rowOrder.appendChild(orderMiddleSlot);
    rowOrder.appendChild(orderRightSlot);
    leftCol.appendChild(rowOrder);

    leftCol.appendChild(document.createElement("div"));

    // RIGHT column: sliders
    const rightCol = document.createElement("div");
    rightCol.style.display = "flex";
    rightCol.style.flexDirection = "column";
    rightCol.style.gap = "0px";
    rightCol.style.flex = "0 0 420px";
    rightCol.style.minWidth = "240px";

    const makeSliderRow = (id, labelText, min, max, defaultVal) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.width = "100%";

      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.style.width = "130px";
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

      let input = document.querySelector("#" + id);
      if (!input) {
        input = document.createElement("input");
        input.type = "range";
        input.id = id;
        input.min = String(min);
        input.max = String(max);
        input.value = String(defaultVal);
      }
      input.style.flex = "1";
      input.style.height = "28px";

      const value = document.createElement("div");
      value.id = `${id}Value`;
      value.style.width = "56px";
      value.style.textAlign = "right";
      value.style.fontSize = "12px";
      value.style.paddingRight = "10px";
      value.innerText = input.value;

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(value);

      return { row, input, value };
    };

    const w = makeSliderRow(
      "lineWidthSlider",
      "Width (ALT + L/R)",
      1,
      1000,
      100,
    );
    const h = makeSliderRow(
      "lineHeightSlider",
      "Height (ALT + U/D)",
      1,
      1000,
      4,
    );
    const a = makeSliderRow(
      "lineAngleSlider",
      "Angle (SHIFT + L/R)",
      0,
      180,
      0,
    );

    rightCol.appendChild(w.row);
    rightCol.appendChild(h.row);
    rightCol.appendChild(a.row);

    container.appendChild(leftCol);
    container.appendChild(rightCol);
    controlBox.appendChild(container);

    // store refs in elems
    this.elems.lineEditor = rightCol;
    this.elems.lineWidthSlider = w.input;
    this.elems.lineHeightSlider = h.input;
    this.elems.lineAngleSlider = a.input;
    this.elems.lineWidthValue = w.value;
    this.elems.lineHeightValue = h.value;
    this.elems.lineAngleValue = a.value;
    this.elems.deleteLineBtn = deleteBtn;
    this.elems.lineTypeSelect = typeSelect;
    this.elems.spawnSizeSlider = spawnSlider;
    this.elems.spawnSizeValue = spawnVal;
    this.elems.toFrontBtn = toFrontBtn;
    this.elems.toBackBtn = toBackBtn;
    this.elems.pasteMapBtn = pasteBtn;
    this.elems.orderLabel = orderLabel;

    // wiring: value labels
    spawnSlider.addEventListener("input", () => {
      spawnVal.innerText = spawnSlider.value;
    });
    [w.input, h.input, a.input].forEach((s, i) => {
      const valueEl = [w.value, h.value, a.value][i];
      s.addEventListener("input", () => {
        valueEl.innerText = s.value;
      });
    });
  }

  // generic helpers
  _setDisplay(elemOrKey, display) {
    const el =
      typeof elemOrKey === "string" ? this.elems[elemOrKey] : elemOrKey;
    if (!el) return;
    el.style.display = display;
  }

  _setDisabled(elemOrKey, disabled) {
    const el =
      typeof elemOrKey === "string" ? this.elems[elemOrKey] : elemOrKey;
    if (!el) return;
    if ("disabled" in el) el.disabled = Boolean(disabled);
  }

  // Public: small convenience helpers (kept for other code)
  show(selectorKey) {
    this._setDisplay(selectorKey, this.DISPLAY.PANEL);
  }
  hide(selectorKey) {
    this._setDisplay(selectorKey, this.DISPLAY.HIDDEN);
  }

  /*
Centralized: set visibility & enabled/disabled state for all line-related UI.
*/
  setLineSelectionVisible(selected, isNew = false) {
    const show = Boolean(selected);
    const controlDisplay = show ? this.DISPLAY.CONTROL : this.DISPLAY.HIDDEN;
    const panelDisplay = show ? this.DISPLAY.PANEL : this.DISPLAY.HIDDEN;

    // show/hide whole editor panel (right column with sliders)
    if (this.elems.lineEditor)
      this.elems.lineEditor.style.display = panelDisplay;

    // status text visibility: hide when a line is selected
    if (this.elems.statusText)
      this.elems.statusText.style.display = show
        ? this.DISPLAY.HIDDEN
        : "block";

    // line controls (paste, delete, type, order, front/back)
    this.LINE_CONTROLS.forEach((k) => {
      const el = this.elems[k];
      if (!el) return;
      el.style.display = controlDisplay;
      const shouldDisable = !show || Boolean(isNew);
      if ("disabled" in el) el.disabled = shouldDisable;
    });

    // sliders + their value displays: they are also toggled by selection
    this.SLIDER_KEYS.forEach((k) => {
      const el = this.elems[k];
      if (!el) return;
      el.style.display = show ? "flex" : this.DISPLAY.HIDDEN;
      if (el.tagName === "INPUT" && el.type === "range") {
        el.disabled = !show || Boolean(isNew);
      }
    });
  }

  // wrapper so existing code can call showLineEditor/hideLineEditor
  showLineEditor(line) {
    const selected = Boolean(line);
    const isNew = this._isNewLine(line);
    this.setLineSelectionVisible(selected, isNew);
    if (!selected) return;
    this.updateLineEditorValues(line);
  }

  hideLineEditor() {
    this.setLineSelectionVisible(false, true);
  }

  updateLineEditorValues(line) {
    if (!line) return this.hideLineEditor();

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
  }

  // small utilities for lobby / chat / players (kept intact but simplified checks)
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
    if (!this.elems.statusText) return;
    this.elems.statusText.innerText = text;
  }

  setVote(count, total) {
    if (!this.elems.voteStatus) return;
    this.elems.voteStatus.innerText = `${count} / ${total} voted`;
  }

  showLobbyMessage(text) {
    const msg = this.elems.lobbyMessage;
    if (!msg) return;
    msg.innerText = text;
    msg.style.display = "block";
  }

  hideLobbyMessage() {
    if (!this.elems.lobbyMessage) return;
    this.elems.lobbyMessage.style.display = "none";
  }

  resetControls() {
    if (this.elems.readyCheckbox) this.elems.readyCheckbox.checked = false;
    if (this.elems.voteCheckbox) this.elems.voteCheckbox.checked = false;
    if (this.elems.chatInput) this.elems.chatInput.value = "";
  }

  clearChat() {
    if (!this.elems.chatMessages) return;
    this.elems.chatMessages.innerHTML = "";
  }

  appendChat({ name, message, isError = false }) {
    if (!this.elems.chatMessages) return;
    const p = document.createElement("p");
    if (isError) {
      p.style.color = "#dc3545"; // Use a distinct error color
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

  _isNewLine(line) {
    if (!line) return true;
    if (line.isNew || line.new || line._new) return true;
    if (typeof line.id === "undefined" || line.id === null) return true;
    return false;
  }
}

export default new UI();
