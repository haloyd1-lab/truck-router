// Pure navigation logic (unit tested): snapping, off-route detection, maneuver progress, voice prompts.
const M_PER_MI = 1609.344;
function proj(p, a, b) { const k = Math.cos(p.lat * Math.PI / 180) * 111320, K = 110540;
  const ax = (a.lng - p.lng) * k, ay = (a.lat - p.lat) * K, bx = (b.lng - p.lng) * k, by = (b.lat - p.lat) * K;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return { offM: Math.hypot(ax + t * dx, ay + t * dy), t }; }
/** Snap to route [{lat,lng,cumMi}]. hint = last segment index; searches a forward-biased window first, then whole route. */
export function snap(route, lat, lng, hint = null, windowPts = 400) {
  const p = { lat, lng }; let best = null;
  const scan = (from, to) => { for (let i = Math.max(1, from); i < Math.min(route.length, to); i++) {
    const a = route[i - 1], b = route[i], r = proj(p, a, b);
    if (!best || r.offM < best.offM) best = { seg: i - 1, t: r.t, offM: r.offM, cumMi: a.cumMi + r.t * (b.cumMi - a.cumMi),
      lat: a.lat + r.t * (b.lat - a.lat), lng: a.lng + r.t * (b.lng - a.lng) }; } };
  if (hint != null) scan(hint - 20, hint + windowPts);
  if (!best || best.offM > 100) scan(1, route.length);
  if (route.length === 1) best = { seg: 0, t: 0, offM: proj(p, route[0], route[0]).offM, cumMi: 0, lat: route[0].lat, lng: route[0].lng };
  return best; }
/** Off route after `need` consecutive good fixes farther than maxOffM. Fixes worse than maxAccM are ignored. */
export class OffRouteDetector {
  constructor({ maxOffM = 60, need = 3, maxAccM = 50 } = {}) { Object.assign(this, { maxOffM, need, maxAccM, count: 0 }); }
  update({ offM, accuracy }) { if (accuracy == null || accuracy > this.maxAccM) return false; // ignore bad fix
    if (offM > this.maxOffM) this.count++; else this.count = 0; return this.count >= this.need; }
  reset() { this.count = 0; } }
/** Next maneuver after progress `cumMi` (maneuvers sorted by mile). */
export function maneuverProgress(maneuvers, cumMi, eps = 0.01) {
  const i = maneuvers.findIndex(m => m.mile > cumMi + eps);
  if (i < 0) return { index: maneuvers.length - 1, next: maneuvers.at(-1), distMi: 0, arrived: true };
  return { index: i, next: maneuvers[i], distMi: maneuvers[i].mile - cumMi, arrived: false }; }
/** Which prompt to speak now. Highway: 1 mi, 0.5 mi, at turn. Town (<45 mph): 0.5 mi, 0.15 mi, at turn. */
export function promptFor(distMi, speedMph, spoken = new Set()) {
  const town = speedMph != null && speedMph < 45;
  const levels = town ? [['far', 0.5, 0.35], ['near', 0.15, 0.08], ['now', 0.03, 0]] : [['far', 1.0, 0.75], ['near', 0.5, 0.3], ['now', 0.06, 0]];
  // speak the closest-level prompt whose window we're in and that hasn't been spoken
  for (let k = levels.length - 1; k >= 0; k--) { const [lvl, hi, lo] = levels[k]; if (distMi <= hi && distMi >= lo && !spoken.has(lvl)) return lvl; }
  return null; }
export function promptText(m, lvl, distMi) {
  const d = distMi >= 0.9 ? 'In 1 mile' : distMi >= 0.4 ? 'In a half mile' : distMi >= 0.1 ? `In ${Math.round(distMi * 5280 / 100) * 100} feet` : '';
  if (lvl === 'now') return m.pre || m.instruction;
  return `${d}, ${(m.alert || m.instruction || '').replace(/\.$/, '')}`; }
export class Throttle { constructor(ms) { this.ms = ms; this.t = -Infinity; } ok(now = Date.now()) { if (now - this.t < this.ms) return false; this.t = now; return true; } }
export function bearing(a, b) { const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r),
  x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360; }
/** Point at cumulative mile along route (for simulation). */
export function along(route, mi) { if (mi <= 0) return { ...route[0], seg: 0 };
  for (let i = 1; i < route.length; i++) if (route[i].cumMi >= mi) { const a = route[i - 1], b = route[i], t = (mi - a.cumMi) / ((b.cumMi - a.cumMi) || 1);
    return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng), cumMi: mi, seg: i - 1, heading: bearing(a, b) }; }
  return { ...route.at(-1), seg: route.length - 2 }; }
export const ARROWS = { 1: '⬆', 2: '⬆', 3: '⬆', 4: '🏁', 5: '🏁', 6: '🏁', 7: '⬆', 8: '⬆', 9: '↗', 10: '➡', 11: '↘', 12: '↩', 13: '↩', 14: '↙', 15: '⬅', 16: '↖', 17: '⬆', 18: '↗', 19: '↖', 20: '↗', 21: '↖', 22: '⬆', 23: '↗', 24: '↖', 25: '⬆', 26: '🔄', 27: '🔄' };
export { M_PER_MI };
