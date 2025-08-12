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
  }

  show(selector) {
    this.elems[selector].style.display = "flex";
  }

  hide(selector) {
    this.elems[selector].style.display = "none";
  }

  updateLobby(players) {
    this.elems.readyList.innerHTML = players
      .map(
        (p) =>
          `<li><span>${p.symbol} ${p.name}</span><span class="${p.ready ? "status-green" : "status-red"}">${p.ready ? "Ready" : "Not ready"}</span></li>`,
      )
      .join("");
  }

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
}

export default new UI();
