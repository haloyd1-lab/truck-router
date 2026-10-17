// Weigh stations & public scales: classification, corridor filter, direction-of-travel logic (pure, unit tested).
import { bearing } from './nav.js';
import { haversineMi } from './geo.js';
const DIRS = { N: 0, NB: 0, NORTH: 0, NORTHBOUND: 0, E: 90, EB: 90, EAST: 90, EASTBOUND: 90, S: 180, SB: 180, SOUTH: 180, SOUTHBOUND: 180, W: 270, WB: 270, WEST: 270, WESTBOUND: 270 };
export const PUBLIC_RE = /\bcat\b|cat scale|certified|pilot|flying j|love'?s|travel ?cent|\bta\b|petro|kwik (trip|star)|casey|bosselman|sapp|one9|road ranger|truck ?stop|iowa 80/i;
const ENF_RE = /weigh station|port of entry|\bdot\b|state patrol|scale house|enforcement|swef|inspection/i;
export const angDiff = (a, b) => { const d = Math.abs(((a - b) % 360) + 360) % 360; return d > 180 ? 360 - d : d; };
export function parseDir(s) { if (!s) return null; const t = String(s).toUpperCase().replace(/[^A-Z-]/g, '');
  if (/BI-?DIRECTIONAL|BOTH/.test(t)) return 'both'; if (t in DIRS) return DIRS[t]; return null; }
/** Classify an OSM element (tags) -> 'public' | 'station' | 'candidate' | null (ignored: likely private/industrial) */
export function classifyOsm(tags, nearTruckStop) {
  const txt = [tags.name, tags.brand, tags.operator].filter(Boolean).join(' ');
  if (PUBLIC_RE.test(txt) || (tags.amenity === 'weighbridge' && nearTruckStop)) return 'public';
  if (tags.highway === 'weigh_station' || ENF_RE.test(txt)) return 'station';
  if (tags.service === 'weigh_station') return nearTruckStop ? 'public' : 'candidate';
  return null; }
/** Route heading at nearest point and which side the point lies on (US right-hand traffic). */
export function sideOf(route, lat, lng) { let best = { d: Infinity };
  for (let i = 1; i < route.length; i++) { const a = route[i - 1], b = route[i];
    const k = Math.cos(lat * Math.PI / 180) * 69.172, ax = (a.lng - lng) * k, ay = (a.lat - lat) * 69, bx = (b.lng - lng) * k, by = (b.lat - lat) * 69;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + t * dx, ay + t * dy); if (d < best.d) best = { d, i, t, cross: dx * (-ay) - dy * (-ax) }; }
  const a = route[best.i - 1], b = route[best.i]; return { offMi: best.d, cumMi: a.cumMi + best.t * (b.cumMi - a.cumMi), heading: bearing(a, b), side: best.cross > 0 ? 'left' : 'right' }; }
/**
 * Decide whether a station serves our direction.
 * dirDeg: official/OSM direction (deg) or 'both' or null; wayBearing: bearing of a oneway approach way, or null.
 * returns { show, verified, label }
 */
export function directionCheck({ heading, side, offMi, dirDeg = null, wayBearing = null }) {
  if (dirDeg === 'both') return { show: true, verified: true, label: 'both directions' };
  const ref = dirDeg ?? wayBearing;
  if (ref != null) { const d = angDiff(heading, ref);
    if (d <= 60) return { show: true, verified: true, label: 'your direction' };
    if (d >= 120) return { show: false, verified: true, label: 'opposite direction' };
    return { show: true, verified: false, label: 'direction unverified' }; }
  if (side === 'left' && offMi * 1609 > 30) return { show: false, verified: false, label: 'likely opposite direction (unverified)' };
  return { show: true, verified: false, label: 'direction unverified' }; }
/** Build lists from OSM elements + official features. */
export function buildScales(route, { osm = [], official = [], truckStops = [] }, { stationMi = 0.5, publicMi = 3 } = {}) {
  const stations = [], hidden = [], publics = []; let ignored = 0;
  const nearTS = (lat, lng) => truckStops.some(s => haversineMi([lat, lng], [s.lat, s.lng]) < 0.15);
  for (const o of official) { const s = sideOf(route, o.lat, o.lng); if (s.offMi > stationMi) continue;
    const dc = directionCheck({ ...s, dirDeg: parseDir(o.direction) });
    const rec = { ...o, ...s, ...dc, source: o.source, kind: 'station' }; (dc.show ? stations : hidden).push(rec); }
  for (const e of osm) { const cls = classifyOsm(e.tags || {}, nearTS(e.lat, e.lng)); if (!cls) { ignored++; continue; }
    const s = sideOf(route, e.lat, e.lng);
    if (cls === 'public') { if (s.offMi <= publicMi) publics.push({ ...e, ...s, kind: 'public', name: e.tags.name || e.tags.brand || 'Truck scale', operator: e.tags.operator, ref: e.tags.ref }); continue; }
    if (s.offMi > stationMi) continue;
    if (stations.concat(hidden).some(x => haversineMi([x.lat, x.lng], [e.lat, e.lng]) < 0.3)) continue; // official record wins
    const dc = directionCheck({ ...s, dirDeg: parseDir(e.tags.direction), wayBearing: e.wayBearing ?? null });
    const rec = { ...e, ...s, ...dc, kind: 'station', name: e.tags.name || (cls === 'candidate' ? 'Weigh station (OSM service road, unconfirmed)' : 'Weigh station'),
      road: e.tags.ref || '', source: 'OpenStreetMap' }; (dc.show ? stations : hidden).push(rec); }
  // dedupe publics (CAT node + its lane way)
  const pub = []; for (const p of publics.sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0))) if (!pub.some(q => haversineMi([q.lat, q.lng], [p.lat, p.lng]) < 0.15)) pub.push(p);
  const by = (a, b) => a.cumMi - b.cumMi;
  return { stations: stations.sort(by), hidden: hidden.sort(by), publics: pub.sort(by), ignored }; }
export function scalePrompt(st, distMi) { return `Weigh station in ${distMi >= 1.5 ? '2 miles' : '1 mile'}${st.verified || st.side === 'right' ? ` on the ${st.side}` : ''}.`; }
