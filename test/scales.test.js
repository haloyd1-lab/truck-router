import test from 'node:test'; import assert from 'node:assert/strict';
import { buildScales, directionCheck, parseDir, classifyOsm, sideOf, scalePrompt } from '../src/scales.js';
import { cumulate } from '../src/geo.js';
const east = cumulate([[41.6, -94.0], [41.6, -93.0]]); // eastbound ~52 mi
test('parseDir', () => { assert.equal(parseDir('EB'), 90); assert.equal(parseDir('Southbound'), 180); assert.equal(parseDir('Bi-Directional'), 'both'); assert.equal(parseDir(''), null); });
test('side of route (eastbound: south = right)', () => { assert.equal(sideOf(east, 41.598, -93.5).side, 'right'); assert.equal(sideOf(east, 41.602, -93.5).side, 'left'); });
test('direction check with official direction', () => {
  assert.deepEqual(directionCheck({ heading: 90, side: 'right', offMi: 0.1, dirDeg: 90 }).show, true);
  const o = directionCheck({ heading: 90, side: 'left', offMi: 0.1, dirDeg: 270 }); assert.equal(o.show, false); assert.equal(o.verified, true);
  assert.equal(directionCheck({ heading: 90, side: 'left', offMi: 0.1, dirDeg: 'both' }).show, true);
});
test('direction check heuristics without tags', () => {
  assert.equal(directionCheck({ heading: 90, side: 'left', offMi: 0.1 }).show, false); // far left -> opposite carriageway
  const r = directionCheck({ heading: 90, side: 'right', offMi: 0.1 }); assert.equal(r.show, true); assert.equal(r.label, 'direction unverified');
  assert.equal(directionCheck({ heading: 90, side: 'left', offMi: 0.01 }).show, true); // on the road itself
  assert.equal(directionCheck({ heading: 90, side: 'right', offMi: 0.1, wayBearing: 92 }).verified, true);
});
test('classify', () => {
  assert.equal(classifyOsm({ amenity: 'weighbridge', brand: 'CAT Scale' }), 'public');
  assert.equal(classifyOsm({ name: 'Iowa DOT Weigh Station' }), 'station');
  assert.equal(classifyOsm({ amenity: 'weighbridge' }, false), null); // grain elevator etc.
  assert.equal(classifyOsm({ amenity: 'weighbridge' }, true), 'public');
  assert.equal(classifyOsm({ highway: 'service', service: 'weigh_station' }, false), 'candidate');
});
test('buildScales corridor + direction + dedupe', () => {
  const official = [{ lat: 41.598, lng: -93.5, direction: 'EB', name: 'Scale EB', source: 'Iowa DOT' }, { lat: 41.602, lng: -93.5, direction: 'WB', name: 'Scale WB', source: 'Iowa DOT' },
    { lat: 41.7, lng: -93.4, direction: 'EB', name: 'too far', source: 'Iowa DOT' }];
  const osm = [{ lat: 41.5981, lng: -93.5001, tags: { name: 'Weigh station' } }, { lat: 41.58, lng: -93.3, tags: { amenity: 'weighbridge', brand: 'CAT Scale', ref: '7' } },
    { lat: 41.5801, lng: -93.3, tags: { highway: 'service', service: 'weigh_station' } }, { lat: 41.599, lng: -93.2, tags: { amenity: 'weighbridge' } }];
  const r = buildScales(east, { osm, official, truckStops: [{ lat: 41.58, lng: -93.3 }] });
  assert.deepEqual(r.stations.map(s => s.name), ['Scale EB']); assert.deepEqual(r.hidden.map(s => s.name), ['Scale WB']);
  assert.equal(r.publics.length, 1); assert.equal(r.publics[0].ref, '7'); assert.equal(r.ignored, 1);
  assert.equal(scalePrompt(r.stations[0], 2), 'Weigh station in 2 miles on the right.');
});
