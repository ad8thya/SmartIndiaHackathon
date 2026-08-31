"""Photo storage. Owned by M5.

One decoder, one size cap, one place files land. Extracted from
`routers/reports.py` when crew evidence needed the same thing — two copies of
"decode a data URI and write it somewhere" is two places for the size cap to
drift, and the cap is the only thing standing between an endpoint with no auth
and a full disk.

Why data URIs rather than multipart: the phone already holds the photo as a
data URI (it comes out of `<input capture>` through FileReader and a canvas
downscale), the payload is one JSON body with the rest of the form, and there
is no upload-then-associate two-step to leave orphans behind when the second
call fails. The cost is 33% transfer overhead on the wire, which is why the
client downscales to 1600px before sending.
"""

from __future__ import annotations

import base64
import binascii
import re
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

#: Decoded image size cap. A modern phone camera JPEG is 2–5 MB; 8 MB leaves
#: room for that without letting an unauthenticated endpoint (there is no auth
#: on this prototype) fill the disk one request at a time.
MAX_PHOTO_BYTES = 8 * 1024 * 1024
TOO_BIG_DETAIL = f"photo exceeds {MAX_PHOTO_BYTES // 1024 // 1024} MB"

#: What we are willing to decode and write. Not a security boundary on its own
#: — the bytes are never executed — but it stops a caller storing arbitrary
#: files through an image field.
ALLOWED_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_DATA_URI = re.compile(r"^data:(?P<mime>[\w.+-]+/[\w.+-]+);base64,(?P<data>.+)$", re.DOTALL)


def photos_dir(media_root: str, kind: str) -> Path:
    """`<media_root>/<kind>`, created if missing. `kind` is never user input."""
    directory = Path(media_root) / kind
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def store_photo(
    data_uri: str,
    owner_id: UUID,
    media_root: str,
    *,
    kind: str,
    suffix_hint: str = "",
) -> str:
    """Decode a data URI to a file and return the path this API serves it at.

    Raises HTTPException(422/413) rather than silently dropping the photo: a
    person who took a picture and got back a record with no image would have no
    way to tell that the one piece of evidence they gathered was discarded.
    """
    match = _DATA_URI.match(data_uri.strip())
    if match is None:
        raise HTTPException(
            status_code=422,
            detail="photo must be a base64 data URI, e.g. 'data:image/jpeg;base64,...'",
        )

    mime = match.group("mime").lower()
    extension = ALLOWED_PHOTO_TYPES.get(mime)
    if extension is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"unsupported photo type {mime!r} — "
                f"use {', '.join(sorted(ALLOWED_PHOTO_TYPES))}"
            ),
        )

    # Check the encoded length first. base64 is 4/3 of the payload, so this
    # rejects an oversized upload before allocating the decoded copy.
    if len(match.group("data")) > MAX_PHOTO_BYTES * 4 // 3 + 4:
        raise HTTPException(status_code=413, detail=TOO_BIG_DETAIL)

    try:
        blob = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="photo is not valid base64") from exc

    if len(blob) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail=TOO_BIG_DETAIL)

    # The filename is built from the owner's uuid and a caller-chosen suffix,
    # so nothing from the request body reaches the path and a name can never
    # collide or traverse. `suffix_hint` is generated, not user input.
    name = f"{owner_id}{f'-{suffix_hint}' if suffix_hint else ''}{extension}"
    (photos_dir(media_root, kind) / name).write_bytes(blob)
    return f"/api/{kind}/photos/{name}"


def resolve_photo(media_root: str, kind: str, filename: str) -> Path:
    """Locate a stored photo, refusing anything outside its directory.

    `filename` is never trusted: the resolved path must still be inside the
    photo directory, which rules out `../` traversal regardless of what
    Starlette did or did not normalise on the way in.
    """
    directory = photos_dir(media_root, kind).resolve()
    candidate = (directory / filename).resolve()
    if not candidate.is_relative_to(directory) or not candidate.is_file():
        raise HTTPException(status_code=404, detail="no such photo")
    return candidate
