// lb -> metric tons (Valhalla "weight"/"axle_load" are metric tons), ft/in -> meters
export const lbToTonnes = lb => lb * 0.45359237 / 1000;
export const ftInToM = (ft, inch = 0) => (ft * 12 + inch) * 0.0254;
export function truckCosting(p, avoidTolls) {
  const r = n => Math.round(n * 1000) / 1000;
  return { height: r(ftInToM(p.hFt, p.hIn)), width: r(ftInToM(p.wFt, p.wIn)), length: r(ftInToM(p.lenFt)),
    weight: r(lbToTonnes(p.gvw)), axle_load: r(lbToTonnes(p.axleWt)), axle_count: p.axles, hazmat: !!p.hazmat,
    use_tolls: avoidTolls ? 0 : 0.5, ...(avoidTolls ? { exclude_tolls: true } : {}) };
}
