-- Independent real-world source-data audit (READ ONLY)
-- Target ONLY the isolated Neon project "signal-reference-lab", branch
-- "real-world-validation-2026-11"; never run against production.
--
-- Run with a read-only database role when available.
-- This validates imported row integrity and registered provenance metadata,
-- NOT the upstream file's raw cryptographic digest or the causal performance
-- of Signal. Upstream Git blob hashes are separately checked in CI scripts.
--
-- Expected source: https://github.com/st-tech/zr-obp/tree/8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4/obd

WITH expected (
  dataset_key, expected_n, expected_clicks,
  expected_train_n, expected_holdout_n, expected_blob
) AS (
  VALUES
    ('open_bandit_men_random_sample', 10000, 46, 7189, 2811,
     'e99ba925c30ccd537a554ce8ea2104a005c6f49e'),
    ('open_bandit_men_bts_sample', 10000, 69, 7296, 2704,
     'fbd217ad69b08f6dc338c7e2180cd8da16fcf658')
),
actual AS (
  SELECT
    dataset_key,
    COUNT(*)::int AS n,
    COUNT(DISTINCT row_id)::int AS unique_rows,
    MIN(row_id) AS first_row,
    MAX(row_id) AS last_row,
    COALESCE(SUM(click), 0)::int AS clicks,
    COUNT(*) FILTER (
      WHERE event_time < TIMESTAMPTZ '2019-11-29 00:00:00+00'
    )::int AS train_n,
    COUNT(*) FILTER (
      WHERE event_time >= TIMESTAMPTZ '2019-11-29 00:00:00+00'
    )::int AS holdout_n,
    COUNT(*) FILTER (
      WHERE event_time IS NULL OR item_id IS NULL
         OR position IS NULL OR click IS NULL
         OR item_id NOT BETWEEN 0 AND 33
         OR position NOT BETWEEN 1 AND 3
         OR click NOT BETWEEN 0 AND 1
         OR propensity_score <= 0 OR propensity_score > 1
    )::int AS invalid_required_rows,
    COUNT(*) FILTER (
      WHERE NOT (
        features ? 'action_affinity'
        AND features ? 'policy'
        AND features ? 'campaign'
      )
    )::int AS missing_feature_markers,
    COUNT(*) FILTER (
      WHERE dataset_key = 'open_bandit_men_random_sample'
        AND ABS(propensity_score - 1.0 / 34) > 1e-10
    )::int AS invalid_random_propensity
  FROM signal_validation.bandit_observations
  GROUP BY dataset_key
)
SELECT
  e.dataset_key, d.ingest_status, d.n_loaded,
  a.n, a.clicks, a.train_n, a.holdout_n,
  a.invalid_required_rows, a.missing_feature_markers,
  a.invalid_random_propensity,
  CASE
    WHEN a.n = e.expected_n
     AND a.unique_rows = e.expected_n
     AND a.first_row = 0 AND a.last_row = e.expected_n - 1
     AND a.clicks = e.expected_clicks
     AND a.train_n = e.expected_train_n
     AND a.holdout_n = e.expected_holdout_n
     AND a.invalid_required_rows = 0
     AND a.missing_feature_markers = 0
     AND a.invalid_random_propensity = 0
     AND d.n_loaded = e.expected_n
     AND d.ingest_status = 'validated'
     AND POSITION(e.expected_blob IN d.source_version) > 0
    THEN 'PASS'
    ELSE 'FAIL'
  END AS read_only_integrity_gate
FROM expected e
LEFT JOIN actual a ON a.dataset_key = e.dataset_key
LEFT JOIN signal_validation.datasets d ON d.dataset_key = e.dataset_key
ORDER BY e.dataset_key;
