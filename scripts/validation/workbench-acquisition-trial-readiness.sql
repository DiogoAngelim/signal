-- Research-only, branch-scoped Workbench acquisition trial readiness.
-- READ ONLY: a single SELECT, aggregate counts only. No row-level outputs,
-- owner IDs, relationship IDs, names, cash amounts, or free text.
-- First-opportunity age is only a proxy for an eligible trial observation.
-- Global counts may span multiple owners and MUST NOT certify a single-owner trial.
-- For real trial eligibility, independent source attestation, USD/FX reconciliation,
-- consent, a frozen policy and human approval are still mandatory.
WITH company_units AS (
 SELECT owner_id, relationship_id,
        COUNT(*) AS opportunity_count,
        MIN(created_at) AS first_opportunity_at
 FROM public.opportunities
 GROUP BY owner_id, relationship_id
),
opportunity_status AS (
 SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) AS counts
 FROM (
   SELECT status, COUNT(*) AS n
   FROM public.opportunities
   GROUP BY status
 ) s
)
SELECT
 CURRENT_TIMESTAMP AS audited_at,
 (SELECT COUNT(*) FROM public.opportunities) AS opportunity_rows,
 (SELECT COUNT(DISTINCT owner_id) FROM public.opportunities) AS distinct_owners,
 (SELECT COUNT(*) FROM public.relationships) AS relationship_rows,
 (SELECT COUNT(*) FROM company_units) AS distinct_owner_company_units,
 (SELECT COUNT(*) FROM company_units WHERE opportunity_count > 1)
   AS company_units_with_multiple_opportunities,
 (SELECT COUNT(*) FROM company_units WHERE first_opportunity_at <=
   CURRENT_TIMESTAMP - INTERVAL '90 days') AS company_units_first_seen_90_days_ago,
 (SELECT MIN(created_at) FROM public.opportunities) AS first_opportunity_at,
 (SELECT MAX(created_at) FROM public.opportunities) AS latest_opportunity_at,
 (SELECT counts FROM opportunity_status) AS opportunity_status_counts,
 (SELECT COUNT(*) FROM public.decisions) AS decision_rows,
 (SELECT COUNT(*) FROM public.assessments) AS assessment_rows,
 (SELECT COUNT(*) FROM public.assessments
   WHERE expected_revenue IS NOT NULL AND direct_cost IS NOT NULL
   AND sales_hours IS NOT NULL AND delivery_hours IS NOT NULL
   AND hourly_opportunity_cost IS NOT NULL AND win_probability IS NOT NULL)
   AS assessments_with_six_forecast_inputs,
 (SELECT COUNT(*) FROM public.evidence) AS evidence_rows,
 (SELECT COUNT(*) FROM public.outcomes) AS outcome_rows,
 (SELECT COUNT(*) FROM public.outcomes WHERE result IN ('won','lost'))
   AS terminal_outcome_rows,
 (SELECT COUNT(*) FROM public.outcomes
   WHERE result IN ('won','lost')
   AND actual_revenue IS NOT NULL AND actual_cost IS NOT NULL
   AND actual_sales_hours IS NOT NULL AND actual_delivery_hours IS NOT NULL)
   AS terminal_outcomes_with_basic_actuals,
 (SELECT COUNT(*) FROM public.cash_receipts) AS receipt_or_reversal_rows,
 (SELECT COUNT(DISTINCT (owner_id, opportunity_id))
   FROM public.cash_receipts) AS opportunities_with_cash_records,
 (SELECT COUNT(*) FROM public.commercial_activities) AS commercial_activity_rows,
 -- These optional tables can be absent on a pre-migration Workbench database.
 -- PostgreSQL resolves missing relations at parse time even inside CASE, so
 -- report honest table-presence flags rather than fabricate zero rows.
 (to_regclass('public.acquisition_opportunity_scores') IS NOT NULL)
   AS qualification_score_table_present,
 (to_regclass('public.signal_integration_events') IS NOT NULL)
   AS signal_integration_event_table_present;
