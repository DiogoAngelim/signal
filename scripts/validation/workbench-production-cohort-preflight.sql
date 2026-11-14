-- Signal prospective real-world trial: Workbench V3 PRODUCTION aggregate-only preflight.
-- Execute as one read-only SELECT against Neon ancient-sea-71356131,
-- explicitly branch br-tiny-glitter-b74qe2zs (named 'production').
-- Database default branch is DEVELOPMENT; an omitted branch_id is NOT production.
-- No individual company names, identifiers, owner IDs, cash amounts or notes are returned.
-- This does NOT authorize enrollment, action, source export or data migration.
WITH company AS (
 SELECT o.owner_id, o.relationship_id,
   COUNT(*)::bigint AS opportunity_count,
   MIN(o.created_at) AS first_opportunity_at,
   BOOL_OR(o.status IN ('won','lost')) AS any_terminal,
   BOOL_OR(o.commercial_model IS NOT NULL
     AND o.commercial_model <> '{}'::jsonb
     AND o.commercial_model <> 'null'::jsonb) AS has_commercial_model,
   BOOL_OR(o.currency IS NULL OR o.currency <> 'USD') AS currency_not_verified_usd
 FROM public.opportunities o
 GROUP BY o.owner_id, o.relationship_id
), evidence_by_company AS (
 SELECT DISTINCT o.owner_id, o.relationship_id
 FROM public.opportunities o JOIN public.evidence e
   ON e.opportunity_id=o.id AND e.owner_id=o.owner_id
), verified_evidence_by_company AS (
 SELECT DISTINCT o.owner_id, o.relationship_id
 FROM public.opportunities o JOIN public.evidence e
   ON e.opportunity_id=o.id AND e.owner_id=o.owner_id
 WHERE e.status='verified'
), scored_by_company AS (
 SELECT DISTINCT o.owner_id, o.relationship_id
 FROM public.opportunities o JOIN public.acquisition_opportunity_scores s
   ON s.opportunity_id=o.id AND s.owner_id=o.owner_id
), assessed_by_company AS (
 SELECT DISTINCT o.owner_id, o.relationship_id
 FROM public.opportunities o JOIN public.assessments a
   ON a.opportunity_id=o.id AND a.owner_id=o.owner_id
), complete_assessment_by_company AS (
 SELECT DISTINCT o.owner_id, o.relationship_id
 FROM public.opportunities o JOIN public.assessments a
   ON a.opportunity_id=o.id AND a.owner_id=o.owner_id
 WHERE a.expected_revenue IS NOT NULL
   AND a.direct_cost IS NOT NULL
   AND a.sales_hours IS NOT NULL
   AND a.delivery_hours IS NOT NULL
   AND a.hourly_opportunity_cost IS NOT NULL
   AND a.win_probability IS NOT NULL
), company_flags AS (
 SELECT c.*,
   e.owner_id IS NOT NULL AS has_evidence,
   ve.owner_id IS NOT NULL AS has_verified_evidence,
   s.owner_id IS NOT NULL AS has_saved_oqs,
   a.owner_id IS NOT NULL AS has_assessment,
   ca.owner_id IS NOT NULL AS has_complete_assessment
 FROM company c
 LEFT JOIN evidence_by_company e ON e.owner_id=c.owner_id
   AND e.relationship_id=c.relationship_id
 LEFT JOIN verified_evidence_by_company ve ON ve.owner_id=c.owner_id
   AND ve.relationship_id=c.relationship_id
 LEFT JOIN scored_by_company s ON s.owner_id=c.owner_id
   AND s.relationship_id=c.relationship_id
 LEFT JOIN assessed_by_company a ON a.owner_id=c.owner_id
   AND a.relationship_id=c.relationship_id
 LEFT JOIN complete_assessment_by_company ca ON ca.owner_id=c.owner_id
   AND ca.relationship_id=c.relationship_id
)
SELECT
 CURRENT_TIMESTAMP AS audited_at,
 'ancient-sea-71356131'::text AS asserted_project_id,
 'br-tiny-glitter-b74qe2zs'::text AS asserted_production_branch_id,
 -- Above literals are labels only: operator must verify Neon selected branch.
 (SELECT COUNT(*) FROM public.opportunities)::bigint AS opportunity_count,
 (SELECT COUNT(*) FROM public.relationships)::bigint AS relationship_count,
 (SELECT COUNT(*) FROM public.decisions)::bigint AS decision_count,
 (SELECT COUNT(*) FROM public.outcomes)::bigint AS outcome_count,
 (SELECT COUNT(*) FROM public.cash_receipts)::bigint AS receipt_count,
 (SELECT COUNT(*) FROM public.commercial_activities)::bigint AS activity_count,
 (SELECT COUNT(*) FROM public.acquisition_opportunity_scores)::bigint AS saved_oqs_count,
 (SELECT COUNT(*) FROM public.signal_integration_events)::bigint AS signal_event_count,
 (SELECT COUNT(*) FROM public.evidence WHERE status='verified')::bigint AS verified_evidence_count,
 COUNT(*)::bigint AS canonical_company_claims,
 COUNT(*) FILTER (WHERE opportunity_count > 1)::bigint AS repeated_company_claims,
 COUNT(*) FILTER (WHERE first_opportunity_at <= CURRENT_TIMESTAMP - INTERVAL '90 days')::bigint AS companies_90_days_old,
 COUNT(*) FILTER (WHERE any_terminal)::bigint AS companies_with_terminal_outcome,
 COUNT(*) FILTER (WHERE has_commercial_model)::bigint AS companies_with_model,
 COUNT(*) FILTER (WHERE currency_not_verified_usd)::bigint AS companies_with_unverified_usd,
 COUNT(*) FILTER (WHERE has_evidence)::bigint AS companies_with_evidence,
 COUNT(*) FILTER (WHERE has_verified_evidence)::bigint AS companies_with_verified_evidence,
 COUNT(*) FILTER (WHERE has_saved_oqs)::bigint AS companies_with_saved_oqs,
 COUNT(*) FILTER (WHERE has_assessment)::bigint AS companies_with_assessment,
 COUNT(*) FILTER (WHERE has_complete_assessment)::bigint AS companies_with_complete_assessment,
 COUNT(*) FILTER (WHERE has_commercial_model AND has_verified_evidence
   AND has_saved_oqs AND has_complete_assessment
   AND NOT currency_not_verified_usd)::bigint AS companies_with_minimum_shadow_source_inputs,
 COUNT(DISTINCT owner_id)::bigint AS owner_count,
 (to_regclass('public.acquisition_opportunity_scores') IS NOT NULL) AS score_table_present,
 (to_regclass('public.signal_integration_events') IS NOT NULL) AS event_table_present
FROM company_flags;