// canvas.js
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

    // helper to compute end based on width/angle if present
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

    State.get("lines").forEach(
      ({ id, start, end, symbol, type, width, height, angle }) => {
        const isSelected = id === State.get("selectedLineId");

        // compute drawing end using stored width/angle if present
        const drawEnd = computeEnd({ start, end, width, angle });

        // Determine base color
        let baseColor = "white";
        if (type === "death") baseColor = "red";
        else if (type === "bouncy")
          baseColor = `rgb(${(10994878 >> 16) & 0xff}, ${(10994878 >> 8) & 0xff}, ${10994878 & 0xff})`;

        // Map logical 'height' directly to visible stroke thickness (1 unit = 1 px)
        // clamp to reasonable maximum to avoid blowing canvas: allow up to 1000 px
        const rawHeight = typeof height === "number" ? height : 4; // default 4
        const visualThickness = Math.max(
          1,
          Math.min(1000, Math.round(rawHeight)),
        );

        ctx.save();

        if (isSelected) {
          // Outer highlight (slightly larger than visual thickness)
          ctx.lineWidth = Math.max(visualThickness + 4, 6);
          ctx.strokeStyle = "yellow";
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(drawEnd.x, drawEnd.y);
          ctx.stroke();

          // Inner main stroke with visualThickness
          ctx.lineWidth = visualThickness;
          ctx.strokeStyle = baseColor;
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(drawEnd.x, drawEnd.y);
          ctx.stroke();
        } else {
          ctx.lineWidth = visualThickness;
          ctx.strokeStyle = baseColor;
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(drawEnd.x, drawEnd.y);
          ctx.stroke();
        }

        // Username label
        if (symbol && !State.get("hideUsernames")) {
          ctx.fillStyle = isSelected ? "yellow" : "white";
          ctx.fillText(symbol, start.x + 5, start.y - 5);
        }

        ctx.restore();
      },
    );

    // Draw preview line if exists
    const preview = State.get("currentLine");
    if (preview) {
      ctx.strokeStyle = "white";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(preview.start.x, preview.start.y);
      ctx.lineTo(preview.end.x, preview.end.y);
      ctx.stroke();
    }

    // Draw shared spawn circle
    const { x, y, diameter } = State.get("spawnCircle");
    ctx.beginPath();
    ctx.arc(x, y, diameter / 2 - 1, 0, 2 * Math.PI);
    ctx.strokeStyle = "deepskyblue";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label below circle
    ctx.fillStyle = "deepskyblue";
    ctx.font = "9px Lexend";
    ctx.textAlign = "center";
    ctx.fillText("spawn", x, y + diameter / 2 + 8);

    const { x: czX, y: czY, width: czW, height: czH } = State.get("capZone");
    ctx.strokeStyle = "yellow";
    ctx.fillStyle = "yellow";
    ctx.lineWidth = 2;
    ctx.strokeRect(czX, czY, czW, czH);
    ctx.fillText("CZ", czX + czW / 2, czY + czH / 2 + 3);
  }
}

export default Canvas;
