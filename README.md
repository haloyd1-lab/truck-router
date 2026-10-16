# Truck Router (free mode, no account, no API key)

Truck routing for a semi using only free OpenStreetMap-based services and official state road-work feeds.

## Run
```bash
cd /workspace/truck-router
npm install
npm run dev          # proxy on 127.0.0.1:8787 + Vite on http://localhost:5173
npm test             # unit tests: fuel optimizer, HOS, unit conversions, polyline, corridor filter
npm run build        # production build to dist/
node test/live.mjs   # LIVE test against public services (dev server must be running)
```

## Services (all free, no key)
| Feature | Source |
|---|---|
| Truck routing + maneuvers, toll/ferry flags | Valhalla `costing=truck`, public FOSSGIS server `https://valhalla1.openstreetmap.de/route`. `costing_options.truck`: `height`/`width`/`length` (m), `weight`/`axle_load` (metric t), `axle_count`, `hazmat`, `use_tolls` (0 + `exclude_tolls` when avoiding) |
| Car-vs-truck comparison | Same server, `costing=auto` (a 2nd request) |
| Geocoding | Nominatim, US/CA only, ≤1 request/s, cached 24 h |
| Fuel / truck stops / rest areas / truck parking | Overpass API, **one** query per route (union of ~8 bboxes), filtered to ≤3 mi of the polyline, cached 1 h |
| Road work | WZDx feeds with `needapikey=false` in the USDOT WZDx registry: Iowa DOT, MnDOT, WisDOT 511 (cached 10 min, filtered to ≤0.5 mi of route). Illinois feeds need a key → the UI says “check gettingaroundillinois.com”. |
| Map | OSM standard tiles with attribution |

The proxy (`server.js`) sends a User-Agent, spaces requests (Nominatim 1.1 s, Valhalla 1.5 s, Overpass 2 s) and caches. You can override it with `TR_USER_AGENT`. Optional free override: `VALHALLA_URL` (for example a self-hosted Valhalla).

## Honest limits
- **OpenStreetMap truck data is community-mapped and can miss low bridges and posted weight limits. Watch the signs.**
- Valhalla applies your limits where OSM has them tagged. It does not list the individual restrictions it avoided, so the app only reports `has_time_restrictions`, toll and ferry flags, and whether the truck route differs from the car route.
- Toll amounts are not available in free mode. Only where the route uses tolls (`has_toll`, maneuver `toll`).
- No live traffic in the ETA. The public Valhalla server has rate limits and no uptime guarantee. If it fails, the app shows the HTTP error. It never fakes a route.
- Fuel prices are entered by you. HOS is a planning aid, not an ELD.
