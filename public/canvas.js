// canvas.js
// Canvas drawing logic
import State from "./state.js";
import UI from "./ui.js";

class Canvas {
    static draw() {
    const { canvas, ctx } = UI.elems;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 4;
    ctx.strokeStyle = "white";
    ctx.font = "12px Lexend";
    ctx.fillStyle = "white";
    ctx.textAlign = "left";

    // canvas.js → draw()
    // canvas.js → draw()
    State.get('lines').forEach(({ id, start, end, username, type }) => {
      const isSelected = (id === State.get('selectedLineId'));

      // 1) if selected → yellow
      // 2) else if death  → white
      // 3) else if bouncy → gray
      // 4) else           → red
      if (isSelected) {
        ctx.strokeStyle = 'yellow';
        // ctx.fillStyle   = 'yellow';
        ctx.lineWidth   = 6;
      } else {
        ctx.lineWidth   = 4;
        if (type === 'death') {
          ctx.strokeStyle = 'red';
          ctx.fillStyle   = 'red';
        } else if (type === 'bouncy') {
          ctx.strokeStyle = 'gray';
          ctx.fillStyle   = 'gray';
        } else {
          ctx.strokeStyle = 'white';
          ctx.fillStyle   = 'white';
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

    const cz = State.get("capZone");
    if (cz) {
      const { x, y, size } = cz;
      ctx.strokeStyle = "yellow";
      ctx.fillStyle = "yellow";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, size, size);
      ctx.fillText("CZ", x + size / 2 - 8, y + size / 2 + 5);
    }

    // At the end of Canvas.draw()
    const gameActive = State.get("gameActive");
    const isHoldingS = State.get("isHoldingS");
    const mouse = State.get("mouse");

    if (gameActive && isHoldingS && mouse) {
      const RADIUS = 9; // tweak radius as needed

      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, RADIUS, 0, 2 * Math.PI);
      ctx.strokeStyle = "cyan";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "cyan";
      ctx.font = "12px Lexend";
      ctx.textAlign = "center";
      ctx.fillText("jumper", mouse.x, mouse.y + RADIUS + 12);
    }
  }
}

export default Canvas;
