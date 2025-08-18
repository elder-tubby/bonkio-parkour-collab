import { normalizeAngle } from "./utils-client.js";

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
  drawPolyBtn: "#drawPolyBtn",
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
    this.CONTROL_ELEMENT_WIDTH = "80px";

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
    // call signature kept compatible: (selected, optionalFlag)
    this.setLineSelectionVisible(false, true);
    this.setPolygonSelectionVisible(false);

    if (this.elems.lineEditor) {
      this.elems.lineEditor.style.fontSize = "12px";
      this.elems.lineEditor.style.fontFamily = "Lexend, system-ui, sans-serif";
    }

    // **FEATURE**: Create and append the tooltip element
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
      pointerEvents: "none", // Allows clicks to pass through
      zIndex: 1001,
      whiteSpace: "pre", // Preserves formatting
    });
    document.body.appendChild(tooltip);
    this.elems.tooltip = tooltip;
  }

  _createUnifiedObjectEditor() {
    const controlBox = document.querySelector(".control-box");
    if (!controlBox) return;

    // Clear existing controls (like original)
    controlBox.innerHTML = "";

    // Status
    const status = document.createElement("div");
    status.id = "status";
    status.innerText = "Draw by dragging on canvas";
    status.style.width = "100%";
    status.style.textAlign = "center";
    status.style.fontSize = "12px";
    status.style.whiteSpace = "nowrap";
    status.style.marginBottom = "8px";
    controlBox.appendChild(status);
    this.elems.statusText = status;

    // Container layout
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.justifyContent = "space-between";
    container.style.alignItems = "flex-start";
    container.style.gap = "12px";
    container.style.width = "100%";
    container.style.boxSizing = "border-box";

    // Left column (global controls + delete/type/order)
    const leftCol = document.createElement("div");
    leftCol.style.display = "flex";
    leftCol.style.flexDirection = "column";
    leftCol.style.gap = "8px";
    leftCol.style.width = "150px";

    // Draw polygon toggle
    const drawPolyBtn = document.createElement("button");
    drawPolyBtn.id = "drawPolyBtn";
    drawPolyBtn.textContent = "Draw Polygon (OFF)";
    drawPolyBtn.style.height = "22px";
    drawPolyBtn.style.padding = "4px";
    drawPolyBtn.style.fontSize = "12px";
    drawPolyBtn.style.marginBottom = "8px";
    this.elems.drawPolyBtn = drawPolyBtn;
    leftCol.appendChild(drawPolyBtn);

    // Map size slider row
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

    const spawnSlider = document.createElement("input");
    spawnSlider.type = "range";
    spawnSlider.id = "spawnSizeSlider";
    spawnSlider.min = "1";
    spawnSlider.max = "13";
    spawnSlider.value = "6";
    spawnSlider.style.flex = "1";
    spawnSlider.style.height = "20px";
    spawnSlider.style.marginRight = "0px";
    spawnSlider.style.minWidth = "150px";
    spawnSlider.style.maxWidth = "360px";

    const spawnVal = document.createElement("span");
    spawnVal.id = "spawnSizeValue";
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

    // Row: Paste map / Delete (line) / Type (line)
    const rowDelete = document.createElement("div");
    rowDelete.style.display = "flex";
    rowDelete.style.alignItems = "center";
    rowDelete.style.gap = "8px";
    rowDelete.style.width = "100%";
    rowDelete.style.justifyContent = "space-between";

    // Paste Map button
    const pasteBtn = document.createElement("button");
    pasteBtn.id = "pasteMapBtn";
    pasteBtn.textContent = "Paste Map";
    pasteBtn.title = "Paste map from clipboard";
    pasteBtn.setAttribute("aria-label", "Paste Map");
    pasteBtn.type = "button";
    pasteBtn.style.height = "22px";
    pasteBtn.style.padding = "4px 4px";
    pasteBtn.style.fontSize = "12px";
    pasteBtn.style.width = this.CONTROL_ELEMENT_WIDTH;

    // Delete button for lines
    const deleteLineBtn = document.createElement("button");
    deleteLineBtn.id = "deleteLineBtn";
    deleteLineBtn.disabled = true;
    deleteLineBtn.textContent = "Delete";
    deleteLineBtn.style.height = "22px";
    deleteLineBtn.style.padding = "4px 4px";
    deleteLineBtn.style.fontSize = "12px";
    deleteLineBtn.style.width = this.CONTROL_ELEMENT_WIDTH;
    deleteLineBtn.title = "Delete selected line";

    // Delete button for polys (separate DOM element, visually identical)
    const deletePolyBtn = document.createElement("button");
    deletePolyBtn.id = "deletePolyBtn";
    deletePolyBtn.disabled = true;
    deletePolyBtn.textContent = "Delete";
    deletePolyBtn.style.height = "22px";
    deletePolyBtn.style.padding = "4px 4px";
    deletePolyBtn.style.fontSize = "12px";
    deletePolyBtn.style.width = this.CONTROL_ELEMENT_WIDTH;
    deletePolyBtn.title = "Delete selected polygon";

    // Type select for lines
    const lineTypeSelect = document.createElement("select");
    lineTypeSelect.id = "lineTypeSelect";
    lineTypeSelect.disabled = true;
    lineTypeSelect.innerHTML = `<option value="none">None</option><option value="bouncy">Bouncy</option><option value="death">Death</option>`;
    lineTypeSelect.style.height = "22px";
    lineTypeSelect.style.fontSize = "12px";
    lineTypeSelect.style.width = this.CONTROL_ELEMENT_WIDTH;
    lineTypeSelect.title = "Line type";

    // Type select for polys
    const polyTypeSelect = document.createElement("select");
    polyTypeSelect.id = "polyTypeSelect";
    polyTypeSelect.disabled = true;
    polyTypeSelect.innerHTML = `<option value="none">None</option><option value="bouncy">Bouncy</option><option value="death">Death</option>`;
    polyTypeSelect.style.height = "22px";
    polyTypeSelect.style.fontSize = "12px";
    polyTypeSelect.style.width = this.CONTROL_ELEMENT_WIDTH;
    polyTypeSelect.title = "Polygon type";

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
    // For center, append both delete buttons but hide/show by selection state
    middleSlot.appendChild(deleteLineBtn);
    middleSlot.appendChild(deletePolyBtn);

    const rightSlot = document.createElement("div");
    rightSlot.style.display = "flex";
    rightSlot.style.alignItems = "center";
    rightSlot.style.justifyContent = "flex-end";
    rightSlot.style.width = "120px";
    // append both type selects; visibility controlled later
    rightSlot.appendChild(lineTypeSelect);
    rightSlot.appendChild(polyTypeSelect);

    rowDelete.appendChild(leftSlot);
    rowDelete.appendChild(middleSlot);
    rowDelete.appendChild(rightSlot);
    leftCol.appendChild(rowDelete);

    // Row: Order (move front/back) - separate pair for line and poly
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

    // For polygons: separate move label and buttons (so we can show/hide and keep wording)
    const polyOrderRow = rowOrder.cloneNode(true);
    const polyOrderLabel = polyOrderRow.querySelector("span");
    polyOrderLabel.innerText = "Move poly to:";
    polyOrderLabel.id = "polyOrderLabel";
    // create poly front/back as separate elements so selectors match
    const polyToFrontBtn = document.createElement("button");
    polyToFrontBtn.id = "polyToFrontBtn";
    polyToFrontBtn.textContent = "Front";
    polyToFrontBtn.style.width = this.CONTROL_ELEMENT_WIDTH;
    polyToFrontBtn.style.height = "22px";

    const polyToBackBtn = document.createElement("button");
    polyToBackBtn.id = "polyToBackBtn";
    polyToBackBtn.textContent = "Back";
    polyToBackBtn.style.width = this.CONTROL_ELEMENT_WIDTH;
    polyToBackBtn.style.height = "22px";

    // replace the cloned buttonGroup contents with these poly buttons
    const polyButtonsContainer = polyOrderRow.querySelector(
      "div:nth-child(2) div",
    );
    polyButtonsContainer.innerHTML = "";
    polyButtonsContainer.appendChild(polyToFrontBtn);
    polyButtonsContainer.appendChild(polyToBackBtn);

    leftCol.appendChild(polyOrderRow);

    // spacer
    leftCol.appendChild(document.createElement("div"));

    // Right column: sliders / angle / scale
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

      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = String(min);
      input.max = String(max);
      input.value = String(defaultVal);
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

      return { row, input, value, label };
    };

    // Line sliders (width, height, angle)
    const lineWidth = makeSliderRow(
      "lineWidthSlider",
      "Width (ALT + L/R)",
      1,
      1000,
      100,
    );
    const lineHeight = makeSliderRow(
      "lineHeightSlider",
      "Height (ALT + U/D)",
      1,
      1000,
      4,
    );
    const lineAngle = makeSliderRow(
      "lineAngleSlider",
      "Angle (SHIFT + L/R)",
      0,
      180,
      0,
    );

    // Polygon sliders: scale and angle (angle allowed 0-360 and shown above scale)
    const polyAngle = makeSliderRow(
      "polyAngleSlider",
      "Angle (SHIFT + L/R)",
      0,
      180,
      0,
    );
    const polyScale = makeSliderRow(
      "polyScaleSlider",
      "Scale (ALT + U/D)",
      10,
      500,
      100,
    );

    // append both sets; visibility toggled depending on selection
    // polygon wants angle row above scale: so append in that order
    rightCol.appendChild(lineWidth.row);
    rightCol.appendChild(lineHeight.row);
    rightCol.appendChild(lineAngle.row);

    // separate visual divider for poly controls
    const polyDivider = document.createElement("div");
    polyDivider.style.height = "8px";
    rightCol.appendChild(polyDivider);

    rightCol.appendChild(polyAngle.row);
    rightCol.appendChild(polyScale.row);

    container.appendChild(leftCol);
    container.appendChild(rightCol);
    controlBox.appendChild(container);

    // Assign to this.elems for access elsewhere
    // Line elements
    this.elems.lineEditor = rightCol;
    this.elems.lineWidthSlider = lineWidth.input;
    this.elems.lineHeightSlider = lineHeight.input;
    this.elems.lineAngleSlider = lineAngle.input;
    this.elems.lineWidthValue = lineWidth.value;
    this.elems.lineHeightValue = lineHeight.value;
    this.elems.lineAngleValue = lineAngle.value;
    this.elems.lineWidthRow = lineWidth.row;
    this.elems.lineHeightRow = lineHeight.row;
    this.elems.lineAngleRow = lineAngle.row;
    this.elems.deleteLineBtn = deleteLineBtn;
    this.elems.lineTypeSelect = lineTypeSelect;
    this.elems.toFrontBtn = toFrontBtn;
    this.elems.toBackBtn = toBackBtn;
    this.elems.pasteMapBtn = pasteBtn;
    this.elems.orderLabel = orderLabel;

    // Poly elements
    this.elems.polyEditor = rightCol; // same visual editor container
    this.elems.deletePolyBtn = deletePolyBtn;
    this.elems.polyTypeSelect = polyTypeSelect;
    this.elems.polyScaleSlider = polyScale.input;
    this.elems.polyScaleValue = polyScale.value;
    this.elems.polyAngleSlider = polyAngle.input;
    this.elems.polyAngleValue = polyAngle.value;
    this.elems.polyToFrontBtn = polyToFrontBtn;
    this.elems.polyToBackBtn = polyToBackBtn;

    // other elements
    this.elems.drawPolyBtn = drawPolyBtn;
    this.elems.spawnSizeSlider = spawnSlider;
    this.elems.spawnSizeValue = spawnVal;
    this.elems.copyMapBtn = this.elems.copyMapBtn || null;
    this.elems.copyLineInfoBtn = this.elems.copyLineInfoBtn || null;
    this.elems.popupCloseBtn = this.elems.popupCloseBtn || null;

    // default initial visibility: hide poly-specific elements
    // (they will be shown when setPolygonSelectionVisible(true) is called)
    this._hidePolyControlsImmediate();
    this._hideLineControlsImmediate();
  }

  // helpers to hide groups immediately (no toggling logic)
  _hidePolyControlsImmediate() {
    const keys = [
      "deletePolyBtn",
      "polyTypeSelect",
      "polyScaleSlider",
      "polyScaleValue",
      "polyAngleSlider",
      "polyAngleValue",
      "polyToFrontBtn",
      "polyToBackBtn",
    ];
    for (const k of keys) {
      const el = this.elems[k];
      if (!el) continue;
      // element might be a row or value div
      if (el.style) el.style.display = "none";
      if ("disabled" in el) el.disabled = true;
    }
  }

  _hideLineControlsImmediate() {
    const keys = [
      "deleteLineBtn",
      "lineTypeSelect",
      "orderLabel",
      "toFrontBtn",
      "toBackBtn",
      "lineWidthRow",
      "lineHeightRow",
      "lineAngleRow",
    ];
    for (const k of keys) {
      const el = this.elems[k];
      if (!el) continue;
      if (el.style) el.style.display = "none";
      if ("disabled" in el) el.disabled = true;
    }
  }

  show(selectorKey) {
    this._setDisplay(selectorKey, this.DISPLAY.PANEL);
  }
  hide(selectorKey) {
    this._setDisplay(selectorKey, this.DISPLAY.HIDDEN);
  }

  showObjectEditor(object) {
    if (!object) {
      this.setLineSelectionVisible(false);
      this.setPolygonSelectionVisible(false);
      return;
    }
    if (object.type === "line") {
      this.setPolygonSelectionVisible(false);
      this.setLineSelectionVisible(true);
      this.updateLineEditorValues(object);
    } else if (object.type === "poly") {
      this.setLineSelectionVisible(false);
      this.setPolygonSelectionVisible(true);
      this.updatePolygonEditorValues(object);
    }
  }

  // kept second parameter for backward compatibility
  setLineSelectionVisible(selected, _keepStatusHidden = false) {
    const show = Boolean(selected);
    const panelDisplay = show ? this.DISPLAY.PANEL : this.DISPLAY.HIDDEN;

    // Show the common editor container (right column) only when either mode is active.
    if (this.elems.lineEditor)
      this.elems.lineEditor.style.display = panelDisplay;

    // statusText is hidden when an object is selected (original behaviour)
    if (this.elems.statusText)
      this.elems.statusText.style.display = show
        ? this.DISPLAY.HIDDEN
        : "block";

    // Show/hide line-specific controls
    this.LINE_CONTROLS.forEach((k) => {
      const el = this.elems[k];
      if (!el) return;
      el.style.display = show ? this.DISPLAY.CONTROL : this.DISPLAY.HIDDEN;
      if ("disabled" in el) el.disabled = !show;
    });

    // Show/hide slider rows for lines (width/height/angle)
    const sliderRows = [
      ["lineWidthSlider", "lineWidthRow"],
      ["lineHeightSlider", "lineHeightRow"],
      ["lineAngleSlider", "lineAngleRow"],
    ];
    for (const [sliderKey, rowKey] of sliderRows) {
      if (this.elems[rowKey])
        this.elems[rowKey].style.display = show ? "flex" : this.DISPLAY.HIDDEN;
      if (this.elems[sliderKey]) this.elems[sliderKey].disabled = !show;
    }

    // Hide polygon controls when showing lines
    this.POLY_CONTROLS.forEach((k) => {
      const el = this.elems[k];
      if (!el) return;
      // angle/scale rows may be rows or inputs
      if (el.style) el.style.display = this.DISPLAY.HIDDEN;
      if ("disabled" in el) el.disabled = true;
    });

    // ensure delete button text for lines visible
    if (this.elems.deleteLineBtn)
      this.elems.deleteLineBtn.style.display = show
        ? "inline-flex"
        : this.DISPLAY.HIDDEN;
  }

  setPolygonSelectionVisible(selected) {
    const show = Boolean(selected);
    const display = show ? "flex" : "none";

    // Use same right column
    if (this.elems.polyEditor)
      this.elems.polyEditor.style.display = show
        ? this.DISPLAY.PANEL
        : this.DISPLAY.HIDDEN;

    // Show/hide polygon-specific controls
    this.POLY_CONTROLS.forEach((key) => {
      const el = this.elems[key];
      if (!el) return;
      // For the scale/angle rows we want "flex", otherwise "inline-flex" where appropriate
      if (
        key.endsWith("Row") ||
        key.endsWith("Slider") ||
        key.endsWith("Value") ||
        key.includes("Angle")
      ) {
        el.style.display = show ? "flex" : this.DISPLAY.HIDDEN;
      } else {
        el.style.display = show ? this.DISPLAY.CONTROL : this.DISPLAY.HIDDEN;
      }
      if ("disabled" in el) el.disabled = !show;
    });

    // Show poly-specific rows (polyAngle, polyScale)
    if (
      this.elems.polyAngleSlider &&
      this.elems.polyAngleSlider.parentElement
    ) {
      this.elems.polyAngleSlider.parentElement.style.display = show
        ? "flex"
        : this.DISPLAY.HIDDEN;
    }
    if (
      this.elems.polyScaleSlider &&
      this.elems.polyScaleSlider.parentElement
    ) {
      this.elems.polyScaleSlider.parentElement.style.display = show
        ? "flex"
        : this.DISPLAY.HIDDEN;
    }

    // Hide line controls when polygons are selected
    this.LINE_CONTROLS.forEach((k) => {
      const el = this.elems[k];
      if (!el) return;
      el.style.display = this.DISPLAY.HIDDEN;
      if ("disabled" in el) el.disabled = true;
    });
    if (this.elems.lineWidthRow)
      this.elems.lineWidthRow.style.display = this.DISPLAY.HIDDEN;
    if (this.elems.lineHeightRow)
      this.elems.lineHeightRow.style.display = this.DISPLAY.HIDDEN;
    if (this.elems.lineAngleRow)
      this.elems.lineAngleRow.style.display = this.DISPLAY.HIDDEN;

    // show/hide poly delete/type buttons explicitly
    if (this.elems.deletePolyBtn)
      this.elems.deletePolyBtn.style.display = show
        ? "inline-flex"
        : this.DISPLAY.HIDDEN;
    if (this.elems.polyTypeSelect)
      this.elems.polyTypeSelect.style.display = show
        ? "inline-flex"
        : this.DISPLAY.HIDDEN;
    if (this.elems.polyToFrontBtn)
      this.elems.polyToFrontBtn.style.display = show
        ? "inline-flex"
        : this.DISPLAY.HIDDEN;
    if (this.elems.polyToBackBtn)
      this.elems.polyToBackBtn.style.display = show
        ? "inline-flex"
        : this.DISPLAY.HIDDEN;
  }

  updateLineEditorValues(line) {
    if (!line) return this.setLineSelectionVisible(false);
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
    if (!poly) return this.setPolygonSelectionVisible(false);
    const angle = Math.round(poly.a ?? 0);
    // FIX: Server's scale is 1 by default. Multiply by 100 for the UI slider.
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
    // preserved as requested
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
