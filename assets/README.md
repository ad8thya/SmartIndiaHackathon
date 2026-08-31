# assets/

Static files that are **not owned by any one app**.

`map/` is the offline basemap: a Protomaps extract of Chennai
(`chennai.pmtiles`, 17 MB) plus the glyphs and sprites needed to label and
style it. It lives here rather than inside an app because two clients read it
and the API serves it — see `services/cloud/api/spa.py::mount_map`.

It used to live in `apps/web/public/map`, with `apps/mobile` reaching it
through a symlink and production serving it off `WEB_DIST`. That made the
phone app's map depend on the existence of the desktop app in two independent
ways, which is exactly the coupling that made splitting the repo hard.

## Why `assets/` and not `packages/basemap/`

`packages/` in this repo means *installable Python packages* — `contracts`,
`db`, `citydata` — each with a `pyproject.toml` and an import name. A
directory of binary tiles is none of those things, and putting it there would
make `pip install -e packages/*` ambiguous and imply a build step that does
not exist.

`assets/` says what it is: bytes, served as-is, owned by nobody.

## How it is served

| where | how |
|---|---|
| dev, either app | `apps/*/public/map` symlinks here; vite serves it with HTTP Range |
| API, any deployment | `MAP_DIR` (default `assets/map`) mounted at `/map`, unconditionally |

**HTTP Range matters.** The pmtiles protocol fetches byte ranges out of the
archive rather than downloading 17 MB up front; a server that answers `200`
with the whole file instead of `206` with the requested slice makes the map
either very slow or broken. Starlette's `StaticFiles` handles Range, which is
why the mount uses it rather than a hand-rolled handler.

## Regenerating

The extract is committed on purpose: `make demo` promises the network can be
unplugged, and a tile server is one more thing to fail on stage. See
`BUILD.md` for how it was cut.
