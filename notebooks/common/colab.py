"""Detect Colab vs local, mount Drive, and settle on DATA_ROOT / MODEL_ROOT.

Every notebook's first real cell calls :func:`setup_environment`. On Colab this
clones (or pulls) the repo, mounts Drive, and points DATA_ROOT/MODEL_ROOT at
Drive so a checkpoint survives a dropped session. Locally it just finds the
repo root from wherever the notebook is running and uses ``data/`` and
``models/`` inside it, matching the paths every other module in this repo
already uses (see ``services/edge/defects/config.py``'s ``DEFECT_MODEL_PATH``).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import TypedDict

#: This repo's own remote — used only to clone it onto a fresh Colab runtime.
REPO_URL = "https://github.com/ad8thya/SmartIndiaHackathon.git"
REPO_DIRNAME = "SmartIndiaHackathon"
DRIVE_SUBDIR = "urban-twin-ml"


class Environment(TypedDict):
    colab: bool
    repo_root: Path
    data_root: Path
    model_root: Path


def in_colab() -> bool:
    try:
        import google.colab  # noqa: F401

        return True
    except ImportError:
        return False


def _find_repo_root_local() -> Path:
    """Walk upward from cwd looking for the repo root (pyproject.toml + notebooks/)."""
    here = Path.cwd().resolve()
    for candidate in (here, *here.parents):
        if (candidate / "pyproject.toml").exists() and (candidate / "notebooks").exists():
            return candidate
    raise RuntimeError(
        "Could not find the repo root (looked for pyproject.toml + notebooks/ "
        f"walking up from {here}). Run this notebook from inside a checkout of "
        f"{REPO_URL}, e.g. from notebooks/ itself."
    )


def setup_environment(mount_drive: bool = True) -> Environment:
    """Idempotent environment bootstrap. Safe to call at the top of every notebook.

    Returns a dict with ``colab``, ``repo_root``, ``data_root``, ``model_root``.
    Also chdir's to the repo root and puts it (plus notebooks/) on sys.path so
    ``from common import ...`` and ``from contracts import ...`` both work.
    """
    colab = in_colab()

    if colab:
        if mount_drive:
            from google.colab import drive

            drive.mount("/content/drive")

        repo_root = Path("/content") / REPO_DIRNAME
        if not repo_root.exists():
            print(f"cloning {REPO_URL} -> {repo_root}")
            subprocess.run(["git", "clone", REPO_URL, str(repo_root)], check=True)
        else:
            print(f"{repo_root} already present — pulling latest")
            subprocess.run(["git", "-C", str(repo_root), "pull", "--ff-only"], check=False)

        drive_root = Path("/content/drive/MyDrive") / DRIVE_SUBDIR
        data_root = drive_root / "data"
        model_root = drive_root / "models"
        data_root.mkdir(parents=True, exist_ok=True)
        model_root.mkdir(parents=True, exist_ok=True)
        print(f"Drive-backed DATA_ROOT:  {data_root}")
        print(f"Drive-backed MODEL_ROOT: {model_root}")
        print(
            "Checkpoints and datasets live on Drive — a dropped Colab session does not lose them."
        )
    else:
        repo_root = _find_repo_root_local()
        data_root = repo_root / "data"
        model_root = repo_root / "models"
        data_root.mkdir(parents=True, exist_ok=True)
        model_root.mkdir(parents=True, exist_ok=True)
        print(f"local run — repo root: {repo_root}")

    for p in (str(repo_root), str(repo_root / "notebooks")):
        if p not in sys.path:
            sys.path.insert(0, p)
    os.chdir(repo_root)

    return {
        "colab": colab,
        "repo_root": repo_root,
        "data_root": data_root,
        "model_root": model_root,
    }


def gpu_report() -> dict[str, object]:
    """Prints and returns a torch/CUDA summary. Call after installing deps."""
    import torch

    mps_available = torch.backends.mps.is_available()
    info: dict[str, object] = {
        "torch_version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "mps_available": mps_available,
    }
    print(f"torch {torch.__version__}")
    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        info["gpu_name"] = name
        info["vram_gb"] = round(vram_gb, 1)
        print(f"CUDA available — {name}, {vram_gb:.1f} GB VRAM")
    elif mps_available:
        info["gpu_name"] = "Apple Silicon (MPS)"
        print("NO CUDA GPU on this runtime, but MPS (Apple Silicon) is available.")
        print("Pass device='mps' to ultralytics for local inference (e.g. Phase 4 plate/")
        print("hazard smoke tests) — it is meaningfully faster than CPU for that.")
        print("MPS does not replace Colab for training — keep 01/02/04/06 on a T4 runtime.")
    else:
        print("NO GPU DETECTED.")
        print("Training on CPU works but is roughly 10-20x slower than a T4.")
        print("If you are local without a GPU, switch to Colab instead:")
        print("  Runtime -> Change runtime type -> T4 GPU  (https://colab.research.google.com)")
    return info


def recommended_batch_size(vram_gb: float | None, imgsz: int = 640) -> int:
    """A conservative starting batch size for YOLO11 at the given VRAM and image size.

    Rules of thumb, not a promise — if you hit a CUDA OOM, halve it and retry
    rather than trusting this blindly. ``batch=-1`` (ultralytics' auto-batch)
    is a safer default when in doubt; this exists so the setup notebook can
    print a concrete number rather than "it depends."
    """
    if not vram_gb:
        return 8
    scale = 640 / max(imgsz, 1)
    if vram_gb >= 40:
        base = 64
    elif vram_gb >= 24:
        base = 48
    elif vram_gb >= 16:
        base = 32
    elif vram_gb >= 12:
        base = 24
    elif vram_gb >= 8:
        base = 16
    else:
        base = 8
    return max(4, int(base * scale))
