# apps/mobile — the phone app

Four field roles: **Citizen**, **Road Maintenance**, **Bus Driver**, **Emergency
Team**. The other four roles decide things at a desk and live in `apps/web`.

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

## Types are generated

`src/lib/types.ts` and `src/lib/cityRef.ts` are **generated** from
`packages/contracts` by `make types`, which writes the identical file into both
apps. Do not edit them, and do not hand-mirror a contract type into this app —
three divergent hand-written copies already caused a real bug here (BUILD.md
§5). `scripts/smoke_test.py` fails if the two apps' copies ever differ.

## The basemap is borrowed

`public/map` is a symlink to `apps/web/public/map`. Dev serves the extract
through it; the production build deletes `dist/map` because both apps are
served from one origin, so `/map` already resolves to `apps/web`'s copy. One
extract in git, one on disk, one in the image — see `vite.config.ts`.

## Palette

Tokens in `tailwind.config.js` are transcribed from the design canvas export
(`Frontend1.zip` → `index1.html`), not invented. Where the design and
`apps/web` disagree, the design wins here, because this app is a rebuild of
that comp.

The one deliberate difference from `apps/web`: the console's accent is its own,
while this app uses the design's `#2563EB` throughout, and reserves the emerald
gradient for the citizen hero banner — the only gradient in the app.

## Layout rules

- 44px minimum touch target (`.ut-touch`); primary actions sit low, in thumb reach.
- Bottom sheets, never modals (`components/BottomSheet.tsx`).
- Only the canvas scrolls. The top bar and tab bar are fixed and carry the
  safe-area insets; nothing else needs them.
- Two font weights, 400 and 500. Sentence case.
- Every button does something. An unbuilt screen gets a styled empty state
  (`screens/Placeholder.tsx`), never a blank one.
