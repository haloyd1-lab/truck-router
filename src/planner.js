// Planning pipeline. Calls public CORS-enabled services directly (works on static hosting).
// `base` = where the static road-work JSON lives (import.meta.env.BASE_URL in the browser).
const IS_NODE = typeof window === 'undefined';
const UA = IS_NODE ? { 'User-Agent': 'TruckRouter/0.3 (github.com/haloyd1-lab/truck-router)' } : {}; // browsers send their own UA + Referer
const VALHALLA = 'https://valhalla1.openstreetmap.de/route', NOMINATIM = 'https://nominatim.openstreetmap.org/search',
  PHOTON = 'https://photon.komoot.io/api/', OVERPASS = 'https://overpass-api.de/api/interpreter';
let lastGeo = 0; const geoCache = new Map();
const pause = ms => new Promise(r => setTimeout(r, ms));
import { decodePolyline6, cumulate, filterToCorridor, chunkBoxes, MI_PER_KM } from './geo.js';
import { truckCosting } from './units.js';
export const BRANDS = /pilot|flying j|love'?s|kwik (trip|star)|casey|travel ?centers|\bta\b|petro|bosselman|road ranger|sapp bros|speedway|cenex|kum ?& ?go/i;
// rough state bounding boxes [s,w,n,e] to decide which road-work feeds to query
const STATES = { IA: [40.37, -96.64, 43.51, -90.14], MN: [43.49, -97.24, 49.39, -89.49], WI: [42.49, -92.89, 47.31, -86.25],
  IL: [36.97, -91.52, 42.51, -87.02], NE: [39.99, -104.06, 43.0, -95.31], SD: [42.48, -104.06, 45.95, -96.44], MO: [35.99, -95.77, 40.61, -89.1] };
async function j(label, url, opt = {}) { let r;
  try { r = await fetch(url, { ...opt, headers: { ...UA, ...(opt.headers || {}) } }); } catch (e) { throw new Error(`${label}: network/CORS error (${e.message}). The public server may be down.`); }
  let b; try { b = await r.json(); } catch { b = {}; }
  if (!r.ok) { const e = new Error(`${label} → HTTP ${r.status}${r.status === 429 ? ' (rate limited — wait a minute)' : ''}: ${b.error || b.error_message || b.remark || ''}`.trim()); e.status = r.status; throw e; } return b; }
export async function geocode(base, q) {
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q)) { const [lat, lon] = q.split(',').map(Number); return { lat, lon, label: q }; }
  const key = q.trim().toLowerCase(); if (geoCache.has(key)) return geoCache.get(key);
  const wait = lastGeo + 1100 - Date.now(); if (wait > 0) await pause(wait); lastGeo = Date.now(); // Nominatim policy: max 1 req/s
  let hit;
  try { const r = await j('Nominatim', NOMINATIM + '?' + new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: 'us,ca' }));
    if (r.length) hit = { lat: +r[0].lat, lon: +r[0].lon, label: r[0].display_name }; } catch { /* fall back to Photon */ }
  if (!hit) { const r = await j('Photon', PHOTON + '?' + new URLSearchParams({ q, limit: '1', lat: '42.5', lon: '-92.5' }));
    const f = r.features?.[0]; if (f) hit = { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: [f.properties.name, f.properties.state].filter(Boolean).join(', ') }; }
  if (!hit) throw new Error('Address not found: ' + q);
  geoCache.set(key, hit); return hit; }
let lastVal = 0;
const valhalla = async (base, body) => { const w = lastVal + 1500 - Date.now(); if (w > 0) await pause(w); lastVal = Date.now();
  return j('Valhalla', VALHALLA, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); };

export async function plan(base, { places, profile, avoidTolls, departISO }) {
  const locations = places.map((p, i) => ({ lat: p.lat, lon: p.lon, type: i === 0 || i === places.length - 1 ? 'break' : 'break' }));
  const body = { locations, costing: 'truck', costing_options: { truck: truckCosting(profile, avoidTolls) }, units: 'miles', directions_options: { units: 'miles' } };
  if (departISO) body.date_time = { type: 1, value: departISO.slice(0, 16) };
  const truck = await valhalla(base, body);
  const trip = truck.trip; let route = [], cumSec = 0, mi0 = 0; const legs = [], maneuvers = [];
  for (const [li, leg] of trip.legs.entries()) {
    const pts = cumulate(decodePolyline6(leg.shape)); const legMi = pts.at(-1).cumMi || 1, base0 = route.length;
    pts.forEach(q => route.push({ ...q, cumMi: q.cumMi + mi0, cumSec: cumSec + leg.summary.time * q.cumMi / legMi }));
    legs.push({ leg: li + 1, miles: leg.summary.length, sec: leg.summary.time, has_toll: leg.summary.has_toll, has_ferry: leg.summary.has_ferry,
      has_highway: leg.summary.has_highway, has_time_restrictions: leg.summary.has_time_restrictions });
    for (const m of leg.maneuvers) maneuvers.push({ instruction: m.instruction, mile: route[base0 + m.begin_shape_index]?.cumMi, lengthMi: m.length,
      toll: !!m.toll, ferry: !!m.ferry, streets: m.street_names || [] });
    cumSec += leg.summary.time; mi0 = route.at(-1).cumMi;
  }
  const totalMi = trip.summary.length; const notices = [];
  if (trip.summary.has_time_restrictions) notices.push({ sev: 'warn', text: 'Valhalla reports time-restricted road segments on this route (has_time_restrictions).' });
  for (const l of legs) { if (l.has_toll) notices.push({ sev: 'warn', text: `Leg ${l.leg} uses toll roads (has_toll). Toll amount not available in free mode.` });
    if (l.has_ferry) notices.push({ sev: 'warn', text: `Leg ${l.leg} uses a ferry (has_ferry).` }); }
  // car comparison: does truck routing change the path?
  let car = null;
  try { const c = await valhalla(base, { ...body, costing: 'auto', costing_options: { auto: { use_tolls: body.costing_options.truck.use_tolls } } });
    car = { miles: c.trip.summary.length, sec: c.trip.summary.time };
    const diff = (totalMi - car.miles) / car.miles;
    if (Math.abs(diff) > 0.02) notices.push({ sev: 'warn', text: `Truck route differs from car route: truck ${totalMi.toFixed(1)} mi vs car ${car.miles.toFixed(1)} mi (${(diff * 100).toFixed(0)}%). Truck restrictions or truck penalties in OSM likely moved the route — check why.` });
    else notices.push({ sev: 'ok', text: `Truck route is about the same length as the car route (${car.miles.toFixed(1)} mi) — no OSM truck restriction forced a detour.` });
  } catch (e) { notices.push({ sev: 'warn', text: 'Car-route comparison failed: ' + e.message }); }
  return { route, totalMi, cumSec, legs, maneuvers, notices, car, raw: trip.summary };
}

export async function findStops(base, route) {
  const total = route.at(-1).cumMi; const boxes = chunkBoxes(route, Math.max(40, total / 8), 3.5);
  const q = (t, f, b) => `${t}${f}(${b.join(',')});`;
  const parts = boxes.flatMap(b => ['node', 'way'].flatMap(t => [q(t, '["amenity"="fuel"]', b), q(t, '["highway"="rest_area"]', b), q(t, '["amenity"="parking"]["hgv"~"yes|designated"]', b)]));
  const query = `[out:json][timeout:60];(${parts.join('')});out center tags;`;
  let r;
  for (let a = 0; a < 3; a++) { try { r = await j('Overpass', OVERPASS, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) }); break; }
    catch (e) { if (a === 2 || ![429, 502, 503, 504].includes(e.status)) throw e; await pause(4000 * (a + 1)); } }
  const seen = new Map();
  for (const e of r.elements || []) { const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon; if (lat == null) continue; const t = e.tags || {};
    const kind = t.amenity === 'fuel' ? 'fuel' : t.highway === 'rest_area' ? 'rest' : 'parking';
    const name = t.name || t.brand || (kind === 'rest' ? 'Rest area' : kind === 'parking' ? 'Truck parking' : 'Fuel station');
    const truck = kind === 'fuel' && (t.hgv === 'yes' || t.hgv === 'designated' || t.truck_stop === 'yes' || t['fuel:HGV_diesel'] === 'yes' || BRANDS.test(name + ' ' + (t.brand || '')));
    seen.set(e.type + e.id, { id: e.type[0] + e.id, name, brand: t.brand, kind, truck, lat, lng }); }
  return { stops: filterToCorridor(route, [...seen.values()], 3), queries: 1, boxes: boxes.length };
}

const FEED_STATES = ['IA', 'MN', 'WI'];
const NO_FEED = { IL: 'No free road-work feed for IL (state feeds need an API key); check gettingaroundillinois.com',
  NE: 'No free road-work feed checked for NE; check 511.nebraska.gov', SD: 'No free road-work feed checked for SD; check sd511.org', MO: 'No free road-work feed checked for MO; check traveler.modot.org' };
function inBox(f, [s, w, n, e]) { const g = f.geometry; if (!g) return false;
  const flat = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates;
  return flat.some(([lo, la]) => la >= s && la <= n && lo >= w && lo <= e); }
export async function roadWork(base, route) {
  const lats = route.map(p => p.lat), lngs = route.map(p => p.lng);
  const bb = [Math.min(...lats) - 0.1, Math.min(...lngs) - 0.1, Math.max(...lats) + 0.1, Math.max(...lngs) + 0.1];
  const states = Object.entries(STATES).filter(([, [s, w, n, e]]) => !(bb[0] > n || bb[2] < s || bb[1] > e || bb[3] < w)).map(([k]) => k);
  // only states that the route actually touches (sample points against rough bbox)
  const touched = states.filter(st => { const [s, w, n, e] = STATES[st]; return route.some((p, i) => i % 20 === 0 && p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e); });
  const r = { events: [], feeds: {} };
  for (const st of touched) {
    if (!FEED_STATES.includes(st)) { r.feeds[st] = { ok: false, note: NO_FEED[st] || `No free road-work feed for ${st}; check that state's 511 site` }; continue; }
    try { const fc = await j(`${st} road-work snapshot`, `${base}roadwork/${st}.json`);
      const hits = fc.features.filter(f => inBox(f, bb));
      r.feeds[st] = { ok: true, name: fc.feed, updated: fc.fetched, total: fc.features.length, inBox: hits.length };
      hits.forEach(f => r.events.push({ state: st, feed: fc.feed, geometry: f.geometry, ...f.properties }));
    } catch (e) { r.feeds[st] = { ok: false, note: e.message }; } }
  const items = r.events.map(ev => { const g = ev.geometry; const c = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates;
    const near = c.map(([lng, lat]) => ({ lng, lat })); return { ...ev, lat: near[0].lat, lng: near[0].lng, pts: near }; });
  // corridor filter: any vertex of the event within 0.5 mi of route
  const hits = [];
  for (const it of items) { let best = null; for (const p of it.pts) { const [h] = filterToCorridor(route, [p], 0.5); if (h && (!best || h.offMi < best.offMi)) best = h; }
    if (!best) continue; const cd = it.core_details || {};
    const vi = it.vehicle_impact || ''; const closed = /all-lanes-closed/.test(vi) || /road (is )?closed|closed to (all )?traffic|detour in effect/i.test(cd.description || '');
    const kind = closed ? 'closure' : /some-lanes-closed|alternating-one-way|lanes-shifted|reduced/.test(vi) ? 'lane restriction' : 'construction';
    hits.push({ state: it.state, feed: it.feed, mile: best.cumMi, lat: best.lat, lng: best.lng, kind, closed, vehicle_impact: vi,
      type: cd.event_type, road: (cd.road_names || []).join(', '), direction: cd.direction, description: cd.description,
      start: it.start_date, end: it.end_date, restrictions: it.restrictions }); }
  hits.sort((a, b) => a.mile - b.mile);
  return { events: hits, feeds: r.feeds, states: touched };
}
