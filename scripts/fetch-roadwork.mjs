// Snapshot official no-key WZDx feeds (they do not allow browser CORS) into static JSON for GitHub Pages.
// Run by the scheduled GitHub Actions workflow (every 30 min) and before local dev/build.
import fs from 'node:fs';
const FEEDS = { IA: ['Iowa DOT WZDx', 'https://iowa-atms.cloud-q-free.com/api/rest/dataprism/wzdx/wzdxfeed'],
  MN: ['MnDOT WZDx', 'https://mn.carsprogram.org/carsapi_v1/api/wzdx'], WI: ['WisDOT 511 WZDx', 'https://511wi.gov/api/wzdx'] };
const out = new URL('../public/roadwork/', import.meta.url); fs.mkdirSync(out, { recursive: true });
for (const [st, [feed, url]] of Object.entries(FEEDS)) {
  try { const r = await fetch(url, { headers: { 'User-Agent': 'TruckRouter/0.3 (github.com/haloyd1-lab/truck-router)', accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status); const fc = await r.json();
    const rnd = c => typeof c[0] === 'number' ? c.map(v => Math.round(v * 1e5) / 1e5) : c.map(rnd);
    const features = (fc.features || []).filter(f => f.geometry).map(f => ({ geometry: { type: f.geometry.type, coordinates: rnd(f.geometry.coordinates) }, properties: { core_details: { event_type: f.properties?.core_details?.event_type,
      road_names: f.properties?.core_details?.road_names, direction: f.properties?.core_details?.direction, description: (f.properties?.core_details?.description || '').slice(0, 500) },
      start_date: f.properties?.start_date, end_date: f.properties?.end_date, vehicle_impact: f.properties?.vehicle_impact, restrictions: f.properties?.restrictions } }));
    fs.writeFileSync(new URL(`${st}.json`, out), JSON.stringify({ feed, source: url, fetched: new Date().toISOString(), features }));
    console.log(st, features.length);
  } catch (e) { console.error(st, 'FAILED', e.message); if (!fs.existsSync(new URL(`${st}.json`, out))) fs.writeFileSync(new URL(`${st}.json`, out), JSON.stringify({ feed, source: url, fetched: null, error: e.message, features: [] })); }
}

// Official weigh-station locations (free, no key). Iowa DOT Weigh Scale (direction, no live status); WisDOT SWEFs (facility status text, not live).
const SCALES = {
  IA: ['Iowa DOT Weigh Scale', 'https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Weigh_Scale_View/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    p => ({ name: `Iowa DOT scale – ${p.REST_AREAS || p.NEAREST_CITY}`, road: p.ROUTE, milepost: p.MILEPOST, direction: p.TRAVEL_DIRECTION, address: p.ADDRESS })],
  WI: ['WisDOT SWEF', 'https://dotmaps.wi.gov/arcgis/rest/services/agohub/SAFETY_WEIGHT_ENFORCEMENT_FACILITIES/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    p => ({ name: p.PROPERTY_NAME, road: p.HIGHWAY, direction: p.SERVICE_DIRECTION, facilityStatus: p.STATUS })],
};
const sOut = new URL('../public/scales/', import.meta.url); fs.mkdirSync(sOut, { recursive: true });
for (const [st, [source, url, map]] of Object.entries(SCALES)) {
  try { const r = await fetch(url, { headers: { 'User-Agent': 'TruckRouter/0.4 (github.com/haloyd1-lab/truck-router)' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const fc = await r.json(); const items = (fc.features || []).filter(f => f.geometry?.coordinates?.[0] != null)
      .map(f => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], source, ...map(f.properties || {}) }));
    fs.writeFileSync(new URL(`${st}.json`, sOut), JSON.stringify({ source, url, fetched: new Date().toISOString(), items })); console.log('scales', st, items.length);
  } catch (e) { console.error('scales', st, 'FAILED', e.message); if (!fs.existsSync(new URL(`${st}.json`, sOut))) fs.writeFileSync(new URL(`${st}.json`, sOut), JSON.stringify({ source, fetched: null, error: e.message, items: [] })); }
}
