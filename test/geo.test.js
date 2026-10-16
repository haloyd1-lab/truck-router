import test from 'node:test'; import assert from 'node:assert/strict';
import { lbToTonnes, ftInToM, truckCosting } from '../src/units.js';
import { cumulate, filterToCorridor, decodePolyline6, chunkBoxes } from '../src/geo.js';
const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
test('unit conversions', () => {
  near(lbToTonnes(80000), 36.287); near(lbToTonnes(34000), 15.422); near(ftInToM(13, 6), 4.115); near(ftInToM(8, 6), 2.591); near(ftInToM(72), 21.946);
});
test('truck costing', () => { const c = truckCosting({ gvw: 80000, axleWt: 34000, hFt: 13, hIn: 6, wFt: 8, wIn: 6, lenFt: 72, axles: 5, hazmat: false }, true);
  assert.equal(c.use_tolls, 0); assert.equal(c.exclude_tolls, true); assert.equal(c.axle_count, 5); near(c.weight, 36.287); });
test('polyline6 decode', () => assert.deepEqual(decodePolyline6('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]));
const route = cumulate([[42.0, -92.0], [42.0, -91.0]]); // ~51 mi east-west line
test('corridor filter keeps within 3 mi and orders by mile', () => {
  const items = [{ id: 'far', lat: 42.1, lng: -91.5 }, { id: 'b', lat: 42.02, lng: -91.2 }, { id: 'a', lat: 41.98, lng: -91.9 }, { id: 'past', lat: 42.0, lng: -90.9 }];
  const r = filterToCorridor(route, items, 3);
  assert.deepEqual(r.map(x => x.id), ['a', 'b']); near(r[0].offMi, 1.38, 0.05); assert.ok(r[1].cumMi > 40);
});
test('chunk boxes cover route', () => { const b = chunkBoxes(route, 30, 3); assert.equal(b.length, 2); assert.ok(b[0][0] < 42 && b[0][2] > 42); });
