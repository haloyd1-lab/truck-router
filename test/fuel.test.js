import test from 'node:test'; import assert from 'node:assert/strict';
import { optimizeFuelStops, fuelEstimate, hosPlan } from '../src/fuel.js';
const stops = [
  { id: 'a', name: "Kwik Trip", cumMi: 300, offMi: 0.5 },
  { id: 'b', name: "Pilot", cumMi: 900, offMi: 1 },
  { id: 'c', name: "Love's", cumMi: 1000, offMi: 2.5 },
  { id: 'd', name: "Far off", cumMi: 1050, offMi: 8 },
];
test('estimate', () => { const e = fuelEstimate({ miles: 650, mpg: 6.5, pricePerGal: 4 }); assert.equal(e.gallons, 100); assert.equal(e.cost, 400); });
test('no stop needed for short trip', () => {
  const r = optimizeFuelStops({ totalMi: 200, mpg: 6.5, tankGal: 300, startPct: 100, reservePct: 15, stops });
  assert.equal(r.plan.length, 0);
});
test('picks farthest safe stop, ignores >3 mi off-route', () => {
  // usable = (300-45)*6.5 = 1657.5 mi... use smaller tank
  const r = optimizeFuelStops({ totalMi: 1500, mpg: 6.5, tankGal: 200, startPct: 100, reservePct: 15, stops });
  // crit = 170*6.5 = 1105 -> farthest within <=1105 & off<=3 is Love's at 1000
  assert.equal(r.plan[0].id, 'c');
  assert.ok(r.plan[0].arriveGal > 30);
});
test('prefers cheapest entered price', () => {
  const priced = stops.map(s => s.id === 'b' ? { ...s, price: 3.59 } : s.id === 'c' ? { ...s, price: 3.99 } : s);
  const r = optimizeFuelStops({ totalMi: 1500, mpg: 6.5, tankGal: 200, startPct: 100, reservePct: 15, stops: priced, windowMi: 300 });
  assert.equal(r.plan[0].id, 'b');
});
test('warns when nothing reachable', () => {
  const r = optimizeFuelStops({ totalMi: 1500, mpg: 6.5, tankGal: 200, startPct: 20, reservePct: 15, stops });
  assert.equal(r.plan.length, 0); assert.ok(r.warnings.length);
});
test('HOS flags 8h and 11h', () => {
  const route = Array.from({ length: 101 }, (_, i) => ({ cumMi: i * 7, cumSec: i * 432 }));
  const h = hosPlan({ route, stops, totalSec: 43200 });
  assert.equal(h.length, 2); assert.equal(h[0].stop.id, 'a');
});
