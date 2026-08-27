"""Render N random images with their YOLO boxes drawn, as one PNG contact sheet.

Used identically by 01 (RDD2022), 03 (hazards) and 05 (plates) right after
conversion, and again by 02/04 for failure-analysis sheets of worst
false-positives/negatives.

LOOK AT THE OUTPUT. Offset or inverted boxes mean the conversion (VOC->YOLO or
Roboflow export) is broken. Training will run happily on broken boxes and
produce a model with a normal-looking loss curve that is useless in the
field. Ten seconds spent looking at this image saves a day spent debugging
why the trained model is garbage.
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_PALETTE = [
    (230, 25, 75),
    (60, 180, 75),
    (255, 225, 25),
    (0, 130, 200),
    (245, 130, 48),
    (145, 30, 180),
    (70, 240, 240),
    (240, 50, 230),
]


def _load_font(size: int = 14) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except OSError:
        return ImageFont.load_default()


def render_contact_sheet(
    images_dir: Path,
    labels_dir: Path,
    class_names: dict[int, str] | list[str],
    output_path: Path,
    n: int = 12,
    cols: int = 4,
    thumb_size: int = 320,
    seed: int = 42,
    image_exts: tuple[str, ...] = (".jpg", ".jpeg", ".png"),
) -> Path:
    if isinstance(class_names, list):
        class_names = dict(enumerate(class_names))

    images = sorted(p for p in Path(images_dir).iterdir() if p.suffix.lower() in image_exts)
    if not images:
        raise FileNotFoundError(f"no images found in {images_dir}")

    rng = random.Random(seed)
    sample = rng.sample(images, min(n, len(images)))
    rows = (len(sample) + cols - 1) // cols

    sheet = Image.new("RGB", (cols * thumb_size, rows * thumb_size), (30, 30, 30))
    font = _load_font()
    sheet_draw = ImageDraw.Draw(sheet)

    for idx, img_path in enumerate(sample):
        img = Image.open(img_path).convert("RGB")
        w, h = img.size
        draw = ImageDraw.Draw(img)
        label_path = Path(labels_dir) / f"{img_path.stem}.txt"
        n_boxes = 0

        if label_path.exists():
            for line in label_path.read_text().splitlines():
                parts = line.split()
                if len(parts) != 5:
                    continue
                cls_id = int(parts[0])
                xc, yc, bw, bh = (float(v) for v in parts[1:])
                x1, y1 = (xc - bw / 2) * w, (yc - bh / 2) * h
                x2, y2 = (xc + bw / 2) * w, (yc + bh / 2) * h
                color = _PALETTE[cls_id % len(_PALETTE)]
                draw.rectangle([x1, y1, x2, y2], outline=color, width=max(2, w // 200))
                name = class_names.get(cls_id, f"cls{cls_id}")
                draw.text((x1 + 2, max(0, y1 - 16)), name, fill=color, font=font)
                n_boxes += 1

        thumb = img.resize((thumb_size, thumb_size))
        row, col = divmod(idx, cols)
        sheet.paste(thumb, (col * thumb_size, row * thumb_size))
        caption = f"{img_path.stem} ({n_boxes} box{'es' if n_boxes != 1 else ''})"
        sheet_draw.rectangle(
            [
                col * thumb_size,
                row * thumb_size + thumb_size - 18,
                (col + 1) * thumb_size,
                (row + 1) * thumb_size,
            ],
            fill=(0, 0, 0),
        )
        sheet_draw.text(
            (col * thumb_size + 4, row * thumb_size + thumb_size - 16),
            caption,
            fill=(255, 255, 255),
            font=font,
        )

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)

    print(f"contact sheet written to {output_path} — {len(sample)} images.")
    print("STOP AND LOOK AT IT before running anything else in this notebook.")
    print(
        "Offset or inverted boxes = broken conversion. "
        "Ten seconds here saves a day of training on garbage."
    )
    return output_path
