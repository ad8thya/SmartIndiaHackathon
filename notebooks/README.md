# ML Training Notebooks

Trains the three YOLO checkpoints `services/edge/defects/impl.py` (and its
hazard/plate equivalents) load: `models/yolo_rdd.pt`, `models/yolo_hazard.pt`,
`models/yolo_plate.pt`. Two people run this in parallel, on separate
machines/Colab accounts — the ownership split below is designed so neither
blocks on the other until `07_evaluate_all.ipynb`.

Nothing here has been executed. `data/` and `models/` are gitignored — every
notebook downloads/trains into them locally (or onto Drive, on Colab) and
none of it is meant to be committed.

## Ownership + run order

| # | Notebook | Owner | Runtime | Depends on |
|---|---|---|---|---|
| 00 | `00_setup_verify.ipynb` | **both** | 10 min | nothing — run first, on every machine |
| 01 | `01_prepare_rdd2022.ipynb` | Member A (M1) | 1-3 hrs (mostly download) | 00 |
| 02 | `02_train_road_damage.ipynb` | Member A (M1) | ~2 hrs (T4) | 01 |
| 03 | `03_prepare_hazards.ipynb` | Member B (M4) | 3-4 hrs, **mostly manual** | 00 — start this first, it doesn't need a GPU |
| 04 | `04_train_hazards.ipynb` | Member B (M4) | ~1 hr (T4) | 03 |
| 05 | `05_prepare_plates.ipynb` | Member B (M4) | ~1 hr | 00 |
| 06 | `06_train_plates.ipynb` | Member B (M4) | ~40 min — **skipped if 05 found a usable pretrained model** | 05 |
| 07 | `07_evaluate_all.ipynb` | **either**, last | ~20 min | 02, 04, and (06 or 05's pretrained path) |

**Member A's chain:** 00 → 01 → 02 → (wait for B) → 07
**Member B's chain:** 00 → 03 → 04, and independently 05 → 06 → (wait for A) → 07

Member B should start **03** immediately — it is the slowest task on the
whole ML track (sourcing + hand-annotating ~400 images) and doesn't touch a
GPU while waiting on people, so it should not be sequenced behind anything.

## Shared code — `notebooks/common/`

Both members import from here so conversion/eval/export logic exists once,
not twice:

| file | purpose |
|---|---|
| `constants.py` | **FROZEN** class index → name mappings. See below. |
| `colab.py` | Colab vs local detection, Drive mount, `DATA_ROOT`/`MODEL_ROOT`, GPU report |
| `voc_to_yolo.py` | PascalVOC XML → YOLO txt (drops zero/negative-area boxes, reports orphans, per-class counts) |
| `splits.py` | Stratified train/val/test split, seed=42 |
| `contact_sheet.py` | N random images with boxes drawn → one PNG grid — **look at this before training** |
| `evaluate.py` | Per-class P/R/mAP50/mAP50-95, confusion matrix, confidence sweep, worst-FP/FN finder |
| `export.py` | `.pt` → ONNX (opset 12), latency benchmark across torch GPU / torch CPU / ONNX CPU |
| `model_card.py` | Renders a `MODEL_CARD.md` from a metrics dict |

Every notebook's first 3 cells are identical: (1) a dependency-free bootstrap
that clones the repo on Colab so `common/` exists to import from, (2)
`pip install -e ".[ml]"`, (3) `common.colab.setup_environment()` + an import
check printing the torch version and CUDA availability.

## Frozen class indices — DO NOT REORDER

`services/edge/defects/impl.py` (and the hazard/plate equivalents downstream
of it) map raw model output by **index**, not by name. If a `data.yaml`
lists classes in a different order than `notebooks/common/constants.py`, the
trained model's outputs get **silently mislabelled** once deployed — nothing
raises an error to tell you a POTHOLE became a LONGITUDINAL_CRACK. Every
prepare notebook (01/03/05) and every train notebook (02/04/06) calls
`constants.assert_class_order(...)` and fails loudly on a mismatch.

**`yolo_rdd.pt`** (RDD2022, 4 classes)

| index | RDD2022 code | class |
|---|---|---|
| 0 | D00 | LONGITUDINAL_CRACK |
| 1 | D10 | TRANSVERSE_CRACK |
| 2 | D20 | ALLIGATOR_CRACK |
| 3 | D40 | POTHOLE — the minority class the whole pitch is about |

**`yolo_hazard.pt`** (self-annotated, 4 classes)

| index | class |
|---|---|
| 0 | WATERLOGGING |
| 1 | DAMAGED_DIVIDER |
| 2 | FADED_ZEBRA |
| 3 | MISSING_SIGN |

**`yolo_plate.pt`** (single class)

| index | class |
|---|---|
| 0 | PLATE |

Appending a new class at the next free index is fine, after the fact.
Reordering, inserting into the middle, or deleting an existing index is not —
that silently reorders every checkpoint already trained against the old order.

## Rules every notebook follows

- Colab-first, local fallback — cell 1 detects which and behaves accordingly.
- Everything is seeded (42) — reproducibility is a Q&A answer.
- On Colab, checkpoints and datasets save to Drive (`/content/drive/MyDrive/urban-twin-ml/`)
  — a dropped Colab session does not lose a multi-hour run.
- Weights and datasets are never committed — `.gitignore` covers `*.pt`,
  `*.onnx`, `models/`, and each dataset's working directory under `data/`.
- A download failure or an empty class fails loudly with a clear message,
  rather than silently proceeding on broken data.
- Every notebook ends with what it produced, where, and which notebook runs next.

## Troubleshooting

**Colab OOM (CUDA out of memory) during training**
Halve `batch` from whatever `00_setup_verify.ipynb` recommended (or set an
explicit `batch=` instead of `batch=-1` auto-batch) and re-run the training
cell. If it recurs at a small batch, the Colab tier's GPU may be smaller than
expected — check `Runtime > View resources`.

**Colab session disconnected mid-run**
Checkpoints save to Drive continuously via ultralytics' own
`save_period`/last-epoch checkpointing under `MODEL_ROOT/runs/.../weights/`.
Reconnect, re-run the bootstrap cells (idempotent — they detect the repo is
already cloned and Drive already mounted), then resume with
`YOLO("<path to last.pt>").train(resume=True)` instead of starting a fresh
`YOLO("yolo11s.pt")` run.

**CUDA / torch version mismatch**
`pip install -e ".[ml]"` pins reasonable floors (`torch>=2.5`) but doesn't
pin an exact CUDA build. If `torch.cuda.is_available()` is `False` on a
machine you know has a GPU, reinstall torch for your CUDA version explicitly
per [pytorch.org/get-started](https://pytorch.org/get-started/locally/)
*before* re-running `pip install -e ".[ml]"` (so it doesn't overwrite your
CUDA-specific build with a generic one).

**Roboflow export format**
Export as **YOLOv11** (or YOLOv8 — same YOLO-txt box format) from Roboflow,
not COCO/VOC/TFRecord. The notebooks expect a `data.yaml` plus
`images/`/`labels/` folders somewhere under the extracted zip; if Roboflow's
folder layout has drifted since this was written, the notebooks print what
they found and where they looked so you can adjust the path by hand.

**A class comes back empty / under the minimum**
`03_prepare_hazards.ipynb` refuses to proceed with fewer than 50 images in
any class (Step 6) — go back and source more for that class, or drop
MISSING_SIGN first per the guidance in Step 1. Don't lower the minimum to get
past the check; a per-class number below it isn't a reportable accuracy claim.
