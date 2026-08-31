#!/usr/bin/env python
"""Render the PWA icon set from the design's brand mark.

    .venv/bin/python apps/mobile/scripts/gen-icons.py

The mark is the one in the design canvas: a rounded #2563EB square with a
white, heavy "U". Rendering it here rather than committing hand-exported PNGs
means the set can be regenerated when the mark changes, and the maskable
variant cannot drift out of sync with the others.

Outputs (committed, so a fresh clone installs as a PWA without running this):
    public/icons/icon-180.png           iOS home screen
    public/icons/icon-192.png           Android launcher
    public/icons/icon-512.png           splash / store listing
    public/icons/icon-maskable-512.png  Android adaptive icon
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BLUE = "#2563EB"
WHITE = "#FFFFFF"
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"

#: Fonts to try, heaviest weight first. Any of these renders an acceptable "U";
#: the fallback is PIL's bitmap default, which is ugly but never crashes CI.
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).is_file():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render(size: int, *, maskable: bool) -> Image.Image:
    """One icon.

    `maskable` fills the whole square and shrinks the glyph into the centre
    80% safe zone — Android crops adaptive icons to a circle, and a mark drawn
    to the edge loses its corners.
    """
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if maskable:
        draw.rectangle((0, 0, size, size), fill=BLUE)
        glyph_size = int(size * 0.42)
    else:
        radius = int(size * 0.306)  # 11/36, straight off the design's chip
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BLUE)
        glyph_size = int(size * 0.58)

    font = load_font(glyph_size)
    # anchor="mm" centres on the glyph's own ink, which is what optical
    # centring needs — a "U" sits low if you centre its em box instead.
    draw.text((size / 2, size / 2), "U", font=font, fill=WHITE, anchor="mm")
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        path = OUT / f"icon-{size}.png"
        render(size, maskable=False).save(path)
        print(f"wrote {path.relative_to(Path.cwd())}")

    path = OUT / "icon-maskable-512.png"
    render(512, maskable=True).save(path)
    print(f"wrote {path.relative_to(Path.cwd())}")


if __name__ == "__main__":
    main()
