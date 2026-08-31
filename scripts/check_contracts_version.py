#!/usr/bin/env python3
"""Fail if a client's contract types are not the ones the API speaks.

    python scripts/check_contracts_version.py
    python scripts/check_contracts_version.py --api http://localhost:8001/health
    python scripts/check_contracts_version.py \
        --types ../console/node_modules/@urban-twin/contracts/index.d.ts

WHY THIS EXISTS
---------------
The contract types are generated from `packages/contracts` into
`apps/mobile/src/lib/types.ts` and into an npm package for repos that live
elsewhere. Nothing physically stops someone copying that file across instead
of installing it — and that is not hypothetical: this project already shipped
three divergent hand-mirrored copies and a bug that took a day to find
(BUILD.md §5).

A copy does not announce itself. It works perfectly until the day the schema
moves and one side does not, and then it fails as a wrong field at runtime
rather than a type error at build time. So the guard is a version comparison
run in CI, not a convention:

  · the generator stamps `export const CONTRACTS_VERSION` into every file it
    writes and into the npm package
  · the API reports `detail.contracts_version` at `GET /health`
  · this compares them and exits non-zero on a mismatch

Run it in CI after `make types`, and in the console repo's CI against its
deployed API. Exit codes: 0 match, 1 mismatch, 2 could not determine.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TYPES = ROOT / "apps/mobile/src/lib/types.ts"

_VERSION_RE = re.compile(r'export const CONTRACTS_VERSION\s*=\s*["\']([^"\']+)["\']')


def version_from_types(path: Path) -> str | None:
    """Read the stamped version out of a generated types file."""
    if not path.is_file():
        return None
    match = _VERSION_RE.search(path.read_text())
    return match.group(1) if match else None


def version_from_package() -> str | None:
    """The version the local `contracts` package actually is."""
    try:
        import contracts
    except ImportError:
        return None
    return getattr(contracts, "__version__", None)


def version_from_api(health_url: str) -> str | None:
    """The version the running API was built against."""
    try:
        # The URL is supplied by the operator running the check, not by input.
        with urlopen(health_url, timeout=5) as response:
            payload = json.load(response)
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    return payload.get("detail", {}).get("contracts_version")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--types",
        type=Path,
        default=DEFAULT_TYPES,
        help="generated types.ts or index.d.ts to check (default: apps/mobile's)",
    )
    parser.add_argument(
        "--api",
        default=None,
        help="a /health URL to compare against; skipped when not given",
    )
    args = parser.parse_args()

    generated = version_from_types(args.types)
    if generated is None:
        print(f"✗ no CONTRACTS_VERSION in {args.types}")
        print("  run `make types` — or this file is a hand-copy, which is the")
        print("  exact thing this check exists to catch.")
        return 2

    package = version_from_package()
    if package is None:
        print("✗ could not import `contracts` — is the venv active?")
        return 2

    print(f"  packages/contracts   {package}")
    print(f"  {args.types.name:<20} {generated}")

    ok = True
    if generated != package:
        print(f"✗ {args.types} is stale — regenerate with `make types`")
        ok = False

    if args.api:
        served = version_from_api(args.api)
        if served is None:
            print(f"✗ could not read contracts_version from {args.api}")
            return 2
        print(f"  {args.api:<20} {served}")
        if served != generated:
            print("✗ the API speaks a different contract version than this client")
            print("  a client built against a different schema fails at runtime,")
            print("  not at compile time. Reinstall @urban-twin/contracts.")
            ok = False

    if ok:
        print("✓ contract versions agree")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
