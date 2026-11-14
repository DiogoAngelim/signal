#!/usr/bin/env python3
"""Source-authenticated NSW RCT earnings predictions, research only.

Fetch external source at frozen Git commit in CI. Train on a SHA256 70% split,
never consult its test outcome for fitting. No counterfactual wages are invented.
The source randomizes JOB TRAINING, not use of Signal; earnings are not profit.
"""
import csv
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SOURCE_COMMIT = "1dcc2bf5f955cc1224a3e1307256e1fe86b68dae"
SOURCE_PATH = "csv/causaldata/nsw_mixtape.csv"
SOURCE_REPO = "vincentarelbundock/Rdatasets"
SOURCE_VERSION = "signal-nsw-evidence-trial-precommitted-20261114-v1"
EXPECTED_SOURCE_SHA256 = ""  # Git snapshot SHA first; pin source bytes after first runner probe.
SEED = 20261114
EXPECTED_N = 445
EXPECTED_ARMS = {0: 260, 1: 185}
COLUMNS = ["rownames", "data_id", "treat", "age", "educ", "black",
           "hisp", "marr", "nodegree", "re74", "re75", "re78"]
FEATURES_MIN = ["age", "educ", "marr", "nodegree"]
FEATURES_RICH = FEATURES_MIN + ["re74", "re75"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def parse(source):
    raw = Path(source).read_bytes()
    assert len(raw) < 500000, "Unexpected source size"
    actual = digest(raw)
    if EXPECTED_SOURCE_SHA256:
        assert actual == EXPECTED_SOURCE_SHA256, "Pinned original bytes changed"
    print("NSW_ORIGINAL_SOURCE_SHA256", actual)
    with Path(source).open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames == COLUMNS, "Original source schema drift"
        rows = list(reader)
    assert len(rows) == EXPECTED_N, "Not the canonical NSW randomized sample"
    ids = set()
    counts = {0: 0, 1: 0}
    for row in rows:
        n = int(row["rownames"])
        assert 1 <= n <= EXPECTED_N and n not in ids, "Source ID corruption"
        ids.add(n)
        assert row["data_id"] == "Dehejia-Wahba Sample"
        arm = int(row["treat"])
        assert arm in counts
        counts[arm] += 1
        for name in COLUMNS[3:]:
            v = float(row[name])
            assert math.isfinite(v), "Missing/nonfinite field in source"
        for name in ("re74", "re75", "re78"):
            assert float(row[name]) >= 0, "Negative source earnings require adjudication"
    assert counts == EXPECTED_ARMS, "Original randomized arm counts changed"
    return rows, actual


def features(rows, names):
    result = []
    for row in rows:
        vals = []
        for name in names:
            value = float(row[name])
            if name in ("re74", "re75"):
                value = math.log1p(value)
            vals.append(value)
        result.append(vals)
    return np.array(result, dtype=np.float64)


def split(rows):
    train, test = [], []
    for row in rows:
        source_id = row["rownames"]
        x = int.from_bytes(hashlib.sha256(
            f"{SOURCE_VERSION}|split|{source_id}".encode()).digest()[:4], "big")
        (train if x / 2**32 < 0.7 else test).append(row)
    assert len(train) >= 275 and len(test) >= 110
    for subset in (train, test):
        distribution = {arm: sum(int(r["treat"]) == arm for r in subset)
                        for arm in EXPECTED_ARMS}
        assert min(distribution.values()) >= 40, "Insufficient treatment arm support"
    return train, test


def fit_arm_models(train, names, kind, seed):
    x = features(train, names)
    y = np.array([float(row["re78"]) for row in train])
    a = np.array([int(row["treat"]) for row in train])
    fitted = {}
    for arm in EXPECTED_ARMS:
        selected = a == arm
        assert selected.sum() > 40, "Insufficient treatment training observations"
        if kind == "ridge":
            model = make_pipeline(StandardScaler(), Ridge(alpha=25.0))
        elif kind == "forest":
            model = RandomForestRegressor(
                n_estimators=160, max_depth=5, min_samples_leaf=8,
                min_samples_split=16, max_features=1.0,
                random_state=seed + arm, n_jobs=1
            )
        else:
            raise AssertionError("Unknown precommitted model")
        model.fit(x[selected], y[selected])
        fitted[arm] = model
    return fitted


def predict_arm(fitted, test, names):
    xx = features(test, names)
    return {arm: model.predict(xx) for arm, model in fitted.items()}


def ridge_uncertainty(train, test, repetitions=160):
    """Research-only resampling intervals; not causal coverage guarantees."""
    rng = np.random.default_rng(SEED)
    train_a = np.array([int(row["treat"]) for row in train])
    y = np.array([float(row["re78"]) for row in train])
    x = features(train, FEATURES_RICH)
    z = features(test, FEATURES_RICH)
    estimates = np.zeros((repetitions, len(test)), dtype=np.float64)
    for b in range(repetitions):
        models = {}
        for arm in EXPECTED_ARMS:
            idx = np.flatnonzero(train_a == arm)
            sample = rng.choice(idx, size=len(idx), replace=True)
            model = make_pipeline(StandardScaler(), Ridge(alpha=25.0))
            model.fit(x[sample], y[sample])
            models[arm] = model.predict(z)
        estimates[b] = models[1] - models[0]
    return np.quantile(estimates, .10, axis=0)


def main():
    assert len(sys.argv) == 4, (
        "usage: python nsw_earnings_evidence_prep.py "
        "pinned.csv /private/individual-predictions.jsonl /private/source-summary.json")
    rows, source_sha = parse(sys.argv[1])
    train, test = split(rows)
    train_ids = {r["rownames"] for r in train}
    assert not any(r["rownames"] in train_ids for r in test)
    fit = {}
    pred = {}
    for kind, fields in (("richRidge", FEATURES_RICH),
                         ("richForest", FEATURES_RICH),
                         ("limitedRidge", FEATURES_MIN)):
        family = "forest" if kind == "richForest" else "ridge"
        fit[kind] = fit_arm_models(train, fields, family, SEED)
        pred[kind] = predict_arm(fit[kind], test, fields)
    lower = ridge_uncertainty(train, test)
    assert lower.shape == (len(test),)
    rows_json = []
    for i, row in enumerate(test):
        unit_hash = digest(f"{SOURCE_VERSION}|unit|{row['rownames']}".encode())
        data = {
            "unit_hash": unit_hash,
            "assigned_arm": int(row["treat"]),
            "realized_earnings": float(row["re78"]),
            "richRidgeControl": float(pred["richRidge"][0][i]),
            "richRidgeTreatment": float(pred["richRidge"][1][i]),
            "richForestControl": float(pred["richForest"][0][i]),
            "richForestTreatment": float(pred["richForest"][1][i]),
            "limitedRidgeControl": float(pred["limitedRidge"][0][i]),
            "limitedRidgeTreatment": float(pred["limitedRidge"][1][i]),
            "lowerConfidenceDifference": float(lower[i]),
        }
        assert all(math.isfinite(x) for x in data.values() if isinstance(x, float))
        rows_json.append(data)
    Path(sys.argv[2]).write_text("".join(json.dumps(r, separators=(",", ":")) + "\n"
                                       for r in rows_json))
    summary = {
        "sourceDataset": "LaLonde/Dehejia-Wahba National Supported Work RCT subset",
        "sourceRepo": SOURCE_REPO,
        "sourceCommit": SOURCE_COMMIT,
        "sourcePath": SOURCE_PATH,
        "sourceSHA256": source_sha,
        "sourceRowCount": len(rows),
        "sourceArmCounts": EXPECTED_ARMS,
        "trainCount": len(train),
        "heldoutCount": len(test),
        "trainArmCounts": {arm: sum(int(x["treat"]) == arm for x in train)
                           for arm in EXPECTED_ARMS},
        "holdoutArmCounts": {arm: sum(int(x["treat"]) == arm for x in test)
                             for arm in EXPECTED_ARMS},
        "preTreatmentRichFeatures": FEATURES_RICH,
        "preTreatmentLimitedFeatures": FEATURES_MIN,
        "excludedProtectedFeatures": ["black", "hisp"],
        "experimentalAction": "Historical job training versus no training",
        "observedOutcome": "1978 individual annual real earnings, source-coded dollars",
        "splitDesign": "SHA256 identity fixed before outcome evaluation, 70/30",
        "modelDesign": "Ridge alpha 25, RF 160 fixed trees, arm-specific; 160 train-only Ridge bootstraps",
        "uncertaintyThreshold": "10th percentile of train-only resampled treatment effect",
        "outcomeUnitsAreNetFirmProfit": False,
        "observedProgramCosts": False,
        "randomizedSignalSoftware": False,
        "causalSignalNetProfitIdentified": False,
    }
    Path(sys.argv[3]).write_text(json.dumps(summary, indent=2))
    print("REAL_NSW_SOURCE_SUMMARY", json.dumps(summary, separators=(",", ":")))


if __name__ == "__main__":
    main()
