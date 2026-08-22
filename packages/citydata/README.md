# packages/citydata — the demo city

Static Chennai reference data: six MTC routes with their polylines, the road
segments they run along, the fleet, three school zones, and the defect hotspots
the mocks fire at.

> Not a contract, but **frozen for the week for the same reason**: seeded event
> rows and hardcoded what-if penalties reference these ids. Adding a hotspot is
> fine. Renaming or renumbering a route or segment is not.

## What's in it

| symbol | what |
|---|---|
| `ROUTES` | 27B, 42A, 51C, 21G, 570, M1 — anchors densified to ~33 vertices each |
| `SEGMENTS` | one per corridor leg, `SEG-<route>-<nnn>` |
| `BUSES` | six, one per route, spread along their routes so they never stack on one pixel |
| `SCHOOL_ZONES` | three, used by M3's pedestrian risk weighting |
| `DEFECT_HOTSPOTS` | fourteen, used by M1's mock so the demo is repeatable |
| `point_at_fraction`, `haversine_m`, `bearing_deg` | geometry the simulator needs |

## The one design decision worth knowing

**27B, 570 and M1 all run the Egmore ↔ Chennai Central trunk.** That overlap is
deliberate and load-bearing. Without a corridor that several services share, no
defect is ever seen by more than one bus — and multi-bus corroboration is the
entire premise of the platform. If you change route geometry, preserve an
overlap or the escalation ladder becomes undemonstrable.

Hotspots `HS-11` and `HS-12` sit on that trunk. They are the ones that reach
three distinct buses and escalate to `AUTHORITY_NOTIFIED` during a long run.

## Coordinates

GeoJSON order throughout: `(lon, lat)`. `db.point()` takes the human order
`(lat, lon)` and does the flip for you — that mismatch is the most common bug
in a geo codebase, so it is handled in exactly one place.
