// Canvas drawing logic
import State from "./state.js";
import UI from "./ui.js";

class Canvas {
  static draw() {
    const { canvas, ctx } = UI.elems;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 4.452;
    ctx.strokeStyle = "white";
    ctx.font = "12px Lexend";
    ctx.fillStyle = "white";
    ctx.textAlign = "left";

    const computeEnd = (line) => {
      if (typeof line.width === "number" && typeof line.angle === "number") {
        const r = (line.angle * Math.PI) / 180;
        return {
          x: line.start.x + Math.cos(r) * line.width,
          y: line.start.y + Math.sin(r) * line.width,
        };
      }
      return line.end;
    };

    // Draw all committed lines from the main state
    const lines = State.get("lines");
    lines.forEach(
      ({ id, start, end, symbol, type, width, height, angle }, index) => {
        // Don't draw the original version of the line being dragged
        const preview = State.get("draggingPreview");
        if (preview && preview.originalLine.id === id) {
          return;
        }

        const isSelected = id === State.get("selectedLineId");
        const drawEnd = computeEnd({ start, end, width, angle });
        let baseColor = "white";
        if (type === "death") baseColor = "red";
        else if (type === "bouncy") baseColor = `rgb(168, 162, 158)`;

        const visualThickness = Math.max(
          1,
          Math.min(1000, Math.round(height ?? 4)),
        );

        ctx.save();
        if (isSelected) {
          ctx.lineWidth = Math.max(visualThickness + 4, 6);
          ctx.strokeStyle = "yellow";
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(drawEnd.x, drawEnd.y);
          ctx.stroke();
        }

        ctx.lineWidth = visualThickness;
        ctx.strokeStyle = baseColor;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(drawEnd.x, drawEnd.y);
        ctx.stroke();

        if (symbol && !State.get("hideUsernames")) {
          const label = `${index + 1} ${symbol}`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = "black";
          ctx.strokeText(label, start.x + 5, start.y - 5);
          ctx.fillStyle = isSelected ? "yellow" : "#ccc";
          ctx.fillText(label, start.x + 5, start.y - 5);
        }
        ctx.restore();
      },
    );

    // --- FIX for Dragging Preview (Problem 1) ---
    // If a line is being dragged, draw its temporary position.
    const preview = State.get("draggingPreview");
    if (preview && preview.line) {
      const { start, end } = preview.line;
      ctx.save();
      ctx.globalAlpha = 0.6; // Make it slightly transparent
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = Math.max(
        1,
        Math.min(1000, Math.round(preview.line.height ?? 4)),
      );
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw preview for a new line being created
    const currentLine = State.get("currentLine");
    if (currentLine) {
      ctx.save();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(currentLine.start.x, currentLine.start.y);
      ctx.lineTo(currentLine.end.x, currentLine.end.y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw shared spawn circle
    const spawnCircle = State.get("spawnCircle");
    if (spawnCircle) {
      const { x, y, diameter } = spawnCircle;
      ctx.beginPath();
      ctx.arc(x, y, diameter / 2, 0, 2 * Math.PI);
      ctx.strokeStyle = "deepskyblue";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "deepskyblue";
      ctx.font = "9px Lexend";
      ctx.textAlign = "center";
      ctx.fillText("spawn", x, y + diameter / 2 + 12);
    }

    // Draw capture zone
    const capZone = State.get("capZone");
    if (capZone && capZone.x !== null) {
      const { x, y, width, height } = capZone;
      ctx.strokeStyle = "yellow";
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = "yellow";
      ctx.fillText("CZ", x + width / 2, y + height / 2 + 3);
    }
  }
}

export default Canvas;
