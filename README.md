# Truck Router (free mode, no account, no API key)

Truck routing for a semi using only free OpenStreetMap-based services and official state road-work feeds.

## Run
```bash
npm install
npm run dev        # snapshots road-work feeds, then Vite at http://localhost:5173/truck-router/
npm test
npm run build      # static site in dist/ (base /truck-router/), ready for GitHub Pages
node test/live.mjs # live test (needs dev/preview server for the road-work snapshots)
```

## How it works (static, no server, no key)
The browser calls Valhalla (FOSSGIS), Nominatim (with Photon as fallback, 1 request/s), Overpass and OSM tiles directly. All four send `Access-Control-Allow-Origin: *`. Browsers send their own User-Agent and Referer.
The state WZDx feeds (Iowa DOT, MnDOT, WisDOT) don't allow CORS. `scripts/fetch-roadwork.mjs` saves them as static JSON in `roadwork/`, and the GitHub Actions workflow (`.github/workflows/pages.yml`) rebuilds and redeploys every 30 minutes. Road work can be up to about 30 minutes old (plus GitHub cron delay). Illinois has no free feed.

## Honest limits
- **OpenStreetMap truck data is community-mapped and can miss low bridges and posted weight limits. Watch the signs.**
- Valhalla applies your limits where OSM has them tagged. It does not list the individual restrictions it avoided, so the app only reports `has_time_restrictions`, toll and ferry flags, and whether the truck route differs from the car route.
- Toll amounts are not available in free mode. Only where the route uses tolls (`has_toll`, maneuver `toll`).
- No live traffic in the ETA. The public Valhalla server has rate limits and no uptime guarantee. If it fails, the app shows the HTTP error. It never fakes a route.
- Fuel prices are entered by you. HOS is a planning aid, not an ELD.
