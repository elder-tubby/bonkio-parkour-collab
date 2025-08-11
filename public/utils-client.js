// utils-client.js

import State from './state.js';

export function getHitLineId(pt) {
  const lines = State.get('lines');
  for (const { id, start, end, playerId } of lines) {
    if (playerId !== State.get('playerId')) continue;
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = Math.max(0, Math.min(1,
      ((pt.x - start.x)*dx + (pt.y - start.y)*dy) /
      (dx*dx + dy*dy)
    ));
    const proj = { x: start.x + t*dx, y: start.y + t*dy };
    if (Math.hypot(pt.x - proj.x, pt.y - proj.y) < 6) {
      return id;
    }
  }
  return null;
}

export function updateLineTypeUI(type) {
  const select = document.getElementById('lineTypeSelect');

  if (!select) return;

  switch (type) {
    case 'bouncy':
      select.style.backgroundColor = '#888'; // gray
      select.style.color = '#000'; // black text for contrast
      break;
    case 'death':
      select.style.backgroundColor = '#e53935'; // vivid red
      select.style.color = '#000'; // black text for contrast
      break;
    case 'none':
    default:
      select.style.backgroundColor = '#fff'; // white
      select.style.color = '#000'; // black text
      break;
  }
}



