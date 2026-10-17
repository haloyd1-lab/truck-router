import { plan, findStops, geocode, weighStations } from '../src/planner.js';
const BASE = process.env.BASE || 'http://localhost:4173/truck-router/';
const profile = { gvw: 80000, axleWt: 34000, hFt: 13, hIn: 6, wFt: 8, wIn: 6, lenFt: 72, trlFt: 53, axles: 5, trailers: 1, hazmat: false };
for (const [a, b] of [['West Union, IA', 'Des Moines, IA'], ['West Union, IA', 'La Crosse, WI'], ['Des Moines, IA', 'Davenport, IA'], ['Davenport, IA', 'Des Moines, IA']]) {
  try { const places = [await geocode(BASE, a), await geocode(BASE, b)]; const r = await plan(BASE, { places, profile });
    const f = await findStops(BASE, r.route); const w = await weighStations(BASE, r.route, f.scalesRaw, f.stops);
    console.log(`\n${a} -> ${b}: ${r.totalMi.toFixed(0)} mi; OSM scale objects in boxes ${f.scalesRaw.length}`);
    console.log(` stations shown ${w.stations.length}:`, w.stations.map(s => `mi${s.cumMi.toFixed(0)} ${s.name} [${s.source}] ${s.side} ${s.label}`).join(' | '));
    console.log(` hidden ${w.hidden.length}:`, w.hidden.map(s => `mi${s.cumMi.toFixed(0)} ${s.name} ${s.label}`).join(' | '));
    console.log(` public ${w.publics.length}:`, w.publics.map(s => `mi${s.cumMi.toFixed(0)} ${s.name}${s.ref ? '#' + s.ref : ''} ${s.operator || ''}`).join(' | '), '; ignored', w.ignored);
  } catch (e) { console.log(a, b, 'FAILED', e.message); }
}
