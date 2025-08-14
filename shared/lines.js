// shared/lines.js

export function reorderLines(lines, id, toBack) {
  const copy = Array.isArray(lines) ? [...lines] : [];
  const idx = copy.findIndex(l => l.id === id);
  if (idx === -1) return copy;
  const [selected] = copy.splice(idx, 1);
  if (toBack) copy.unshift(selected);
  else copy.push(selected);
  return copy;
}
