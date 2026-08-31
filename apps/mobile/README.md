# apps/mobile — the phone app

Four field roles: **Citizen**, **Road Maintenance**, **Bus Driver**, **Emergency
Team**. The other four roles decide things at a desk and live in the console
repository, which is a separate repo and a separate deploy.

Web decides, phone acts. Both are clients of the same FastAPI process and the
same `/ws/live` socket; nothing goes phone → web directly.

```
make dev          # :5173 console, :5176 this app, :8000 api
make demo         # one port, built: console at /, this app at /m
```

On a real phone, `make dev` prints the LAN URL. It must be the LAN IP and not
`localhost` — see the note in `src/lib/api.ts`.

## There is no authentication

The login screen accepts any identifier and any password, checks nothing, sends
nothing, and issues no token. The "session" is a role id in `localStorage`.

This is written down in three places on purpose — `src/store/session.ts`,
`src/screens/LoginScreen.tsx`, and on screen in the app itself — because a fake
login that looks real is a lie told to a demo audience. No UI text in this app
says "secure", "verified" or "signed in securely", and there is no lock icon.

The **permission boundary** is nonetheless real and is meant to be
demonstrated: sign in as Citizen, open `/crew`, and the app renders a screen
naming your role and what it can do, **at that URL**. It does not redirect —
a redirect hides the boundary and reads as a broken link. See
`src/screens/NotAvailableScreen.tsx`, and `src/test/permissions.test.tsx`,
which asserts the URL is unchanged so that "just redirect instead" cannot be
introduced quietly later.

Each role owns exactly one path prefix (`/citizen`, `/crew`, `/bus`,
`/emergency`), declared once in `src/roles/catalog.ts`. Adding a screen is a
route line; there is no second list of permitted paths.

## Screens are block lists

A screen is an array of typed blocks rendered by `components/blocks/BlockRenderer.tsx`.
`Block` is a discriminated union and the renderer's `switch` ends in a `never`
check, so adding a kind without rendering it fails the build rather than
silently dropping a section. Adding a screen to a role is a config change plus
a route line.

`custom` is the escape hatch and is meant to stay rare. The report wizard and
the map screens are components, because they are one stateful thing each —
modelling a form as config would be the architecture used for its own sake.

## The privacy story

The citizen map shows only `AUTHORITY_NOTIFIED` → `RESOLVED`. Below that the
ladder is machine output (`DETECTED` is one bus, low confidence), and
`REJECTED` is the set the city looked at and disagreed with. Publishing either
puts unreviewed algorithmic claims about specific streets in front of the
public.

Three independent gates, on purpose — any one failing is a bug, all three
failing is a breach:

1. **Ingest.** `store/live.ts` refuses to admit a non-public event on a citizen
   session — not from the initial fetch, not from the socket. An event that
   falls back below the line is dropped, not left showing its last public copy.
2. **Read.** `useEvents({ publicOnly })` filters again.
3. **Render.** `toPublicEvent` *removes* `fused_confidence`, `observation_count`,
   `distinct_bus_count`, `assigned_team`, `sla_due` and `evidence_uris`. The
   keys are absent, not blank — a test asserts absence.

Verified against a seeded database: the citizen query returns 24 of 41 events,
withholding exactly `DETECTED`, `AI_VERIFIED` and `REJECTED`.

## Live sync

One WebSocket for the whole app, opened in `AppShell` — the only component
every signed-in screen mounts inside. Every screen reads one shared cache, so
two screens can never disagree about the same event.

Offline is visible, and means two things: the socket is closed, **or** it is
open and silent for 45s. The server sends `TICK`, so silence means the
connection died without either end noticing. A bar, not a toast — the
condition persists, and a toast would take the warning away while the problem
is still there.

Phone-specific: 0–30% backoff jitter (a depot of phones reconnecting in
lockstep is a self-inflicted thundering herd) and an immediate retry on
`online`/`visibilitychange`, because a suspended tab's socket dies silently.

## What is not real, and says so on screen

Written here *and* in the UI next to the thing itself:

| | |
|---|---|
| Login | No account system. Any password. See above. |
| Camera obstruction | A bus reports position, not lens condition. Online state and frame age are real; `OBSTRUCTED` is simulated, and the API says so per row via `CameraStatus.derived` — the screen reads that flag rather than hard-coding the caveat. |
| Dispatch ETA | Straight line at 28 km/h, labelled as such. There is no routing engine on the phone. |
| Reverse geocoding | Nearest of 26 seeded segments. Says "near <street>", never an exact address, and the field is editable. |
| Alerts scope | Proximity, not a ward boundary — this project has no ward polygons. The banner says "within 2 km of you", or "across the city" with no fix. |

Three things on this list were fixed rather than documented: crew photo upload,
emergency accept/dispatch, and camera status all have real endpoints now
(BUILD.md §13). Each was a button whose effect never left the device.

## Types are generated

`src/lib/types.ts` and `src/lib/cityRef.ts` are **generated** from
`packages/contracts` by `make types`, which writes the identical file into both
apps. Do not edit them, and do not hand-mirror a contract type into this app —
three divergent hand-written copies already caused a real bug here (BUILD.md
§5). `scripts/smoke_test.py` fails if the two apps' copies ever differ.

## The basemap is borrowed

`public/map` is a symlink to the repo-level `assets/map`, which belongs to no
app. Dev serves the extract through it; the production build deletes
`dist/map` because the API serves `/map` from `MAP_DIR` unconditionally — see
`vite.config.ts` and `services/cloud/api/spa.py::mount_map`. One extract in
git, one on disk, one in the image.

**HTTP Range is load-bearing.** pmtiles reads byte slices out of the archive
rather than downloading 17 MB up front, so anything serving `/map` must answer
`206`, not `200` with the whole file.

## Palette

Tokens in `tailwind.config.js` are transcribed from the design canvas export
(`Frontend1.zip` → `index1.html`), not invented. Where the design and
the console disagree, the design wins here, because this app is a rebuild of
that comp.

The one deliberate difference from the console: its accent is its own,
while this app uses the design's `#2563EB` throughout, and reserves the emerald
gradient for the citizen hero banner — the only gradient in the app.

## It is a phone app, including on a laptop

Every screen is designed against a 390px viewport. Left to itself in a desktop
browser the app stretches to the window width and every decision in it —
one-column lists, a bottom tab bar, thumb-reachable actions — stops making
sense.

So above a phone-sized viewport it renders inside a 390 x 844 device frame
(iPhone 13/14 logical resolution) centred on a neutral backdrop. It is **not**
a scale transform: the app runs at true 390px CSS pixels, so text is its real
size and hairlines stay hairlines.

Below 480px the media query never matches and the app is full-bleed, as it must
be on a real phone. Installed as a PWA the frame is taken back off — written as
a removal rule rather than a condition, so an engine that does not understand
`display-mode` keeps the frame (harmless) instead of dropping the whole query
and rendering full width (not harmless). That standalone path is reasoned, not
tested: playwright cannot emulate `display-mode`.

It is also why the console's `PhoneFrame` does not double-frame — that iframe
is 390px wide, so the desktop rule never triggers inside it.

## Layout rules

- 44px minimum touch target (`.ut-touch`); primary actions sit low, in thumb reach.
- Bottom sheets, never modals (`components/BottomSheet.tsx`).
- Only the canvas scrolls. The top bar and tab bar are fixed and carry the
  safe-area insets; nothing else needs them.
- Two font weights, 400 and 500. Sentence case.
- Every button does something, and no route is blank. 18 tests render every
  route of every role **with the API unreachable** and assert the canvas has
  content — the hostile case, and the one a bad venue actually produces.
- `test/polish.test.ts` enforces the rules that decay first: two font weights,
  one gradient, no springs, a 44px floor, and no copy claiming the login is
  secure.
- maplibre is lazy-loaded. Most sessions never open a map, and it is ~865 kB —
  more than the rest of the app put together. Main bundle: 403 kB.
