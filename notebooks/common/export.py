"""Export a trained checkpoint to ONNX and benchmark inference latency.

02/04/06 all call this the same way to produce ``models/yolo_*.onnx`` plus a
latency table; 07_evaluate_all.ipynb reuses ``benchmark_latency`` directly on
the three exported .onnx files to build the combined per-frame cost table
that backs any edge-feasibility claim.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import numpy as np


def export_onnx(pt_path: str | Path, imgsz: int = 640, opset: int = 12) -> Path:
    """.pt -> ONNX, opset 12 (matches the runtime on the edge box)."""
    from ultralytics import YOLO

    model = YOLO(str(pt_path))
    onnx_path = model.export(format="onnx", opset=opset, imgsz=imgsz, simplify=True)
    print(f"exported {pt_path} -> {onnx_path} (opset {opset}, imgsz {imgsz})")
    return Path(onnx_path)


def benchmark_latency(
    pt_path: str | Path,
    onnx_path: str | Path,
    imgsz: int = 640,
    n_warmup: int = 5,
    n_runs: int = 30,
) -> dict[str, float | None]:
    """Returns ``{"torch_gpu_ms", "torch_cpu_ms", "onnx_cpu_ms"}`` — ``None`` for an
    unavailable backend (no GPU, or onnxruntime not installed) rather than
    silently omitting the key, so the caller can see what was skipped and why.
    """
    import torch
    from ultralytics import YOLO

    dummy = np.random.randint(0, 255, (imgsz, imgsz, 3), dtype=np.uint8)
    results: dict[str, float | None] = {
        "torch_gpu_ms": None,
        "torch_cpu_ms": None,
        "onnx_cpu_ms": None,
    }

    for device, key in (("cuda", "torch_gpu_ms"), ("cpu", "torch_cpu_ms")):
        if device == "cuda" and not torch.cuda.is_available():
            continue
        model: Any = YOLO(str(pt_path))
        model.to(device)
        for _ in range(n_warmup):
            model.predict(dummy, device=device, verbose=False)
        t0 = time.perf_counter()
        for _ in range(n_runs):
            model.predict(dummy, device=device, verbose=False)
        results[key] = (time.perf_counter() - t0) / n_runs * 1000

    try:
        import onnxruntime as ort

        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        input_name = sess.get_inputs()[0].name
        blob = dummy.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
        for _ in range(n_warmup):
            sess.run(None, {input_name: blob})
        t0 = time.perf_counter()
        for _ in range(n_runs):
            sess.run(None, {input_name: blob})
        results["onnx_cpu_ms"] = (time.perf_counter() - t0) / n_runs * 1000
    except ImportError:
        print("onnxruntime not installed — skipping onnx_cpu benchmark (pip install onnxruntime)")

    return results


def print_latency_table(results: dict[str, float | None]) -> None:
    print(f"{'backend':<14}{'latency (ms)':>14}{'fps':>10}")
    for key, ms in results.items():
        label = key.replace("_ms", "")
        if ms is None:
            print(f"{label:<14}{'n/a':>14}{'':>10}")
        else:
            print(f"{label:<14}{ms:>13.2f}{1000 / ms:>9.1f}")
