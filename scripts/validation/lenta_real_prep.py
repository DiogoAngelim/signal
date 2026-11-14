#!/usr/bin/env python3
"""Research-only, deterministic, leakage-aware Lenta RCT preprocessing.

Uses PUBLIC real randomized campaign data to train two serious predictors
(logistic regression and histogram gradient boosting), then fits conventional
Platt and isotonic calibration ONLY on a separate validation partition.
No Signal or causal software-profit claim. Never uploads original records.
"""
import csv
import gzip
import hashlib
import json
import math
import os
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SOURCE_SHA256 = "b531544f6c072d22f232d91e20ffcaca265acf224e02687502a40e6d56135682"
SOURCE_MD5 = "6ab28ff0989ed8b8647f530e2e86452f"
TOTAL = 687029
ARMS = {"control": 171137, "test": 515892}
SOURCE_VERSION = "lenta-real-rct-v1-sealed-20261114"
# Pre-campaign data fields only. Exclude group, response_att, response_sms,
# response_viber, customer IDs, gender and all post-treatment indicators.
FEATURES = [
    "age", "children", "main_format", "months_from_register",
    "cheque_count_3m_g20", "cheque_count_6m_g20", "cheque_count_12m_g20",
    "cheque_count_3m_g45", "cheque_count_6m_g45", "cheque_count_12m_g45",
    "crazy_purchases_cheque_count_1m", "crazy_purchases_cheque_count_3m",
    "crazy_purchases_cheque_count_6m", "crazy_purchases_cheque_count_12m",
    "food_share_15d", "food_share_1m",
    "k_var_days_between_visits_15d", "k_var_days_between_visits_1m",
    "k_var_discount_depth_15d", "mean_discount_depth_15d",
    "sale_sum_3m_g24", "sale_sum_6m_g24", "sale_sum_12m_g24"
]
SEGMENTS = ["train", "calibration", "test"]
SEED = 20261114


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_number(raw):
    if raw is None or raw.strip() == "":
        return np.nan
    try:
        val = float(raw)
    except ValueError:
        raise AssertionError("Non-numeric source field in predeclared baseline feature")
    if not math.isfinite(val):
        return np.nan
    if abs(val) > 1e12:
        raise AssertionError("Unexpectedly large source feature; adjudicate provenance")
    return val


def load_source(path):
    path = Path(path)
    h = hashlib.sha256()
    md = hashlib.md5()  # source's preexisting published MD5, not a security primitive
    with path.open("rb") as f:
        for piece in iter(lambda: f.read(1024 * 1024), b""):
            h.update(piece)
            md.update(piece)
    assert h.hexdigest() == SOURCE_SHA256, "Official real-source SHA-256 mismatch"
    assert md.hexdigest() == SOURCE_MD5, "Official published source MD5 mismatch"
    records = {seg: {"x": [], "y": [], "arm": [], "id": []} for seg in SEGMENTS}
    total = 0
    arms = Counter()
    outcome = Counter()
    with gzip.open(path, "rt", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        assert headers and len(headers) == len(set(headers))
        assert all(x in headers for x in FEATURES)
        assert {"group", "response_att", "response_sms", "response_viber"}.issubset(headers)
        assert not any(x.startswith("response") or x in ("group", "gender", "CardHolder") for x in FEATURES)
        for i, row in enumerate(reader):
            total += 1
            arm = row["group"]
            label = row["response_att"]
            assert arm in ARMS and label in ("0", "1"), "Invalid original randomized record"
            arms[arm] += 1
            outcome[label] += 1
            if hashlib.sha256((SOURCE_VERSION + "|select|" + str(i)).encode()).digest()[0] >= 51:
                continue  # deterministic ~20% sample; no outcome/arm-driven sampling
            v = hashlib.sha256((SOURCE_VERSION + "|split|" + str(i)).encode()).digest()[0] % 10
            segment = "train" if v < 6 else "calibration" if v < 8 else "test"
            st = records[segment]
            st["x"].append([parse_number(row[k]) for k in FEATURES])
            st["y"].append(int(label))
            st["arm"].append(arm)
            st["id"].append(sha((SOURCE_VERSION + "|row|" + str(i)).encode()))
    assert total == TOTAL and dict(arms) == ARMS, "Full original Lenta cohort/arms differ"
    assert sum(outcome.values()) == TOTAL
    assert records["train"]["x"] and records["calibration"]["x"] and records["test"]["x"]
    for part in SEGMENTS:
        st = records[part]
        st["x"] = np.asarray(st["x"], dtype=np.float64)
        st["y"] = np.asarray(st["y"], dtype=np.int8)
        st["arm"] = np.asarray(st["arm"])
        st["id"] = np.asarray(st["id"])
    assert len(set(np.concatenate([records[p]["id"] for p in SEGMENTS]))) == sum(
        len(records[p]["y"]) for p in SEGMENTS
    ), "Overlapping split source IDs"
    return records, dict(arms), dict(outcome)


def fit_models(parts):
    train = parts["train"]
    results = {}
    calibrators = {}
    start = time.perf_counter()
    for arm in ARMS:
        mask = train["arm"] == arm
        x = train["x"][mask]
        y = train["y"][mask]
        assert x.shape[0] >= 10000 and y.sum() >= 100, "Insufficient genuine train-arm support"
        logistic = make_pipeline(
            SimpleImputer(strategy="median", keep_empty_features=True),
            StandardScaler(),
            LogisticRegression(C=0.5, max_iter=350, random_state=SEED),
        )
        boosted = make_pipeline(
            SimpleImputer(strategy="median", keep_empty_features=True),
            HistGradientBoostingClassifier(
                max_iter=120, max_leaf_nodes=15, max_depth=5,
                learning_rate=0.06, l2_regularization=5.0,
                early_stopping=False, random_state=SEED,
            )
        )
        logistic.fit(x, y)
        boosted.fit(x, y)
        results[arm] = {"logistic": logistic, "boosted": boosted, "prior": float(y.mean())}
    for arm in ARMS:
        cal = parts["calibration"]
        mask = cal["arm"] == arm
        cal_predictions = results[arm]["boosted"].predict_proba(cal["x"][mask])[:, 1]
        cal_labels = cal["y"][mask]
        assert cal_labels.sum() >= 100 and len(cal_labels) - cal_labels.sum() >= 100
        iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        iso.fit(cal_predictions, cal_labels)
        logits = np.log(np.clip(cal_predictions, 1e-6, 1 - 1e-6) /
                        (1 - np.clip(cal_predictions, 1e-6, 1 - 1e-6)))
        platt = LogisticRegression(C=1.0, max_iter=350, random_state=SEED)
        platt.fit(logits.reshape(-1, 1), cal_labels)
        calibrators[arm] = {"isotonic": iso, "platt": platt}
    return results, calibrators, time.perf_counter() - start


def export_rows(records, models, calibrators, output):
    for part in ("calibration", "test"):
        batch = records[part]
        predictions = {}
        for arm in ARMS:
            base = models[arm]["boosted"].predict_proba(batch["x"])[:, 1]
            lr = models[arm]["logistic"].predict_proba(batch["x"])[:, 1]
            iso = calibrators[arm]["isotonic"].predict(base)
            logits = np.log(np.clip(base, 1e-6, 1 - 1e-6) /
                            (1 - np.clip(base, 1e-6, 1 - 1e-6)))
            platt = calibrators[arm]["platt"].predict_proba(logits.reshape(-1, 1))[:, 1]
            predictions[arm] = {
                "boosted": base, "logistic": lr, "isotonic": iso, "platt": platt
            }
        fn = output / ("lenta-" + part + ".jsonl")
        with fn.open("w") as f:
            for i in range(len(batch["y"])):
                row = {
                    "id": str(batch["id"][i]),
                    "arm": str(batch["arm"][i]),
                    "outcome": int(batch["y"][i]),
                    "boostedControl": float(predictions["control"]["boosted"][i]),
                    "boostedTreated": float(predictions["test"]["boosted"][i]),
                    "logisticControl": float(predictions["control"]["logistic"][i]),
                    "logisticTreated": float(predictions["test"]["logistic"][i]),
                    "conventionalIsoControl": float(predictions["control"]["isotonic"][i]),
                    "conventionalIsoTreated": float(predictions["test"]["isotonic"][i]),
                    "conventionalPlattControl": float(predictions["control"]["platt"][i]),
                    "conventionalPlattTreated": float(predictions["test"]["platt"][i]),
                }
                assert all(math.isfinite(v) and 0 <= v <= 1
                           for key, v in row.items() if key.startswith((
                               "boosted", "logistic", "conventional"))), "bad forecast"
                f.write(json.dumps(row, separators=(",", ":")) + "\n")
    return {part: len(records[part]["y"]) for part in SEGMENTS}


def main():
    assert len(sys.argv) == 3, "usage: lenta_real_prep.py path/to/source.csv.gz /private/out"
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    records, arms, outcomes = load_source(sys.argv[1])
    models, calibrators, sec = fit_models(records)
    counts = export_rows(records, models, calibrators, out)
    report = {
        "source": "Lenta BigTarget promotion RCT through scikit-uplift published public host",
        "sourceSHA256": SOURCE_SHA256,
        "sourcePublishedMD5": SOURCE_MD5,
        "fullCohort": TOTAL,
        "fullArms": arms,
        "fullResponses": outcomes,
        "splitCounts": counts,
        "observedEvent": "response_att binary campaign response; NOT revenue or profit",
        "baselineFeatures": FEATURES,
        "preTreatmentOnlyByDeclaredFieldSemantics": True,
        "sensitiveAndPostTreatmentFeaturesExcluded": True,
        "trainFeaturesAndParametersFrozen": True,
        "trainOnlyModelFitting": True,
        "validationOnlyScikitCalibrators": True,
        "testOutcomesNotUsedToSelectModel": True,
        "trainedModelRuntimeSecondsRunnerSpecific": round(sec, 3),
        "comparisonMethods": [
            "regularized logistic regression", "histogram gradient boosting",
            "sklearn monotone isotonic", "sklearn sigmoid (Platt)",
            "Signal shrunken monotone isotonic"
        ],
        "profitsObserved": False,
        "causalSoftwareValueMeasured": False,
        "softwareCostMeasured": False,
    }
    for arm in ARMS:
        report["trainPrior_" + arm] = models[arm]["prior"]
    (out / "lenta-prep-aggregate.json").write_text(json.dumps(report, indent=2))
    print("REAL_LENTA_PREP_AGGREGATE", json.dumps(report, separators=(",", ":")))


if __name__ == "__main__":
    main()
