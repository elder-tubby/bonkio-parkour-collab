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

    const objects = State.get("objects");
    const preview = State.get("draggingPreview");

    // --- Draw all objects (Lines and Polygons) ---
    objects.forEach((obj, index) => {
      if (preview && preview.originalObjects?.some((p) => p.id === obj.id)) {
        return; // Skip drawing the original object while its preview is being dragged
      }

      const isSelected = State.isSelected(obj.id);

      if (obj.type === "poly") {
        const { v, c, a, polyType, symbol, scale } = obj;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate((a * Math.PI) / 180);
        ctx.scale(scale || 1, scale || 1);

        let baseColor = "rgb(255, 255, 255)";
        if (polyType === "death") baseColor = "rgb(255, 0, 0)";
        else if (polyType === "bouncy") baseColor = "rgb(167, 196, 190)";
        ctx.fillStyle = baseColor;

        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) {
          ctx.lineTo(v[i].x, v[i].y);
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = isSelected ? "yellow" : "white";
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.stroke();
        ctx.restore();

        if (symbol && !State.get("hideUsernames")) {
          ctx.save();
          const label = `${index + 1} ${symbol}`;
          ctx.fillStyle = isSelected ? "yellow" : "#ccc";
          ctx.strokeStyle = "black";
          ctx.lineWidth = 3;
          ctx.strokeText(label, c.x, c.y);
          ctx.fillText(label, c.x, c.y);
          ctx.restore();
        }
      } else if (obj.type === "line") {
        const { start, end, symbol, lineType, width, height, angle } = obj;
        const computeEnd = (line) => {
          if (
            typeof line.width === "number" &&
            typeof line.angle === "number"
          ) {
            const r = (line.angle * Math.PI) / 180;
            return {
              x: line.start.x + Math.cos(r) * line.width,
              y: line.start.y + Math.sin(r) * line.width,
            };
          }
          return line.end;
        };

        const drawEnd = computeEnd({ start, end, width, angle });
        let baseColor = "white";
        if (lineType === "death") baseColor = "red";
        else if (lineType === "bouncy") baseColor = `rgb(167, 196, 190)`;

        const visualThickness = Math.max(1, Math.round(height ?? 4));

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
      }
    });

    // --- Draw Dragging Previews ---
    if (preview && preview.objects) {
      preview.objects.forEach((p_obj) => {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "yellow";

        if (p_obj.type === "line") {
          const { start, end, height } = p_obj;
          ctx.lineWidth = Math.max(1, Math.round(height ?? 4));
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        } else if (p_obj.type === "poly") {
          const { v, c, a, scale } = p_obj;
          ctx.translate(c.x, c.y);
          ctx.rotate((a * Math.PI) / 180);
          ctx.scale(scale || 1, scale || 1);
          ctx.lineWidth = 3;
          ctx.fillStyle = "rgba(255, 255, 0, 0.5)";

          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let i = 1; i < v.length; i++) {
            ctx.lineTo(v[i].x, v[i].y);
          }
          ctx.closePath();

          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    // --- Draw new shape in progress ---
    const drawingShape = State.get("drawingShape");
    if (drawingShape) {
      if (drawingShape.type === "line") {
        ctx.save();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(drawingShape.start.x, drawingShape.start.y);
        ctx.lineTo(drawingShape.end.x, drawingShape.end.y);
        ctx.stroke();
        ctx.restore();
      } else if (
        drawingShape.type === "poly" &&
        drawingShape.vertices.length > 0
      ) {
        const { vertices } = drawingShape;
        ctx.save();
        ctx.strokeStyle = "cyan";
        ctx.lineWidth = 2;

        // Draw existing segments
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.stroke();

        // **FIX**: Draw dynamic line from the LAST vertex to the mouse.
        if (vertices.length > 0) {
            const mouse = State.get("mouse");
            ctx.beginPath();
            ctx.moveTo(
              vertices[vertices.length - 1].x,
              vertices[vertices.length - 1].y,
            );
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
        }

        // Draw starting point circle
        ctx.fillStyle = "cyan";
        ctx.beginPath();
        ctx.arc(vertices[0].x, vertices[0].y, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
      }
    }

    // --- Draw Marquee Selection Box ---
    const selectionBox = State.get("selectionBox");
    if (selectionBox) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 150, 255, 0.2)";
      ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.fillRect(
        selectionBox.x,
        selectionBox.y,
        selectionBox.width,
        selectionBox.height,
      );
      ctx.strokeRect(
        selectionBox.x,
        selectionBox.y,
        selectionBox.width,
        selectionBox.height,
      );
      ctx.restore();
    }

    // --- Draw Map Objects ---
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
