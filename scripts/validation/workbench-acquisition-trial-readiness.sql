-- Workbench acquisition trial-readiness counts, read-only.
-- Do not run against production without an independently approved read-only scope.
-- Executes no mutation and selects NO owner IDs, names, financial amounts,
-- contact details, free text or row-level opportunity records.
--
-- Multi-tenant counts are global to the selected database branch, NOT
-- automatically evidence that a single approved owner has sufficient cases.
-- A real trial requires authorized owner-specific audit, external cost and
-- currency reconciliation, and immutable pre-outcome policy logs.
SELECT
  (SELECT count(*) FROM public.opportunities) AS opportunity_rows,
  (SELECT count(DISTINCT owner_id) FROM public.opportunities) AS distinct_owners,
  (SELECT count(DISTINCT (owner_id, relationship_id)) FROM public.opportunities)
    AS distinct_owner_company_units,
  (SELECT count(DISTINCT (owner_id, relationship_id))
   FROM public.opportunities
   WHERE created_at <= current_timestamp - INTERVAL '90 days')
    AS company_units_at_least_90_days_old,
  (SELECT count(*) FROM public.outcomes) AS recorded_outcome_rows,
  (SELECT count(*) FROM public.outcomes
   WHERE result IN ('won','lost')) AS recorded_terminal_outcomes,
  (SELECT count(*) FROM public.outcomes
   WHERE result IN ('won','lost')
     AND actual_revenue IS NOT NULL
     AND actual_cost IS NOT NULL
     AND actual_sales_hours IS NOT NULL
     AND actual_delivery_hours IS NOT NULL) AS terminal_outcomes_with_basic_actuals,
  (SELECT count(*) FROM public.cash_receipts) AS receipt_and_reversal_rows,
  (SELECT count(DISTINCT (owner_id, opportunity_id)) FROM public.cash_receipts)
    AS opportunities_with_cash_records,
  (SELECT count(*) FROM public.commercial_activities) AS commercial_activity_rows,
  (SELECT count(*) FROM public.acquisition_opportunity_scores)
    AS qualification_score_snapshots,
  (SELECT count(*) FROM public.assessments) AS assessments,
  (SELECT count(*) FROM public.evidence) AS evidence_rows;
