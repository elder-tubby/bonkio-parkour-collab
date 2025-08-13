// ui.js
// All DOM interactions
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
  copyLineInfoBtn: "#copyLineInfoBtn",
  popupCloseBtn: "#popup-close",
  lobbyMessage: "#lobbyMessage",
  deleteLineBtn: "#deleteLineBtn",
  lineTypeSelect: "#lineTypeSelect",
  hideUsernamesCheckbox: "#hideUsernamesCheckbox",
};

class UI {
  constructor() {
    this.elems = {};
  }

  init() {
    Object.entries(SELECTORS).forEach(([key, sel]) => {
      this.elems[key] = document.querySelector(sel);
    });
    this.elems.ctx = this.elems.canvas.getContext("2d");
    this.elems.deleteLineBtn = document.querySelector(SELECTORS.deleteLineBtn);
    this.elems.lineTypeSelect = document.querySelector(
      SELECTORS.lineTypeSelect,
    );
    this.elems.spawnSizeSlider = document.querySelector("#spawnSizeSlider");
    this.elems.spawnSizeValue = document.querySelector("#spawnSizeValue");

    // Create line editor area and append to control box (keeps HTML unchanged)
    this._createLineEditor();
  }
  // ui.js - inside UI class
  _createLineEditor() {
    const controlBox = document.querySelector(".control-box");
    if (!controlBox) return;

    controlBox.innerHTML = "";

    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "flex-start";
    container.style.gap = "12px";
    container.style.width = "100%";
    container.style.boxSizing = "border-box";

    // LEFT column (4 stacked rows)
    const leftCol = document.createElement("div");
    leftCol.style.display = "flex";
    leftCol.style.flexDirection = "column";
    leftCol.style.gap = "8px";
    leftCol.style.flex = "0 1 420px";
    leftCol.style.minWidth = "240px";

    // Row 1: status
    let status = document.querySelector("#status");
    if (!status) {
      status = document.createElement("div");
      status.id = "status";
      status.innerText = "Draw by dragging on canvas";
    }
    status.style.whiteSpace = "nowrap";
    leftCol.appendChild(status);

    // Row 2: delete + type (compact)
    const row2 = document.createElement("div");
    row2.style.display = "flex";
    row2.style.gap = "8px";
    row2.style.alignItems = "center";

    let deleteBtn = document.querySelector("#deleteLineBtn");
    if (!deleteBtn) {
      deleteBtn = document.createElement("button");
      deleteBtn.id = "deleteLineBtn";
      deleteBtn.disabled = true;
      deleteBtn.textContent = "Delete Line";
    }
    // reduce vertical size
    deleteBtn.style.height = "28px";
    deleteBtn.style.padding = "4px 8px";
    row2.appendChild(deleteBtn);

    let typeSelect = document.querySelector("#lineTypeSelect");
    if (!typeSelect) {
      typeSelect = document.createElement("select");
      typeSelect.id = "lineTypeSelect";
      typeSelect.disabled = true;
      typeSelect.innerHTML = `<option value="none">None</option><option value="bouncy">Bouncy</option><option value="death">Death</option>`;
    }
    typeSelect.style.height = "28px";
    row2.appendChild(typeSelect);
    leftCol.appendChild(row2);

    // Row 3: spawn size
    const row3 = document.createElement("div");
    row3.style.display = "flex";
    row3.style.alignItems = "center";
    row3.style.gap = "8px";

    const spawnLabel = document.createElement("label");
    spawnLabel.setAttribute("for", "spawnSizeSlider");
    spawnLabel.style.whiteSpace = "nowrap";
    spawnLabel.innerText = "Map Size:";

    let spawnSlider = document.querySelector("#spawnSizeSlider");
    if (!spawnSlider) {
      spawnSlider = document.createElement("input");
      spawnSlider.type = "range";
      spawnSlider.id = "spawnSizeSlider";
      spawnSlider.min = "1";
      spawnSlider.max = "13";
    }
    spawnSlider.style.width = "160px"; // fixed width so it doesn't expand
    let spawnVal = document.querySelector("#spawnSizeValue");
    if (!spawnVal) {
      spawnVal = document.createElement("span");
      spawnVal.id = "spawnSizeValue";
    }

    row3.appendChild(spawnLabel);
    row3.appendChild(spawnSlider);
    row3.appendChild(spawnVal);
    leftCol.appendChild(row3);

    // Row 4 placeholder
    leftCol.appendChild(document.createElement("div"));

    // RIGHT column: 3 sliders stacked
    const rightCol = document.createElement("div");
    rightCol.style.display = "flex";
    rightCol.style.flexDirection = "column";
    rightCol.style.gap = "6px";
    rightCol.style.flex = "0 0 420px";
    rightCol.style.minWidth = "240px";

    function makeSliderRow(id, labelText, min, max, defaultVal) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.flex = "1";

      // split label into main + parentheses
      const label = document.createElement("label");
      label.setAttribute("for", id);

      const match = labelText.match(/^([^(]+)(\(.*\))$/); // split at parentheses
      if (match) {
        const mainSpan = document.createElement("span");
        mainSpan.textContent = match[1].trim() + " ";
        const smallSpan = document.createElement("span");
        smallSpan.textContent = match[2];
        smallSpan.style.fontSize = "10px"; // smaller text in parentheses
        smallSpan.style.opacity = "0.7";   // optional subtle fade
        label.appendChild(mainSpan);
        label.appendChild(smallSpan);
      } else {
        label.textContent = labelText;
      }

      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = min;
      input.max = max;
      input.value = defaultVal;
      input.style.flex = "2";

      const value = document.createElement("div");
      value.id = `${id}Value`;
      value.style.width = "56px";
      value.style.textAlign = "right";
      value.style.fontSize = "12px";

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(value);

      return { row, input, value };
    }

    const w = makeSliderRow(
      "lineWidthSlider",
      "Width (CTRL + L/R)",
      1,
      1000,
      100,
    );
    const h = makeSliderRow(
      "lineHeightSlider",
      "Height (CTRL + U/D)",
      1,
      1000,
      4,
    );
    const a = makeSliderRow(
      "lineAngleSlider",
      "Angle (SHIFT + L/R)",
      0,
      360,
      0,
    );

    rightCol.appendChild(w.row);
    rightCol.appendChild(h.row);
    rightCol.appendChild(a.row);

    container.appendChild(leftCol);
    container.appendChild(rightCol);
    controlBox.appendChild(container);

    // store references
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

    // hide editor initially (no selection)
    this.elems.lineEditor.style.display = "none";
  }

  show(selector) {
    this.elems[selector].style.display = "flex";
  }

  hide(selector) {
    this.elems[selector].style.display = "none";
  }

  updateLobby(players) {
    this.elems.readyList.innerHTML = (players || [])
      .map((p) => {
        const status = p.inGame ? "In Game" : p.ready ? "Ready" : "Not ready";
        const color = p.inGame ? "#ffc107" : p.ready ? "#28a745" : "#dc3545";
        return `<li><span>${p.symbol} ${p.name}</span><span style="color:${color}; margin-left: 8px">${status}</span></li>`;
      })
      .join("");
  }

  // ui.js - updatePlayers (for side list)
  updatePlayers(players) {
    this.elems.playerList.innerHTML = players
      .map((p) => `<li><span>${p.symbol} ${p.name}</span></li>`)
      .join("");
  }

  setStatus(text) {
    this.elems.statusText.innerText = text;
  }

  setVote(count, total) {
    this.elems.voteStatus.innerText = `${count} / ${total} voted`;
  }

  showLobbyMessage(text) {
    const msg = this.elems.lobbyMessage;
    msg.innerText = text;
    msg.style.display = "block";
  }

  hideLobbyMessage() {
    this.elems.lobbyMessage.style.display = "none";
  }

  resetControls() {
    this.elems.readyCheckbox.checked = false;
    this.elems.voteCheckbox.checked = false;
    this.elems.chatInput.value = "";
  }

  appendChat({ name, message }) {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${name}:</strong> ${message}`;
    this.elems.chatMessages.appendChild(p);
    this.elems.chatMessages.scrollTop = this.elems.chatMessages.scrollHeight;
  }

  setEndReason(text) {
    const msg = this.elems.gameEndPopup.querySelector("p");
    if (msg) msg.innerText = text;
  }

  // Line editor helpers
  showLineEditor(line) {
    if (!line || !this.elems.lineEditor) return;
    this.elems.lineEditor.style.display = "flex";
    this.updateLineEditorValues(line);
  }

  hideLineEditor() {
    if (!this.elems.lineEditor) return;
    this.elems.lineEditor.style.display = "none";
  }

  updateLineEditorValues(line) {
    if (!line || !this.elems.lineEditor) {
      this.hideLineEditor();
      return;
    }
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
      this.elems.lineAngleSlider.value = String(a);
    if (this.elems.lineWidthValue)
      this.elems.lineWidthValue.innerText = String(w);
    if (this.elems.lineHeightValue)
      this.elems.lineHeightValue.innerText = String(h);
    if (this.elems.lineAngleValue)
      this.elems.lineAngleValue.innerText = String(a);
  }
}

export default new UI();
