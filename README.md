# Oil Tycoon

A 3D oil and gas tycoon. Start as a wildcatter with $10M and a rumoured oil seep; survey, drill, produce, refine and trade your way to a $500M company without going bust.

## Play

- **Quickest:** open `dist/oil-tycoon.html` in a browser. It is one self-contained file.
- **From source:** `npm start`, then visit http://localhost:8080 (ES modules need a web server).

Controls: drag to pan, right-drag (or two fingers) to rotate, wheel or pinch to zoom.
Keys: `Space` pause, `1-3` speed, `S` survey, `D` drill, `B` build, `O` seismic overlay, `X` X-ray view, `Esc` cancel.

## The game

| Stage | What you do | What can go wrong |
|---|---|---|
| Explore | Seismic surveys paint a heat-map over a 5×5 area | Basic surveys are noisy, read deep fields faintly and throw false anomalies |
| Excavate | Pick a tile and a depth (1,200 / 2,600 / 4,200 m); watch the drill log for gas shows | Dry holes, blowouts, and the gamble of paying to deepen |
| Extract | Complete strikes as pumpjacks or offshore platforms; upgrade them | Fields are finite and decline; flaring gas costs reputation |
| Move and store | Trucks and shuttle tankers charge by distance; pipelines cut it | Full tanks throttle your wells; pipelines leak |
| Refine | Refinery (switchable gasoline / diesel / jet focus), gas plant, petrochemicals, LNG, export terminal | Fires, feedstock shortages, thin margins when crack spreads close |
| Trade | Seven commodities with cycles, seasons and news shocks; hold stock, set auto-sell floors, take contracts, hedge | Rumours that turn out false, missed contract deadlines, your own sales moving the price |

Also in there: 12 technologies, loans and credit limits, reputation, decision events (strikes, protests, buyout offers, a wildcatter's map, audits), four rival companies, guided objectives, autosave, and an X-ray view that shows discovered reservoirs shrinking underground as you drain them.

## Code map

| File | Role |
|---|---|
| `js/sim.js` | The whole simulation. Pure functions over a JSON state; one `tick` is one day |
| `js/market.js` | Price model: mean-reverting noise, long cycles, seasons, world events, player impact |
| `js/world.js` | Procedural island and hidden reservoirs from a seed |
| `js/data.js` | Tunable numbers: costs, rates, buildings, technologies, objectives |
| `js/render.js`, `js/models.js` | Three.js scene, procedural low-poly models, camera, picking, particles |
| `js/ui.js`, `js/main.js` | DOM interface and the game loop |
| `tools/simtest.mjs` | Headless bot that plays several seeds (`npm test`) to catch crashes and check balance |
| `tools/build.mjs` | Bundles everything into `dist/` (`npm run build`) |

Balance lives almost entirely in `js/data.js` and the reserve sizes in `js/world.js`.
