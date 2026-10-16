// Navigate mode UI: GPS follow, snapping, voice, off-route reroute, wake lock, simulation.
import L from 'leaflet';
import { snap, OffRouteDetector, maneuverProgress, promptFor, promptText, Throttle, along, ARROWS, bearing } from './nav.js';
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const fmtDist = mi => mi >= 0.2 ? `${mi.toFixed(mi < 10 ? 1 : 0)} mi` : `${Math.max(0, Math.round(mi * 5280 / 50) * 50)} ft`;
export function startNav(ctx, { sim = false } = {}) {
  const { map } = ctx; let d = ctx.data(); if (!d) return;
  let muted = localStorage.navMute === '1', night = localStorage.navNight === '1', wake = null, watchId = null, simTimer = null, simOff = 0;
  let hint = null, spoken = new Map(), lastPos = null, speedMph = null, heading = 0, rerouting = false, follow = true, simMi = 0, simX = 4;
  const off = new OffRouteDetector(), rr = new Throttle(20000);
  // --- speech: unlock inside the Start tap (iOS)
  const synth = window.speechSynthesis; const say = t => { if (muted || !synth || !t) return; synth.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = 1; synth.speak(u); };
  if (synth) { const u = new SpeechSynthesisUtterance(muted ? ' ' : (sim ? 'Starting simulation' : 'Starting navigation')); u.volume = muted ? 0 : 1; synth.speak(u); }
  // --- DOM
  document.body.classList.add('navigating'); map.getContainer().classList.toggle('night', night);
  const ov = document.createElement('div'); ov.id = 'nav'; ov.innerHTML = `
    <div id="navTurn"><div id="navArrow">⬆</div><div><div id="navDist">—</div><div id="navStreet">Waiting for GPS…</div><div id="navThen"></div></div></div>
    <div id="navWarn"></div><div id="navAhead"></div>
    <div id="navBar"><div><b id="navEta">—</b><small>ETA</small></div><div><b id="navLeft">—</b><small>mi left</small></div><div><b id="navSpd">—</b><small>mph</small></div></div>
    <div id="navBtns"><button id="nbMute">${muted ? '🔇' : '🔊'}</button><button id="nbNight">${night ? '☀️' : '🌙'}</button><button id="nbCenter">🎯</button>
      ${sim ? '<button id="nbFast">⏩ x4</button><button id="nbOff">↪ Off-route</button>' : ''}<button id="nbExit">✕ End</button></div>`;
  document.body.append(ov); document.getElementById('actionBar')?.setAttribute('hidden', ''); map.invalidateSize(); setTimeout(() => map.invalidateSize(), 200);
  const $ = id => ov.querySelector('#' + id);
  const icon = () => L.divIcon({ className: 'navMe', html: `<div style="transform:rotate(${heading}deg)">▲</div>`, iconSize: [44, 44], iconAnchor: [22, 22] });
  const me = L.marker([d.route[0].lat, d.route[0].lng], { icon: icon(), zIndexOffset: 1000 }).addTo(map);
  const done = L.polyline([], { color: '#777', weight: 6 }).addTo(map);
  map.on('dragstart', () => follow = false);
  $('nbMute').onclick = () => { muted = !muted; localStorage.navMute = muted ? '1' : '0'; $('nbMute').textContent = muted ? '🔇' : '🔊'; if (muted) synth?.cancel(); };
  $('nbNight').onclick = () => { night = !night; localStorage.navNight = night ? '1' : '0'; map.getContainer().classList.toggle('night', night); $('nbNight').textContent = night ? '☀️' : '🌙'; };
  $('nbCenter').onclick = () => { follow = true; if (lastPos) map.setView([lastPos.lat, lastPos.lng], Math.max(map.getZoom(), 15)); };
  $('nbExit').onclick = stop;
  if (sim) { $('nbFast').onclick = () => { simX = simX === 4 ? 1 : simX === 1 ? 10 : 4; $('nbFast').textContent = `⏩ x${simX}`; };
    $('nbOff').onclick = () => { simOff = simOff ? 0 : 150; $('nbOff').textContent = simOff ? '↩ Back on route' : '↪ Off-route'; }; }
  // --- wake lock
  const warn = [];
  async function lock() { try { if ('wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); } else warn.push('Screen may sleep: this browser has no Wake Lock. Set Auto-Lock to Never while driving.'); }
    catch (e) { warn.push('Could not keep screen on (' + e.name + ').'); } showWarn(); }
  const onVis = () => { if (document.visibilityState === 'visible' && watchId != null || sim) lock(); };
  document.addEventListener('visibilitychange', onVis);
  function showWarn() { $('navWarn').innerHTML = [...warn, 'Navigation pauses if you switch apps or lock the phone. Keep this page on screen.'].map(w => `<div>${esc(w)}</div>`).join(''); setTimeout(() => $('navWarn').innerHTML = '', 9000); }
  lock();
  // --- fixes
  function onFix({ lat, lng, accuracy, speed, head }) {
    d = ctx.data(); const s = snap(d.route, lat, lng, hint); hint = s.seg;
    if (speed != null && speed >= 0) speedMph = speed * 2.23694;
    if (head != null && !isNaN(head)) heading = head; else if (lastPos) { const b = bearing(lastPos, { lat, lng }); if (Math.hypot(lat - lastPos.lat, lng - lastPos.lng) > 2e-5) heading = b; }
    lastPos = { lat, lng }; ctx.moving(speedMph > 5);
    me.setLatLng(s.offM < 30 ? [s.lat, s.lng] : [lat, lng]); me.setIcon(icon());
    if (follow) map.setView([lat, lng], map.getZoom() < 14 ? 16 : map.getZoom(), { animate: false });
    done.setLatLngs(d.route.slice(0, s.seg + 1).map(p => [p.lat, p.lng]));
    if (off.update({ offM: s.offM, accuracy }) && !rerouting && rr.ok()) return reroute(lat, lng);
    const p = maneuverProgress(d.maneuvers, s.cumMi); const m = p.next;
    $('navArrow').textContent = p.arrived ? '🏁' : (ARROWS[m.type] || '⬆'); $('navDist').textContent = p.arrived ? 'Arrived' : fmtDist(p.distMi);
    $('navStreet').textContent = m.streets?.[0] || m.instruction; const nx = d.maneuvers[p.index + 1]; $('navThen').textContent = nx && !p.arrived ? 'Then: ' + nx.instruction : '';
    const left = d.route.at(-1).cumMi - s.cumMi; const a = d.route[s.seg], b = d.route[s.seg + 1] || a; const posSec = a.cumSec + s.t * (b.cumSec - a.cumSec);
    const eta = new Date(Date.now() + (d.route.at(-1).cumSec - posSec) * 1000 / (sim ? simX : 1));
    $('navEta').textContent = eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); $('navLeft').textContent = Math.max(0, left).toFixed(left < 10 ? 1 : 0);
    $('navSpd').textContent = speedMph == null ? '—' : Math.round(speedMph);
    if (!spoken.has(p.index)) spoken.set(p.index, new Set()); const sp = spoken.get(p.index);
    const lvl = p.arrived ? null : promptFor(p.distMi, speedMph, sp); if (lvl) { sp.add(lvl); if (lvl === 'now') sp.add('near').add('far'); if (lvl === 'near') sp.add('far'); say(promptText(m, lvl, p.distMi)); }
    if (p.arrived && !spoken.has('arr')) { spoken.set('arr', 1); say('You have arrived.'); }
    const ahead = [...(d.work?.events || []).filter(e => e.mile > s.cumMi && e.mile - s.cumMi <= 10).map(e => `<div class="${e.closed ? 'crit' : 'warn'}">⚠ ${(e.mile - s.cumMi).toFixed(1)} mi · ${esc(e.kind)} ${esc(e.road)}</div>`),
      ...d.stops.filter(x => x.kind === 'fuel' && x.truck && x.cumMi > s.cumMi && x.cumMi - s.cumMi <= 10).slice(0, 3).map(x => `<div>⛽ ${(x.cumMi - s.cumMi).toFixed(1)} mi · ${esc(x.name)}</div>`)];
    $('navAhead').innerHTML = ahead.slice(0, 5).join('');
  }
  async function reroute(lat, lng) { rerouting = true; say('Recalculating.'); $('navStreet').textContent = 'Recalculating…';
    try { await ctx.reroute(lat, lng); hint = null; spoken = new Map(); off.reset(); simMi = 0; }
    catch (e) { $('navWarn').innerHTML = `<div class="crit">Reroute failed: ${esc(e.message)}</div>`; }
    finally { rerouting = false; } }
  // --- sources
  if (sim) { simTimer = setInterval(() => { d = ctx.data(); const r = d.route;
      const p = maneuverProgress(d.maneuvers, simMi); const cur = d.maneuvers[Math.max(0, p.index - 1)];
      const mph = Math.min(70, Math.max(20, cur?.sec ? cur.lengthMi / cur.sec * 3600 : 55));
      simMi = Math.min(r.at(-1).cumMi, simMi + mph / 3600 * simX);
      const q = along(r, simMi); let lat = q.lat, lng = q.lng;
      if (simOff) { const rad = (q.heading + 90) * Math.PI / 180; lat += simOff * Math.cos(rad) / 110540; lng += simOff * Math.sin(rad) / (111320 * Math.cos(lat * Math.PI / 180)); }
      onFix({ lat, lng, accuracy: 8, speed: mph / 2.23694, head: q.heading });
      if (simMi >= r.at(-1).cumMi) clearInterval(simTimer); }, 1000); }
  else if (!navigator.geolocation) { $('navStreet').textContent = 'This browser has no GPS access.'; }
  else watchId = navigator.geolocation.watchPosition(
    p => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, head: p.coords.heading }),
    e => { $('navWarn').innerHTML = `<div class="crit">GPS: ${esc(e.message)} ${e.code === 1 ? '— allow Location for this site in browser settings' : ''}</div>`; },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  function stop() { if (watchId != null) navigator.geolocation.clearWatch(watchId); clearInterval(simTimer); synth?.cancel();
    wake?.release?.().catch(() => {}); document.removeEventListener('visibilitychange', onVis);
    map.removeLayer(me); map.removeLayer(done); ov.remove(); document.body.classList.remove('navigating'); map.getContainer().classList.remove('night'); ctx.moving(false); map.invalidateSize(); ctx.exit(); }
}
