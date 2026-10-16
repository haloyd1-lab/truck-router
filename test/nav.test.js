import test from 'node:test'; import assert from 'node:assert/strict';
import { snap, OffRouteDetector, maneuverProgress, promptFor, promptText, Throttle, along } from '../src/nav.js';
import { cumulate } from '../src/geo.js';
const route = cumulate([[42.0, -92.0], [42.0, -91.9], [42.1, -91.9]]); // east ~5.1 mi then north ~6.9 mi
test('snap onto segment and progress', () => {
  const s = snap(route, 42.0003, -91.95); assert.equal(s.seg, 0); assert.ok(s.offM > 25 && s.offM < 45, String(s.offM)); assert.ok(Math.abs(s.cumMi - 2.57) < 0.05);
  const s2 = snap(route, 42.05, -91.9001, s.seg); assert.equal(s2.seg, 1); assert.ok(s2.cumMi > 8);
});
test('off-route needs 3 good fixes, ignores bad accuracy, resets', () => {
  const d = new OffRouteDetector();
  assert.equal(d.update({ offM: 90, accuracy: 10 }), false); assert.equal(d.update({ offM: 90, accuracy: 80 }), false); // ignored
  assert.equal(d.update({ offM: 90, accuracy: 10 }), false); assert.equal(d.update({ offM: 90, accuracy: 10 }), true);
  d.reset(); d.update({ offM: 90, accuracy: 5 }); d.update({ offM: 20, accuracy: 5 }); assert.equal(d.update({ offM: 90, accuracy: 5 }), false);
});
test('maneuver progress', () => {
  const m = [{ mile: 0, instruction: 'Depart' }, { mile: 5.1, instruction: 'Turn left' }, { mile: 12, instruction: 'Arrive' }];
  assert.equal(maneuverProgress(m, 0).index, 1); const p = maneuverProgress(m, 4.6); assert.equal(p.index, 1); assert.ok(Math.abs(p.distMi - 0.5) < 1e-9);
  assert.equal(maneuverProgress(m, 6).index, 2); assert.equal(maneuverProgress(m, 12.5).arrived, true);
});
test('voice prompt levels highway vs town', () => {
  assert.equal(promptFor(0.95, 65), 'far'); assert.equal(promptFor(0.45, 65), 'near'); assert.equal(promptFor(0.03, 65), 'now');
  assert.equal(promptFor(0.95, 30), null); assert.equal(promptFor(0.45, 30), 'far'); assert.equal(promptFor(0.45, 65, new Set(['near'])), null);
  assert.match(promptText({ alert: 'Turn left onto US 18.' }, 'far', 0.95), /^In 1 mile, Turn left onto US 18$/);
});
test('reroute throttle 20s', () => { const t = new Throttle(20000); assert.ok(t.ok(0)); assert.ok(!t.ok(19000)); assert.ok(t.ok(20001)); });
test('simulation along()', () => { const p = along(route, 6); assert.equal(p.seg, 1); assert.ok(Math.abs(p.heading) < 1 || Math.abs(p.heading - 360) < 1); });
