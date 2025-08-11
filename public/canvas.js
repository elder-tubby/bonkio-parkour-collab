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
    State.get("lines").forEach(({ id, start, end, username, type }) => {
      const isSelected = id === State.get("selectedLineId");

      // 1) if selected → yellow
      // 2) else if death  → white
      // 3) else if bouncy → gray
      // 4) else           → red
      if (isSelected) {
        ctx.strokeStyle = "yellow";
        // ctx.fillStyle   = 'yellow';
        ctx.lineWidth = 6;
      } else {
        ctx.lineWidth = 4.452;
        if (type === "death") {
          ctx.strokeStyle = "red";
          ctx.fillStyle = "red";
        } else if (type === "bouncy") {
          ctx.strokeStyle = "gray";
          ctx.fillStyle = "gray";
        } else {
          ctx.strokeStyle = "white";
          ctx.fillStyle = "white";
        }
      }

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (username) {
        ctx.fillStyle = isSelected ? "yellow" : "white";
        ctx.fillText(username, start.x + 5, start.y - 5);
      }
    });

    // Draw shared spawn circle
    const { x, y, diameter } = State.get("spawnCircle");
    ctx.beginPath();
    ctx.arc(x, y, diameter / 2, 0, 2 * Math.PI);
    ctx.strokeStyle = "orange";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label below circle
    ctx.fillStyle = "orange";
    ctx.font = "9px Lexend";
    ctx.textAlign = "center";
    ctx.fillText("spawn", x, y + diameter / 2 + 12);

    const { x: czX, y: czY, width: czW, height: czH } = State.get("capZone");
    ctx.strokeStyle = "yellow";
    ctx.fillStyle = "yellow";
    ctx.lineWidth = 2;
    ctx.strokeRect(czX, czY, czW, czH);
    ctx.fillText("CZ", czX + czW / 2 - 8, czY + czH / 2 + 5);

  }
}

export default Canvas;
