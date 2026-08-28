"""FROZEN class index -> name mappings for the three perception models.

These indices are load-bearing: ``services/edge/defects/inference.py`` (and the
hazard/plate equivalents downstream) map raw model output by INDEX, not by
name. If a ``data.yaml`` lists classes in a different order than here, the
trained model's outputs get silently mislabelled once deployed — a POTHOLE
becomes a LONGITUDINAL_CRACK and nothing raises an error to tell you.

Every 01/03/05 dataset-prep notebook asserts against this file before writing
``data.yaml``. Every 02/04/06 training notebook asserts against it again right
before ``model.train(...)`` starts. Both checks call :func:`assert_class_order`
below.

DO NOT reorder, insert into the middle of, or delete an entry after a
prepare notebook has been run once — that silently reorders every checkpoint
already trained against the old order too. Appending a new class at the next
free index is fine; changing an existing index is not.
"""

from __future__ import annotations

#: yolo_rdd.pt — RDD2022 road-damage classes, D-code is the RDD2022 name.
RDD_CLASSES: dict[int, str] = {
    0: "D00",  # LONGITUDINAL_CRACK
    1: "D10",  # TRANSVERSE_CRACK
    2: "D20",  # ALLIGATOR_CRACK
    3: "D40",  # POTHOLE — the minority class the whole pitch is about
}

#: RDD2022 D-code -> contracts.DetectionClass name.
RDD_TO_DETECTION_CLASS: dict[str, str] = {
    "D00": "LONGITUDINAL_CRACK",
    "D10": "TRANSVERSE_CRACK",
    "D20": "ALLIGATOR_CRACK",
    "D40": "POTHOLE",
}

#: yolo_hazard.pt — self-annotated hazard classes.
#: DAMAGED_DIVIDER was dropped (2026-08-28): the only Indian-specific lead
#: (DATS_2022, Mendeley, CC BY 4.0) could not be verified — its file API is
#: inaccessible without a browser session, and the source paper's full text
#: mentions "divider" exactly once, as background-scene prose, never as an
#: entry in its class table. No other candidate (Roboflow guardrail sets)
#: had a confirmable licence. WATERLOGGING stayed IN despite foreign-geography
#: data (see notebook 03 Step 1 and the eventual MODEL_CARD_hazard.md caveat)
#: — an honestly-caveated class beats not having it.
HAZARD_CLASSES: dict[int, str] = {
    0: "FADED_ZEBRA",
    1: "DAMAGED_SIGN",
    2: "WATERLOGGING",
}

#: index -> contracts.DetectionClass name, ready to drop straight into a
#: data.yaml `names:` block and into assert_class_order for the RDD model.
#: (VOC XML carries the D-code; the *model* should be trained against — and
#: report metrics against — the same names inference.py's DetectionClass
#: enum uses, so a notebook printout and a production log say the same word.)
RDD_DETECTION_NAMES: dict[int, str] = {
    idx: RDD_TO_DETECTION_CLASS[code] for idx, code in RDD_CLASSES.items()
}

#: yolo_plate.pt — single-class plate detector.
PLATE_CLASSES: dict[int, str] = {
    0: "PLATE",
}

#: Output checkpoint filenames — kept in one place so a training notebook and
#: 07_evaluate_all.ipynb never disagree on where a model landed.
MODEL_FILES: dict[str, str] = {
    "rdd": "yolo_rdd.pt",
    "hazard": "yolo_hazard.pt",
    "plate": "yolo_plate.pt",
}


def assert_class_order(
    data_yaml_names: list[str] | dict[int, str],
    expected: dict[int, str],
    model_key: str,
) -> None:
    """Fail loudly if a ``data.yaml``'s class order doesn't match the frozen indices.

    Call this immediately after loading ``data.yaml``, in every prepare AND
    every train notebook — a mismatch introduced between the two (someone
    hand-edited data.yaml) is exactly the silent-mislabel failure mode this
    file exists to catch.

    ``data_yaml_names`` is whatever ``yaml.safe_load(...)["names"]`` returns:
    ultralytics accepts either a list (index = position) or a ``{index: name}``
    dict, so this accepts both.
    """
    actual = (
        dict(enumerate(data_yaml_names))
        if isinstance(data_yaml_names, list)
        else dict(data_yaml_names)
    )
    if actual != expected:
        raise AssertionError(
            f"[{model_key}] data.yaml class order {actual} does NOT match the "
            f"FROZEN indices {expected} in notebooks/common/constants.py.\n"
            "Fix data.yaml's `names:` list to match — do not change constants.py, "
            "inference.py maps by index and other people's code depends on it."
        )
    print(f"[{model_key}] class order OK — matches frozen indices: {expected}")
