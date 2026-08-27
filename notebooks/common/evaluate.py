"""Evaluation helpers wrapping ultralytics' built-in validator.

02 (road damage) and 04 (hazards) both call these the same way; 06 (plates)
uses ``per_class_table`` and ``confidence_sweep`` too and then adds its own OCR
string-accuracy pass on top in the notebook itself — that is not a detection
metric so it does not belong in this module.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import pandas as pd
from PIL import Image


def per_class_table(
    model: Any, data_yaml: str, split: str = "test", conf: float = 0.25, **val_kwargs: Any
) -> pd.DataFrame:
    """Runs ``model.val()`` on ``split`` and returns a per-class P/R/mAP50/mAP50-95 table.

    Always evaluate on ``split="test"`` for the number that goes in the deck —
    val is for picking hyperparameters during training, not for reporting.
    """
    metrics = model.val(data=data_yaml, split=split, conf=conf, verbose=False, **val_kwargs)
    names = metrics.names
    p, r, ap50, ap = metrics.box.p, metrics.box.r, metrics.box.ap50, metrics.box.ap

    rows = []
    for i, idx in enumerate(sorted(names)):
        rows.append(
            {
                "class": names[idx],
                "precision": float(p[i]) if i < len(p) else float("nan"),
                "recall": float(r[i]) if i < len(r) else float("nan"),
                "mAP50": float(ap50[i]) if i < len(ap50) else float("nan"),
                "mAP50-95": float(ap[i]) if i < len(ap) else float("nan"),
            }
        )
    df = pd.DataFrame(rows)
    mean_row = pd.DataFrame(
        [
            {
                "class": "ALL (mean)",
                "precision": df.precision.mean(),
                "recall": df.recall.mean(),
                "mAP50": df["mAP50"].mean(),
                "mAP50-95": df["mAP50-95"].mean(),
            }
        ]
    )
    return pd.concat([df, mean_row], ignore_index=True)


def confidence_sweep(
    model: Any,
    data_yaml: str,
    split: str = "test",
    thresholds: tuple[float, ...] = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7),
) -> pd.DataFrame:
    """Runs val() at each confidence threshold; returns overall P/R/mAP50/mAP50-95 per threshold.

    Use this to choose a deployment confidence deliberately instead of
    defaulting to 0.25 — see notebook 02 §5 for the precision-favouring
    rationale behind the RDD pothole model's choice.
    """
    rows = []
    for conf in thresholds:
        metrics = model.val(data=data_yaml, split=split, conf=conf, verbose=False)
        rows.append(
            {
                "conf": conf,
                "precision": float(metrics.box.mp),
                "recall": float(metrics.box.mr),
                "mAP50": float(metrics.box.map50),
                "mAP50-95": float(metrics.box.map),
            }
        )
    return pd.DataFrame(rows)


def plot_confusion_matrix(model: Any, data_yaml: str, split: str, output_path: Path) -> Path:
    """Delegates to ultralytics' own confusion-matrix plot, copied to ``output_path``."""
    metrics = model.val(data=data_yaml, split=split, plots=True, verbose=False)
    save_dir = Path(metrics.save_dir)
    src = save_dir / "confusion_matrix_normalized.png"
    if not src.exists():
        src = save_dir / "confusion_matrix.png"

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if src.exists():
        shutil.copy(src, output_path)
        print(f"confusion matrix -> {output_path}")
    else:
        print(f"WARNING: ultralytics did not produce a confusion matrix under {save_dir}")
    return output_path


def _yolo_txt_to_boxes(
    label_path: Path, img_w: int, img_h: int
) -> list[tuple[int, float, float, float, float]]:
    if not label_path.exists():
        return []
    boxes = []
    for line in label_path.read_text().splitlines():
        parts = line.split()
        if len(parts) != 5:
            continue
        cls_id = int(parts[0])
        xc, yc, bw, bh = (float(v) for v in parts[1:])
        x1, y1 = (xc - bw / 2) * img_w, (yc - bh / 2) * img_h
        x2, y2 = (xc + bw / 2) * img_w, (yc + bh / 2) * img_h
        boxes.append((cls_id, x1, y1, x2, y2))
    return boxes


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def worst_predictions(
    model: Any,
    images_dir: Path,
    labels_dir: Path,
    class_names: dict[int, str] | list[str],
    n: int = 20,
    mode: str = "false_positive",
    conf: float = 0.25,
    iou_thresh: float = 0.5,
    image_exts: tuple[str, ...] = (".jpg", ".jpeg", ".png"),
) -> list[tuple[Path, str, float]]:
    """Returns up to ``n`` ``(image_path, note, score)`` tuples for failure-analysis sheets.

    mode="false_positive": predicted boxes with no matching ground-truth box,
        worst-first by confidence — the model was *sure* about something wrong.
    mode="false_negative": ground-truth boxes the model missed entirely.
    """
    if mode not in ("false_positive", "false_negative"):
        raise ValueError("mode must be 'false_positive' or 'false_negative'")
    if isinstance(class_names, list):
        class_names = dict(enumerate(class_names))

    images_dir, labels_dir = Path(images_dir), Path(labels_dir)
    image_paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in image_exts)
    results = model.predict(source=[str(p) for p in image_paths], conf=conf, verbose=False)

    findings: list[tuple[Path, str, float]] = []
    for img_path, result in zip(image_paths, results, strict=True):
        w, h = Image.open(img_path).size
        gt = _yolo_txt_to_boxes(labels_dir / f"{img_path.stem}.txt", w, h)
        preds = []
        for box in result.boxes:
            cls_id = int(box.cls.item())
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            preds.append((cls_id, (x1, y1, x2, y2), float(box.conf.item())))

        matched_gt: set[int] = set()
        matched_pred: set[int] = set()
        for pi, (pcls, pbox, _pconf) in enumerate(preds):
            best_iou, best_gi = 0.0, -1
            for gi, (gcls, *gbox) in enumerate(gt):
                if gi in matched_gt or gcls != pcls:
                    continue
                iou = _iou(pbox, tuple(gbox))  # type: ignore[arg-type]
                if iou > best_iou:
                    best_iou, best_gi = iou, gi
            if best_iou >= iou_thresh:
                matched_gt.add(best_gi)
                matched_pred.add(pi)

        if mode == "false_positive":
            for pi, (pcls, _pbox, pconf) in enumerate(preds):
                if pi not in matched_pred:
                    findings.append(
                        (img_path, f"FP {class_names.get(pcls, pcls)} conf={pconf:.2f}", pconf)
                    )
        else:
            for gi, (gcls, *_gbox) in enumerate(gt):
                if gi not in matched_gt:
                    findings.append((img_path, f"FN {class_names.get(gcls, gcls)} (missed)", 1.0))

    findings.sort(key=lambda f: -f[2])
    return findings[:n]
