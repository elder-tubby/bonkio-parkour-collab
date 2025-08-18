// splitConvex.js
// Strict poly-decomp-only implementation.
// Throws a clear error if poly-decomp is not present (no fallback).

/**
 * Split a single concave polygon-like shape into convex polygon shapes.
 * Requires the poly-decomp UMD global to be loaded (decomp or polyDecomp).
 *
 * Input shape:
 *  { v: [ [x,y], ... ], s?, a?, c? }
 *
 * Output: array of { type:'po', v: [ [x,y], ... ], s, a, c }
 */
export function splitConcaveIntoConvex(shape) {
  // detect the poly-decomp global (UMD builds expose `decomp`; some builds expose `polyDecomp`)
  const pd = window.decomp || window.polyDecomp || window.polyDecompES || window.polyDecompLib;

  if (!pd || (typeof pd.makeCCW !== 'function' && typeof pd.quickDecomp !== 'function' && typeof pd.decomp !== 'function')) {
    throw new Error(
      'poly-decomp library not found. Include the UMD build before your module script, for example:\n\n' +
      '<script src="https://cdn.jsdelivr.net/npm/poly-decomp@0.2.1/build/decomp.min.js"></script>\n' +
      '<script type="module" src="app.js"></script>\n\n' +
      'Make sure the poly-decomp <script> appears *before* your module script so the global is available when the module executes.'
    );
  }

  // normalize input vertices
  const inPoly = (shape && Array.isArray(shape.v) ? shape.v.map(p => [Number(p[0]), Number(p[1])]) : []);
  if (inPoly.length < 3) return [];

  // prefer makeCCW if available
  if (typeof pd.makeCCW === 'function') pd.makeCCW(inPoly);

  // choose decomposition function that definitely comes from poly-decomp
  const decompFn = typeof pd.quickDecomp === 'function' ? pd.quickDecomp : pd.decomp;

  if (typeof decompFn !== 'function') {
    // This should not happen because we checked earlier — fail loudly.
    throw new Error('poly-decomp is present but does not expose quickDecomp or decomp.');
  }

  // run decomposition (this is poly-decomp's algorithm)
  const convexes = decompFn(inPoly.slice());

  // remove collinear points if library exposes that helper
  if (Array.isArray(convexes) && convexes.length > 0 && typeof pd.removeCollinearPoints === 'function') {
    for (let i = 0; i < convexes.length; i++) {
      pd.removeCollinearPoints(convexes[i], 0); // 0 tolerance -> strict removal
    }
  }

  // map results into your shape format
  const out = (convexes || []).map(poly =>
    ({
      type: 'po',
      v: poly.map(p => [Number(p[0]), Number(p[1])]),
      s: shape.s ?? 1,
      a: shape.a ?? 0,
      c: shape.c ?? [0, 0]
    })
  );

  console.log(out);

  return out;
}
