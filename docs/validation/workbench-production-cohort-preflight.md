# Workbench real-world Signal trial: production cohort audit (2026-11-14)

**Verdict: cohort identified, shadow inputs missing; no prospective Signal net-profit experiment can be enrolled.**

The earlier readiness queries used the Neon project's *default DEVELOPMENT branch*. Their zero-row result was correct for development but **wrong as a description of production**.

## Independent source selection and read-only execution

The branch list returned by Neon (not inferred from GitHub branch naming) identifies:
- Project `ancient-sea-71356131` (Workbench V3), branch **`br-tiny-glitter-b74qe2zs`**, name `production`, `default=false`, `primary=false`.
- Project `ancient-sea-71356131`, branch **`br-polished-wildflower-b7l6h3ng`**, name `development`, `default=true`.

The **single aggregate SELECT** in [workbench-production-cohort-preflight.sql](../../scripts/validation/workbench-production-cohort-preflight.sql) was executed on the **explicitly selected production branch**, via the connected Neon tool, on **2026-11-14T13:54:09.741Z**. No writes, migrations, services, messages, finance modifications, action assignment or identities were touched. The returned source contains only aggregate counts and explicitly claimed branch labels; the script cannot independently check the branch selected by the external database caller.

| Production-only recorded fact | Count |
|---|---:|
| Opportunities | **11** |
| Relationships | **10** |
| Canonical distinct company groups (owner + relationship) | **10** |
| Groups with multiple opportunities | **1** |
| Different owners among these companies | **1** |
| Companies with any saved nonempty commercial model | **0** |
| Companies with evidence / verified evidence | **0 / 0** |
| Companies with saved OQS / complete six-input assessments | **0 / 0** |
| Companies with all minimum source inputs for shadow preflight | **0** |
| Decisions / realized outcomes / receipt entries | **0 / 0 / 0** |
| Companies older than 90 days | **0** |
| Companies with unverified USD currency | **0** |
| Signal integration events | **0** |

Production has `acquisition_opportunity_scores` and `signal_integration_events` tables present. Their **zero records** are real zero counts in these *present* production tables, unlike the absent tables on the development branch.

Both the earlier zero-company report and the new production cohort evidence can be true *for different branches*. For the intended commercial pilot, **use production counts from the explicitly selected production branch, not default-branch counts**.

## End-to-end audit path

1. Execute the single-statement, nonmutating [production preflight SQL](../../scripts/validation/workbench-production-cohort-preflight.sql) with **both** project and branch IDs explicitly bound in the Neon connection. Do not accidentally use the default branch.
2. Preserve the aggregate-only result as one JSON object or one-object array locally and pass it to:
   ```sh
   node scripts/validation/workbench-production-cohort-preflight.mjs --snapshot /secure/aggregate-neon-production.json
   ```
   The classifier rejects additional fields, row-level records, non-integer counts, invalid intersections, unknown asserted branch labels and fabricated zero-to-positive input transitions. It never accepts company names, addresses, customer identities, outcome amounts, source notes or proposal payloads. Output: `artifacts/validation/workbench-production-cohort-preflight-report.json`.
3. `COHORT_IDENTIFIED_SHADOW_INPUTS_MISSING` is the correct current classification: **10 potential company units** and **0 independent companies with all minimal real pre-outcome decision inputs**.
4. Do **not** bulk backfill fabricated scenarios, silently mark evidence verified, inflate native scores, create retrospective assignments or claim missing income/expenses are zero. First capture genuine verified economic/evidence/qualification inputs through the existing owner-scoped Workbench workflow. Require actual native-gated paired baseline/Signal proposals **before** exposing treatment outcomes.
5. Before any genuine randomized assignment, secure independent ethics/privacy and commercial approval, verify prospective consent, freeze source/commit, measure baseline *collected net USD* variance, calculate independent-company power and validate source/timestamp custody. Then use the externally anchored HMAC randomization [manifest preparation](../../scripts/validation/prospective-cohort-assignment.mjs) and independently operated prospective ITT audit.
6. Every contact, external communication, quote, contract, payment and operational change remains subject to existing owner approval and hard stops. The new classifier and read-only SQL have **no** enrollment/automation capability.

The 10 discovered company groups are a *possible future* cohort only, not consented and enrolled participants. One group has two opportunities; company-level assignment avoids treating those as independent observations. Even if every recorded company became eligible, ten is far short of the previously required minimum **30 independent units per arm**, and genuine power requirements are probably much larger.

**Scientific claim:** `INCREMENTAL_SIGNAL_CAUSAL_NET_PROFIT_SUPERIORITY=NOT_PROVEN`. The off-policy evaluator, prospective-trial audit and generator have passing synthetic tests but no genuine randomized commercial net outcome data.

## Source integrity and limits

- Live queried branch was independently selected through Neon connection parameters, but GitHub CI self-tests can only assert caller-supplied branch labels, **not independently confirm live source or consent**.
- The public release `@signal/decision@0.2.0` is pinned inside Workbench; later new Signal main-branch research APIs are not automatically present inside Workbench. Any real shadow capture must be explicitly integrated, version-locked, security reviewed, tested and deployed as a **separate approved change**. This audit does not silently upgrade it.
- Company grouping is by owner and relationship ID. Parent/subsidiary, shared decision makers and any cross-company spillover need human review before treating groups as independent randomization units.
- The absence of actual outcomes is not evidence of zero profit and does not permit estimating a real baseline variance.
- `read_only` is a property of the SQL; the audit made no schema or data writes. No production run or financial outcome has been fabricated.
