// Fuel estimate, fuel-stop optimizer and HOS planning aid. Pure functions (unit tested).
export function fuelEstimate({ miles, mpg, pricePerGal }) {
  const gallons = miles / mpg; return { gallons, cost: pricePerGal ? gallons * pricePerGal : null };
}
/**
 * Walk the route; whenever projected fuel would cross the reserve, pick a stop in the window before that point.
 * stops: [{id,name,cumMi,offMi,price?}]  (price = user-entered $/gal, optional)
 */
export function optimizeFuelStops({ totalMi, mpg, tankGal, startPct, reservePct, stops, windowMi = 120, maxOffMi = 3 }) {
  const reserveGal = tankGal * reservePct / 100;
  let fuel = tankGal * startPct / 100, pos = 0; const plan = [], warnings = [];
  const usable = stops.filter(s => s.offMi <= maxOffMi).sort((a, b) => a.cumMi - b.cumMi);
  if (fuel <= reserveGal) warnings.push('Starting fuel is already at or below reserve.');
  for (let guard = 0; guard < 100; guard++) {
    const critMi = pos + Math.max(0, (fuel - reserveGal) * mpg);
    if (critMi >= totalMi) break;
    const reachable = usable.filter(s => s.cumMi > pos && s.cumMi <= critMi);
    let cands = reachable.filter(s => s.cumMi >= critMi - windowMi);
    if (!cands.length) cands = reachable;
    if (!cands.length) { warnings.push(`No truck stop within ${maxOffMi} mi of route before mile ${critMi.toFixed(0)} — fuel would drop below reserve.`); break; }
    const priced = cands.filter(s => typeof s.price === 'number' && s.price > 0);
    const pick = priced.length ? priced.reduce((a, b) => (b.price < a.price || (b.price === a.price && b.cumMi > a.cumMi)) ? b : a)
                               : cands.reduce((a, b) => b.cumMi > a.cumMi ? b : a);
    const arriveGal = fuel - (pick.cumMi - pos) / mpg;
    // Buy only what is needed to finish (plus reserve) if less than a fill-up
    const needToFinish = (totalMi - pick.cumMi) / mpg + reserveGal;
    const buy = Math.max(0, Math.min(tankGal, needToFinish) - arriveGal);
    plan.push({ ...pick, mile: pick.cumMi, arriveGal, buyGal: buy, cost: pick.price ? buy * pick.price : null,
                reason: priced.length ? 'cheapest entered price in window' : 'farthest safe stop in window' });
    fuel = arriveGal + buy; pos = pick.cumMi;
  }
  return { plan, warnings, reserveGal };
}
/** HOS planning aid: 30-min break by 8h driving, stop needed by 11h driving. route: [{cumMi, cumSec}] */
export function hosPlan({ route, stops, totalSec }) {
  const out = [];
  const pick = (limitSec, label) => {
    if (totalSec <= limitSec) return;
    const limitPt = route.find(p => p.cumSec >= limitSec) || route[route.length - 1];
    const before = stops.filter(s => s.cumMi <= limitPt.cumMi && s.offMi <= 3).sort((a, b) => b.cumMi - a.cumMi)[0];
    out.push({ label, byMile: limitPt.cumMi, stop: before || null });
  };
  pick(8 * 3600, '30-minute break required (8 hrs driving)');
  pick(11 * 3600, '11-hour driving limit — 10-hour off-duty stop needed');
  return out;
}
