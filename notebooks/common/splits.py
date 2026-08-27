"""Stratified train/val/test split, seed=42, reproducible.

Random splitting on an imbalanced dataset can (and, on a small enough sample,
will) concentrate a minority class into one split — see RDD2022's D40/POTHOLE
in notebook 01, or any single hazard class in notebook 03. This stratifies by
each image's *rarest* present class so minority classes get spread across
train/val/test roughly in proportion, then copies (not moves — the source
conversion output stays intact) images+labels into the standard YOLO layout.
"""

from __future__ import annotations

import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path

Ratios = tuple[float, float, float]
DEFAULT_RATIOS: Ratios = (0.8, 0.1, 0.1)


def stratified_split(
    image_class_map: dict[str, set[int]],
    ratios: Ratios = DEFAULT_RATIOS,
    seed: int = 42,
) -> dict[str, list[str]]:
    """Splits image ids into train/val/test, stratified by rarest present class.

    ``image_class_map`` maps an image id (filename stem) -> the set of class
    indices present in its label file. An image with an empty set (background
    only) is stratified as its own bucket.
    """
    if abs(sum(ratios) - 1.0) > 1e-6:
        raise ValueError(f"ratios must sum to 1.0, got {ratios}")
    rng = random.Random(seed)

    class_frequency: Counter[int] = Counter()
    for classes in image_class_map.values():
        class_frequency.update(classes)

    def rarest_class(classes: set[int]) -> int:
        return min(classes, key=lambda c: class_frequency[c]) if classes else -1

    buckets: dict[int, list[str]] = defaultdict(list)
    for image_id, classes in image_class_map.items():
        buckets[rarest_class(classes)].append(image_id)

    splits: dict[str, list[str]] = {"train": [], "val": [], "test": []}
    for key in sorted(buckets):
        images = buckets[key][:]
        rng.shuffle(images)
        n = len(images)
        n_train = round(n * ratios[0])
        n_val = round(n * ratios[1])
        splits["train"].extend(images[:n_train])
        splits["val"].extend(images[n_train : n_train + n_val])
        splits["test"].extend(images[n_train + n_val :])

    for name in splits:
        rng.shuffle(splits[name])
    return splits


def report_split_balance(
    image_class_map: dict[str, set[int]], splits: dict[str, list[str]], class_names: dict[int, str]
) -> None:
    """Prints a per-class, per-split instance table — the sanity check for
    "did stratification actually work," not just "did the split run."
    """
    counts: dict[str, Counter[int]] = {name: Counter() for name in splits}
    for split_name, ids in splits.items():
        for image_id in ids:
            counts[split_name].update(image_class_map.get(image_id, set()))

    header = f"{'class':<24}" + "".join(f"{s:>10}" for s in splits)
    print(header)
    for idx in sorted(class_names):
        row = f"{class_names[idx]:<24}"
        row += "".join(f"{counts[s].get(idx, 0):>10}" for s in splits)
        print(row)
    print(f"{'TOTAL images':<24}" + "".join(f"{len(splits[s]):>10}" for s in splits))


def materialize_split(
    image_class_map: dict[str, set[int]],
    splits: dict[str, list[str]],
    images_src: Path,
    labels_src: Path,
    output_root: Path,
    image_exts: tuple[str, ...] = (".jpg", ".jpeg", ".png"),
) -> None:
    """Copies images+labels into ``output_root/{images,labels}/{train,val,test}/``.

    This is the layout ultralytics' YOLO trainer expects and that
    ``data.yaml`` in 01/03/05 points at.
    """
    images_src, labels_src, output_root = Path(images_src), Path(labels_src), Path(output_root)
    ext_by_stem = {p.stem: p.suffix for p in images_src.iterdir() if p.suffix.lower() in image_exts}

    for split_name, ids in splits.items():
        img_dst = output_root / "images" / split_name
        lbl_dst = output_root / "labels" / split_name
        img_dst.mkdir(parents=True, exist_ok=True)
        lbl_dst.mkdir(parents=True, exist_ok=True)
        for image_id in ids:
            ext = ext_by_stem.get(image_id)
            if ext is None:
                print(f"WARNING: {image_id} has no source image, skipping in {split_name}")
                continue
            shutil.copy2(images_src / f"{image_id}{ext}", img_dst / f"{image_id}{ext}")
            label_src_path = labels_src / f"{image_id}.txt"
            if label_src_path.exists():
                shutil.copy2(label_src_path, lbl_dst / f"{image_id}.txt")
            else:
                (lbl_dst / f"{image_id}.txt").write_text("")
    print(f"materialized {sum(len(v) for v in splits.values())} images -> {output_root}")
