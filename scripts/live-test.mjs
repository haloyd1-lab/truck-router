// LIVE test against public services through the running dev server (not part of npm test).
import { plan, findStops, roadWork, geocode } from '../src/planner.js';
const BASE = process.env.BASE || 'http://localhost:5173/truck-router/';
const profile = { gvw: 80000, axleWt: 34000, hFt: 13, hIn: 6, wFt: 8, wIn: 6, lenFt: 72, trlFt: 53, axles: 5, trailers: 1, hazmat: false };
for (const [a, b] of [['West Union, IA', 'Des Moines, IA'], ['West Union, IA', 'La Crosse, WI']]) {
  try {
    const places = [await geocode(BASE, a), await geocode(BASE, b)];
    const r = await plan(BASE, { places, profile, avoidTolls: false });
    const s = await findStops(BASE, r.route).catch(e => ({ err: e.message, stops: [] }));
    const w = await roadWork(BASE, r.route).catch(e => ({ err: e.message, events: [], feeds: {} }));
    const k = t => s.stops.filter(x => x.kind === t).length;
    console.log(JSON.stringify({ trip: `${a} -> ${b}`, miles: +r.totalMi.toFixed(1), time: `${Math.floor(r.cumSec/3600)}h${Math.round(r.cumSec%3600/60)}m`,
      car: r.car && { miles: +r.car.miles.toFixed(1), min: Math.round(r.car.sec/60) }, legs: r.legs, notices: r.notices.map(n => n.text), maneuvers: r.maneuvers.length,
      stops: { total: s.stops.length, truckFuel: s.stops.filter(x => x.truck).length, fuel: k('fuel'), rest: k('rest'), parking: k('parking'), err: s.err, sample: s.stops.filter(x=>x.truck).slice(0,6).map(x => `${x.cumMi.toFixed(0)} ${x.name}`) },
      roadwork: { count: w.events.length, feeds: w.feeds, err: w.err, kinds: w.events.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {}), sample: w.events.slice(0, 3).map(e => `mi ${e.mile.toFixed(0)} ${e.kind} ${e.road} ${e.start?.slice(0,10)}..${e.end?.slice(0,10)}`) } }, null, 1));
  } catch (e) { console.log(a, '->', b, 'FAILED', e.message, e.status); }
}
