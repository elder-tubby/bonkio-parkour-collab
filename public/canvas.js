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

    // canvas.js → draw()
    // canvas.js → draw()
    State.get("lines").forEach(({ id, start, end, symbol, type }) => {
      const isSelected = id === State.get("selectedLineId");

      // Determine base color
      let baseColor = "white";
      if (type === "death") baseColor = "red";
      else if (type === "bouncy")
        baseColor = `rgb(${(10994878 >> 16) & 0xff}, ${(10994878 >> 8) & 0xff}, ${10994878 & 0xff})`;

      if (isSelected) {
        // Outer yellow highlight
        ctx.lineWidth = 6;
        ctx.strokeStyle = "yellow";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // Inner line with original color
        ctx.lineWidth = 4;
        ctx.strokeStyle = baseColor;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else {
        // Normal line
        ctx.lineWidth = 4;
        ctx.strokeStyle = baseColor;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }

      // Username label
      if (symbol && !State.get("hideUsernames")) {
        ctx.fillStyle = isSelected ? "yellow" : "white";
        ctx.fillText(symbol, start.x + 5, start.y - 5);
      }
    });

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
    ctx.arc(x, y, diameter / 2 - 2, 0, 2 * Math.PI);
    ctx.strokeStyle = "limegreen";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label below circle
    ctx.fillStyle = "limegreen";
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
