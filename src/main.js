import L from 'leaflet'; import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png'; import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'; import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
delete L.Icon.Default.prototype._getIconUrl; L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl }); // bundle default icons via Vite
export const BUILD = '2026-10-16-scales1';
import { plan, findStops, roadWork, geocode, weighStations } from './planner.js';
import { startNav } from './navui.js';
import { filterToCorridor } from './geo.js';
import { fuelEstimate, optimizeFuelStops, hosPlan } from './fuel.js';
const $ = id => document.getElementById(id); const BASE = import.meta.env.BASE_URL;
const PRESETS = {
  semi: { gvw: 80000, axleWt: 34000, hFt: 13, hIn: 6, wFt: 8, wIn: 6, lenFt: 72, trlFt: 53, axles: 5, trailers: 1, hazmat: false },
  bob:  { gvw: 20000, axleWt: 12000, hFt: 13, hIn: 6, wFt: 8, wIn: 6, lenFt: 22, trlFt: 0, axles: 3, trailers: 0, hazmat: false },
};
const FUEL_DEF = { mpg: 6.5, tank: 300, curPct: 80, resPct: 15, price: '' };
const state = { last: null, prices: JSON.parse(localStorage.prices || '{}') };
const KEYS = Object.keys(PRESETS.semi);
function setProfile(p) { KEYS.forEach(k => k === 'hazmat' ? ($('hazmat').checked = !!p.hazmat) : ($(k).value = p[k] ?? PRESETS.semi[k])); }
function getProfile() { return Object.fromEntries(KEYS.map(k => [k, k === 'hazmat' ? $('hazmat').checked : +$(k).value])); }
const getFuel = () => Object.fromEntries(Object.keys(FUEL_DEF).map(k => [k, $(k).value === '' ? '' : +$(k).value]));
setProfile(JSON.parse(localStorage.profile || 'null') || PRESETS.semi);
const f0 = { ...FUEL_DEF, ...JSON.parse(localStorage.fuel || '{}') }; for (const k in f0) $(k).value = f0[k];
$('hos').checked = localStorage.hos === '1'; $('scalesOn').checked = localStorage.scalesOn !== '0';
const save = () => { localStorage.profile = JSON.stringify(getProfile()); localStorage.fuel = JSON.stringify(getFuel()); localStorage.hos = $('hos').checked ? '1' : '0'; localStorage.scalesOn = $('scalesOn').checked ? '1' : '0'; };
document.addEventListener('change', e => { save(); if (state.last && ['mpg','tank','curPct','resPct','price','hos','allFuel','scalesOn'].includes(e.target.id)) render(); });
$('presetSemi').onclick = () => { setProfile(PRESETS.semi); save(); };
$('presetBob').onclick = () => { setProfile(PRESETS.bob); save(); };
$('addStop').onclick = () => { const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = '<input class="via" placeholder="Stop (city, address or lat,lng)"><button type="button">✕</button>';
  d.querySelector('button').onclick = () => d.remove(); $('stops').append(d); };
$('depart').value = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

const map = L.map('map').setView([42.96, -91.81], 8);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routing © Valhalla/FOSSGIS' }).addTo(map);
const layer = L.layerGroup().addTo(map);
const fixSize = () => setTimeout(() => map.invalidateSize(), 150);
addEventListener('resize', fixSize); addEventListener('orientationchange', fixSize); addEventListener('load', fixSize); fixSize();
// mobile bottom action bar (Start / Simulate) shown once a route exists
const bar = document.createElement('div'); bar.id = 'actionBar'; bar.hidden = true;
bar.innerHTML = '<button id="barGo">▶ Start</button><button id="barSim">🚚 Simulate</button><button id="barForm">☰ Trip</button>';
document.body.append(bar);
bar.querySelector('#barGo').onclick = () => startNav(navCtx, { sim: false });
bar.querySelector('#barSim').onclick = () => startNav(navCtx, { sim: true });
bar.querySelector('#barForm').onclick = () => { document.querySelectorAll('#panel details').forEach(x => x.open = true); $('panel').scrollIntoView({ behavior: 'smooth' }); };
const isMobile = () => matchMedia('(max-width: 800px)').matches;
const status = t => $('out').innerHTML = `<div class="card">${t}</div>`;

$('plan').onclick = async () => {
  $('plan').disabled = true; layer.clearLayers();
  try {
    status('Looking up addresses (OpenStreetMap Nominatim, 1 per second)…');
    const names = [$('origin').value, ...[...document.querySelectorAll('.via')].map(e => e.value).filter(v => v.trim()), $('dest').value];
    const places = []; for (const n of names) places.push(await geocode(BASE, n));
    status('Routing truck (Valhalla, FOSSGIS public server)…');
    const r = await plan(BASE, { places, profile: getProfile(), avoidTolls: $('avoidTolls').checked, departISO: $('depart').value });
    state.last = { ...r, places, stops: [], work: null }; render();
    bar.hidden = false; if (isMobile()) { document.querySelectorAll('#panel details').forEach(x => x.open = false); scrollTo({ top: 0, behavior: 'smooth' }); } fixSize();
    status2('Finding fuel / truck stops (Overpass)…');
    try { const f = await findStops(BASE, r.route); state.last.stops = f.stops; state.last.scalesRaw = f.scalesRaw;
      state.last.scales = await weighStations(BASE, r.route, f.scalesRaw, f.stops); } catch (e) { state.last.stopErr = e.message; }
    try { state.last.work = await roadWork(BASE, r.route); } catch (e) { state.last.workErr = e.message; }
    render();
  } catch (e) { $('out').innerHTML = `<div class="card crit">Could not plan: ${e.message}<br><small>Routes come only from the public Valhalla server. If it's down or rate-limited, wait a minute and retry. No route is faked.</small></div>`; }
  finally { $('plan').disabled = false; }
};
const status2 = t => { const d = document.createElement('div'); d.className = 'card'; d.id = 'loading'; d.textContent = t; $('out').prepend(d); };
const hm = s => `${Math.floor(s / 3600)}h ${Math.round(s % 3600 / 60)}m`;
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const day = s => s ? new Date(s).toLocaleDateString() : '?';

function render() {
  const d = state.last; layer.clearLayers();
  const line = L.polyline(d.route.map(p => [p.lat, p.lng]), { color: '#2f9cff', weight: 5 }).addTo(layer); map.fitBounds(line.getBounds(), { padding: [20, 20] });
  d.places.forEach((p, i) => L.marker([p.lat, p.lon]).bindPopup(i ? (i === d.places.length - 1 ? 'Destination' : 'Stop ' + i) : 'Start').addTo(layer));
  const f = getFuel(); const est = fuelEstimate({ miles: d.totalMi, mpg: f.mpg, pricePerGal: f.price || 0 });
  const fuelStops = d.stops.filter(s => s.kind === 'fuel' && ($('allFuel').checked || s.truck)).map(s => ({ ...s, price: state.prices[s.id] }));
  const opt = optimizeFuelStops({ totalMi: d.totalMi, mpg: f.mpg, tankGal: f.tank, startPct: f.curPct, reservePct: f.resPct, stops: fuelStops });
  const hos = $('hos').checked ? hosPlan({ route: d.route, stops: d.stops.filter(s => s.kind !== 'fuel' || s.truck), totalSec: d.cumSec }) : [];
  opt.plan.forEach(s => L.marker([s.lat, s.lng], { title: s.name }).bindPopup(`⛽ ${esc(s.name)}<br>mile ${s.mile.toFixed(0)} · buy ${s.buyGal.toFixed(0)} gal`).addTo(layer));
  const ev = d.work?.events || [];
  const sc = $('scalesOn').checked ? d.scales : null;
  const scIcon = (t, cls) => L.divIcon({ className: 'scaleIcon ' + cls, html: t, iconSize: [30, 30], iconAnchor: [15, 15] });
  if (sc) { sc.stations.forEach(x => L.marker([x.lat, x.lng], { icon: scIcon('⚖', 'st') }).bindPopup(`<b>${esc(x.name)}</b><br>${esc(x.road || '')} · ${esc(x.label)}<br>${x.facilityStatus ? 'WisDOT facility status: ' + esc(x.facilityStatus) + ' (not live)<br>' : ''}Status unknown — watch the signs / PrePass or Drivewyze apps<br><small>${esc(x.source)}</small>`).addTo(layer));
    sc.publics.forEach(x => L.marker([x.lat, x.lng], { icon: scIcon('⚖', 'pub') }).bindPopup(`<b>${esc(x.name)}</b> ${x.ref ? '#' + esc(x.ref) : ''}<br>${esc(x.operator || '')} · ${x.offMi.toFixed(1)} mi off route`).addTo(layer)); }
  ev.forEach(e => L.circleMarker([e.lat, e.lng], { radius: 8, color: e.closed ? '#ff3b3b' : '#ffb347' }).bindPopup(`<b>${esc(e.kind)}</b> ${esc(e.road)}<br>${day(e.start)} – ${day(e.end)}<br>${esc(e.description).slice(0, 400)}`).addTo(layer));
  const tollLegs = d.legs.filter(l => l.has_toll), tollMan = d.maneuvers.filter(m => m.toll);
  const feedNotes = d.work ? Object.entries(d.work.feeds).map(([st, fd]) => fd.ok ? `<li class="ok">${st}: ${esc(fd.name)} — ${ev.filter(e => e.state === st).length} on route</li>` : `<li class="warn">${st}: ${esc(fd.note)}</li>`).join('') : '';
  const simOn = new URLSearchParams(location.search).has('sim');
  $('out').innerHTML = `
  <div class="navStart"><button id="navGo">▶ Start</button><button id="navSim" style="background:#555">${simOn ? '▶ Simulate' : 'Simulate'}</button></div>
  <div class="card"><b>${d.totalMi.toFixed(0)} mi</b> · <b>${hm(d.cumSec)}</b> drive (Valhalla estimate, no live traffic)<br>
   Tolls: ${tollLegs.length ? `<span class="warn">route uses toll roads on leg ${tollLegs.map(l => l.leg).join(', ')}</span> — toll amount not available in free mode` : 'no toll segments flagged'}<br>
   Ferry: ${d.legs.some(l => l.has_ferry) ? '<span class="warn">yes</span>' : 'no'} · Fuel: ${est.gallons.toFixed(0)} gal${f.price ? ` · $${est.cost.toFixed(2)} @ $${(+f.price).toFixed(2)}` : ' (enter $/gal for cost)'}</div>
  <div class="card"><b>Restriction notices</b><ul>${d.notices.map(n => `<li class="${n.sev}">${esc(n.text)}</li>`).join('')}
   <li class="warn">Valhalla applied your height/width/length/weight/axle limits where OSM has them tagged, but it does not list individual restrictions in the response.</li></ul></div>
  <div class="card"><b>Construction / closures on route (${ev.length})</b>${d.workErr ? `<div class="crit">${esc(d.workErr)}</div>` : ''}<ul>${feedNotes}</ul>
   <ul>${ev.map(e => `<li class="${e.closed ? 'crit' : 'warn'}">mi ${e.mile.toFixed(0)} [${e.state}] <b>${esc(e.kind)}</b> ${esc(e.road)} ${esc(e.direction || '')} · ${day(e.start)}–${day(e.end)}<br><small>${esc(e.description).slice(0, 300)}</small></li>`).join('') || (d.work ? '<li class="ok">None reported by free feeds</li>' : '<li>loading…</li>')}</ul></div>
  <div class="card"><b>Suggested fuel stops</b>${d.stopErr ? `<div class="crit">Stops: ${esc(d.stopErr)}</div>` : ''}
   ${opt.plan.length ? `<ol>${opt.plan.map(s => `<li>mile ${s.mile.toFixed(0)} — ${esc(s.name)}: arrive ~${s.arriveGal.toFixed(0)} gal, buy ${s.buyGal.toFixed(0)} gal${s.cost ? ` ($${s.cost.toFixed(2)})` : ''} <small>(${s.reason})</small></li>`).join('')}</ol>` : '<div class="ok">No fuel stop needed above reserve.</div>'}
   ${opt.warnings.map(w => `<div class="crit">${esc(w)}</div>`).join('')}
   <details><summary>Stops within 3 mi of route (${d.stops.length}: ${d.stops.filter(s => s.truck).length} truck fuel, ${d.stops.filter(s => s.kind === 'fuel').length} fuel, ${d.stops.filter(s => s.kind === 'rest').length} rest areas, ${d.stops.filter(s => s.kind === 'parking').length} truck parking)</summary>
   ${d.stops.map(s => `<div class="row"><span style="flex:2">mi ${s.cumMi.toFixed(0)} ${s.truck ? '★' : ''} ${esc(s.name)} <small>${s.kind} · ${s.offMi.toFixed(1)} mi off</small></span>${s.kind === 'fuel' ? `<input style="flex:1" type="number" step="0.01" placeholder="$/gal" data-stop="${s.id}" value="${state.prices[s.id] ?? ''}">` : ''}</div>`).join('')}</details>
   <small>★ = tagged hgv/truck stop or a known truck-stop brand in OSM. OSM does not say if a semi fits the lot — verify.</small></div>
  ${sc ? `<div class="card"><b>⚖ Weigh stations on route (${sc.stations.length})</b>
   <ul>${sc.stations.map(x => `<li>mi ${x.cumMi.toFixed(0)} — ${esc(x.name)} ${x.road ? '· ' + esc(x.road) : ''} · ${x.side} side · <span class="${x.verified ? 'ok' : 'warn'}">${esc(x.label)}</span>${x.facilityStatus ? ` · WisDOT facility: ${esc(x.facilityStatus)} (not live)` : ''}<br><small>Status unknown — watch the signs / PrePass or Drivewyze apps · ${esc(x.source)}</small></li>`).join('') || '<li>None found on this route in OSM / state data.</li>'}</ul>
   ${sc.hidden.length ? `<details><summary>${sc.hidden.length} hidden (opposite direction)</summary>${sc.hidden.map(x => `<div>mi ${x.cumMi.toFixed(0)} ${esc(x.name)} — ${esc(x.label)}</div>`).join('')}</details>` : ''}
   <b>Public scales near route (${sc.publics.length})</b><ul>${sc.publics.map(x => `<li>mi ${x.cumMi.toFixed(0)} — ${esc(x.name)}${x.ref ? ' #' + esc(x.ref) : ''} ${x.operator ? '@ ' + esc(x.operator) : ''} <small>(${x.offMi.toFixed(1)} mi off)</small></li>`).join('') || '<li>None tagged in OSM.</li>'}</ul>
   <small>${sc.notes.map(esc).join('<br>')}<br>${sc.ignored} untagged OSM scales skipped (often grain elevators / private).</small></div>` : ''}
  ${hos.length ? `<div class="card"><b>HOS (planning aid only — not an ELD)</b><ul>${hos.map(h => `<li class="warn">${h.label} — by mile ${h.byMile.toFixed(0)}${h.stop ? `: ${esc(h.stop.name)} (mile ${h.stop.cumMi.toFixed(0)})` : ': no stop found before this point'}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><b>Turn list</b><ol>${d.maneuvers.map(m => {
    const w = ev.filter(e => Math.abs(e.mile - m.mile) < 2);
    return `<li>${esc(m.instruction)} <small>· mi ${m.mile?.toFixed(0) ?? '?'}${m.lengthMi ? ` · then ${m.lengthMi.toFixed(1)} mi` : ''}</small>${m.toll ? ' <span class="warn">💲 toll</span>' : ''}${m.ferry ? ' <span class="warn">⛴ ferry</span>' : ''}${w.map(e => ` <span class="${e.closed ? 'crit' : 'warn'}">⚠ ${esc(e.kind)}</span>`).join('')}</li>`; }).join('')}</ol></div>`;
  $('navGo').onclick = () => startNav(navCtx, { sim: false });
  $('navSim').onclick = () => startNav(navCtx, { sim: true });
  document.querySelectorAll('[data-stop]').forEach(i => i.onchange = () => { const v = parseFloat(i.value);
    if (v > 0) state.prices[i.dataset.stop] = v; else delete state.prices[i.dataset.stop]; localStorage.prices = JSON.stringify(state.prices); render(); });
}

// ---------- Navigate mode glue ----------
const navCtx = {
  map, data: () => state.last, scalesOn: () => $('scalesOn').checked,
  moving: on => document.body.classList.toggle('moving', !!on),
  exit: () => { render(); bar.hidden = false; fixSize(); },
  async reroute(lat, lng) { // from current position to remaining stops, same truck profile
    const d = state.last; const s = filterToCorridor(d.route, [{ lat, lng }], 1e9)[0];
    const remaining = d.places.slice(1).filter((p, i) => (d.legs[i]?.endMi ?? Infinity) > (s?.cumMi ?? 0) + 0.2);
    const places = [{ lat, lon: lng }, ...(remaining.length ? remaining : [d.places.at(-1)])];
    const r = await plan(BASE, { places, profile: getProfile(), avoidTolls: $('avoidTolls').checked });
    const stops = filterToCorridor(r.route, d.stops.map(({ lat, lng, ...x }) => ({ ...x, lat, lng })), 3);
    const events = d.work ? filterToCorridor(r.route, d.work.events.map(e => ({ ...e })), 0.5) : [];
    layer.clearLayers(); L.polyline(r.route.map(p => [p.lat, p.lng]), { color: '#2f9cff', weight: 6 }).addTo(layer);
    let scales = d.scales; try { if (d.scalesRaw) scales = await weighStations(BASE, r.route, d.scalesRaw, stops); } catch {}
    state.last = { ...d, ...r, places, stops, scales, work: d.work ? { ...d.work, events } : null };
  },
};
if (new URLSearchParams(location.search).has('sim')) document.title += ' (sim)';
