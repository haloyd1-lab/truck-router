export const MI_PER_KM = 0.621371;
export function haversineMi(a, b) { const R = 3958.8, r = Math.PI / 180;
  const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)); }
// Valhalla shape = Google encoded polyline with 6-digit precision
export function decodePolyline6(str) { let i = 0, lat = 0, lng = 0; const out = [];
  while (i < str.length) { for (const k of [0, 1]) { let res = 0, sh = 0, b;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1; if (k === 0) lat += d; else lng += d; }
    out.push([lat / 1e6, lng / 1e6]); } return out; }
export function cumulate(pts) { let c = 0; return pts.map((p, i) => { if (i) c += haversineMi(pts[i - 1], p); return { lat: p[0], lng: p[1], cumMi: c }; }); }
// distance (mi) from point to segment, local equirectangular approx (fine at <50 mi scale)
function segDist(p, a, b) { const k = Math.cos(p.lat * Math.PI / 180) * 69.172, K = 69.0;
  const ax = (a.lng - p.lng) * k, ay = (a.lat - p.lat) * K, bx = (b.lng - p.lng) * k, by = (b.lat - p.lat) * K;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t }; }
// route [{lat,lng,cumMi}] -> {offMi, cumMi} of closest point on polyline
export function locateOnRoute(route, lat, lng) { const p = { lat, lng }; let best = { offMi: Infinity, cumMi: 0 };
  for (let i = 1; i < route.length; i++) { const a = route[i - 1], b = route[i];
    if (Math.abs(a.lat - lat) > 0.6 && Math.abs(b.lat - lat) > 0.6) continue;
    const { d, t } = segDist(p, a, b); if (d < best.offMi) best = { offMi: d, cumMi: a.cumMi + t * (b.cumMi - a.cumMi) }; }
  if (route.length === 1) best = { offMi: haversineMi([lat, lng], [route[0].lat, route[0].lng]), cumMi: 0 };
  return best; }
export function filterToCorridor(route, items, maxMi = 3) {
  return items.map(it => ({ ...it, ...locateOnRoute(route, it.lat, it.lng) })).filter(it => it.offMi <= maxMi).sort((a, b) => a.cumMi - b.cumMi); }
// split route into chunk bboxes of ~chunkMi, padded by padMi -> [s,w,n,e]
export function chunkBoxes(route, chunkMi = 60, padMi = 3) { const boxes = []; let cur = null, start = 0;
  for (const p of route) { if (!cur || p.cumMi - start > chunkMi) { if (cur) boxes.push(cur); cur = [p.lat, p.lng, p.lat, p.lng]; start = p.cumMi; }
    cur = [Math.min(cur[0], p.lat), Math.min(cur[1], p.lng), Math.max(cur[2], p.lat), Math.max(cur[3], p.lng)]; }
  if (cur) boxes.push(cur); const dLa = padMi / 69, dLo = padMi / 50;
  return boxes.map(([s, w, n, e]) => [s - dLa, w - dLo, n + dLa, e + dLo].map(v => +v.toFixed(4))); }
export function pointAtMi(route, mi) { return route.find(p => p.cumMi >= mi) || route[route.length - 1]; }
