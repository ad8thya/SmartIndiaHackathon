"""Render a MODEL_CARD.md from a metrics dict.

Every train notebook (02/04/06) calls :func:`render_model_card` once at the
end; 07_evaluate_all.ipynb concatenates all three cards into
``models/MODEL_CARDS.md`` for the deck appendix.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def render_model_card(
    *,
    model_name: str,
    owner: str,
    base_weights: str,
    dataset: str,
    dataset_size: dict[str, int],
    class_names: dict[int, str],
    hyperparameters: dict[str, Any],
    metrics_table_md: str,
    confidence_chosen: float | None = None,
    confidence_rationale: str | None = None,
    latency: dict[str, float | None] | None = None,
    caveats: list[str] | None = None,
    output_path: str | Path = "models/MODEL_CARD.md",
) -> Path:
    lines = [
        f"# {model_name}",
        "",
        f"- **Owner:** {owner}",
        f"- **Generated:** {datetime.now(UTC).isoformat(timespec='seconds')}",
        f"- **Base weights:** {base_weights}",
        f"- **Dataset:** {dataset}",
        "- **Dataset size:** " + ", ".join(f"{k}={v}" for k, v in dataset_size.items()),
        "",
        "## Classes (frozen indices — see notebooks/common/constants.py)",
        "",
        "| index | class |",
        "|---|---|",
    ]
    lines += [f"| {idx} | {class_names[idx]} |" for idx in sorted(class_names)]

    lines += ["", "## Hyperparameters", "", "| key | value |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in hyperparameters.items()]

    lines += ["", "## Metrics (test split)", "", metrics_table_md, ""]

    if confidence_chosen is not None:
        lines += [
            "## Deployment confidence threshold",
            "",
            f"**Chosen: {confidence_chosen}**",
            "",
            confidence_rationale or "",
            "",
        ]

    if latency:
        lines += ["## Latency", "", "| backend | ms | fps |", "|---|---|---|"]
        for key, ms in latency.items():
            label = key.replace("_ms", "")
            lines.append(
                f"| {label} | n/a | n/a |"
                if ms is None
                else f"| {label} | {ms:.2f} | {1000 / ms:.1f} |"
            )
        lines.append("")

    if caveats:
        lines += ["## Caveats", "", *[f"- {c}" for c in caveats], ""]

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines))
    print(f"model card written to {output_path}")
    return output_path
