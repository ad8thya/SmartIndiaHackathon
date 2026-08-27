"""PascalVOC XML -> YOLO txt conversion.

Used by 01_prepare_rdd2022.ipynb (RDD2022 ships VOC XML) and available to
03/05 if a sourced dataset arrives in VOC rather than a Roboflow YOLO export.
Drops zero/negative-area boxes rather than letting them corrupt training,
reports orphaned images/annotations, and returns per-class instance counts so
class imbalance is visible immediately after conversion — not discovered
after a training run.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

_IMAGE_EXTS = (".jpg", ".jpeg", ".png")


@dataclass
class ConversionReport:
    images_total: int = 0
    xml_total: int = 0
    converted: int = 0
    orphan_images: list[str] = field(default_factory=list)
    orphan_xml: list[str] = field(default_factory=list)
    dropped_boxes: int = 0
    dropped_box_reasons: Counter = field(default_factory=Counter)
    unknown_classes: Counter = field(default_factory=Counter)
    class_counts: Counter = field(default_factory=Counter)

    def print_summary(self) -> None:
        print(f"images found:            {self.images_total}")
        print(f"XML annotations found:   {self.xml_total}")
        print(f"images converted:        {self.converted}")
        if self.orphan_images:
            sample = self.orphan_images[:5]
            print(f"orphan images (no XML):  {len(self.orphan_images)}  e.g. {sample}")
        if self.orphan_xml:
            sample = self.orphan_xml[:5]
            print(f"orphan XML (no image):   {len(self.orphan_xml)}  e.g. {sample}")
        if self.dropped_boxes:
            print(
                f"dropped boxes (zero/negative area): {self.dropped_boxes} "
                f"{dict(self.dropped_box_reasons)}"
            )
        if self.unknown_classes:
            print(
                f"UNKNOWN classes in XML (not in class_map — skipped): {dict(self.unknown_classes)}"
            )
        print("instances per class:")
        total = sum(self.class_counts.values()) or 1
        for name, n in sorted(self.class_counts.items(), key=lambda kv: -kv[1]):
            print(f"  {name:24s} {n:6d}  ({100 * n / total:5.1f}%)")


def _voc_size(root: ET.Element, image_path: Path) -> tuple[int, int]:
    size_el = root.find("size")
    if size_el is not None:
        w_el, h_el = size_el.find("width"), size_el.find("height")
        if w_el is not None and h_el is not None and w_el.text and h_el.text:
            return int(w_el.text), int(h_el.text)
    from PIL import Image

    with Image.open(image_path) as img:
        return img.size


def convert_voc_dir(
    images_dir: Path,
    annotations_dir: Path,
    class_map: dict[str, int],
    output_labels_dir: Path,
    image_exts: tuple[str, ...] = _IMAGE_EXTS,
) -> ConversionReport:
    """Converts every VOC XML in ``annotations_dir`` matching an image in
    ``images_dir`` into a YOLO ``.txt`` in ``output_labels_dir``.

    ``class_map`` maps VOC ``<name>`` text -> frozen YOLO index (see
    ``common.constants``). A box with a name not in ``class_map`` is skipped
    and counted in ``unknown_classes`` — it is not silently coerced to class 0.
    """
    images_dir, annotations_dir, output_labels_dir = (
        Path(images_dir),
        Path(annotations_dir),
        Path(output_labels_dir),
    )
    output_labels_dir.mkdir(parents=True, exist_ok=True)

    images_by_stem = {p.stem: p for p in images_dir.iterdir() if p.suffix.lower() in image_exts}
    xml_by_stem = {p.stem: p for p in annotations_dir.glob("*.xml")}

    report = ConversionReport(images_total=len(images_by_stem), xml_total=len(xml_by_stem))
    report.orphan_images = sorted(set(images_by_stem) - set(xml_by_stem))
    report.orphan_xml = sorted(set(xml_by_stem) - set(images_by_stem))

    for stem in sorted(set(images_by_stem) & set(xml_by_stem)):
        image_path = images_by_stem[stem]
        xml_path = xml_by_stem[stem]
        tree = ET.parse(xml_path)
        root = tree.getroot()
        img_w, img_h = _voc_size(root, image_path)

        lines: list[str] = []
        for obj in root.findall("object"):
            name_el = obj.find("name")
            name = name_el.text.strip() if name_el is not None and name_el.text else ""
            if name not in class_map:
                report.unknown_classes[name] += 1
                continue
            bnd = obj.find("bndbox")
            if bnd is None:
                report.dropped_boxes += 1
                report.dropped_box_reasons["missing_bndbox"] += 1
                continue
            try:
                xmin = float(bnd.find("xmin").text)  # type: ignore[union-attr, arg-type]
                ymin = float(bnd.find("ymin").text)  # type: ignore[union-attr, arg-type]
                xmax = float(bnd.find("xmax").text)  # type: ignore[union-attr, arg-type]
                ymax = float(bnd.find("ymax").text)  # type: ignore[union-attr, arg-type]
            except (AttributeError, TypeError, ValueError):
                report.dropped_boxes += 1
                report.dropped_box_reasons["unparsable_coords"] += 1
                continue

            xmin, xmax = max(0.0, min(xmin, xmax)), min(img_w, max(xmin, xmax))
            ymin, ymax = max(0.0, min(ymin, ymax)), min(img_h, max(ymin, ymax))
            if xmax <= xmin or ymax <= ymin:
                report.dropped_boxes += 1
                report.dropped_box_reasons["zero_or_negative_area"] += 1
                continue

            cls_id = class_map[name]
            x_center = (xmin + xmax) / 2 / img_w
            y_center = (ymin + ymax) / 2 / img_h
            box_w = (xmax - xmin) / img_w
            box_h = (ymax - ymin) / img_h
            lines.append(f"{cls_id} {x_center:.6f} {y_center:.6f} {box_w:.6f} {box_h:.6f}")
            report.class_counts[name] += 1

        (output_labels_dir / f"{stem}.txt").write_text("\n".join(lines) + ("\n" if lines else ""))
        report.converted += 1

    return report
