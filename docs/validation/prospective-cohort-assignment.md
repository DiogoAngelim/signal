# Prospective Signal causal trial — pre-enrollment and randomization custody

**Status (2026-11-14): IMPLEMENTATION-READY FOR OFFLINE PREP; NOT ENROLLING; NOT DEPLOYED; NO SIGNAL SOFTWARE CAUSAL PROFIT PROOF.**

## What is implemented

The additive, research-only `scripts/validation/prospective-cohort-assignment.mjs` provides an exact [prospective-policy-trial-audit](./prospective-signal-policy-causal-proof.md)-compatible **10-column manifest** for an externally approved, frozen pre-outcome cohort. It does not connect to Workbench, send communications, expose an adviser, write to Neon, or randomize live customers. An approved independent application and custodian are still needed to publish actual assignments and expose the trial treatment.

The manifest generator addresses a previous gap: matching a late-authored randomized assignment manifest to matching outcome rows is **not evidence that randomization occurred before outcomes**. The generator combines stable company-level allocation with a secure independently held secret; it still **cannot attest its own timestamp, authentic source, human consent, cost completeness, or assignment custody**.

### Actual readiness as observed

Read-only aggregate-only SQL on **2026-11-14** found:
- Workbench V3 database, default branch: **0** opportunities, **0** relationships, **0** assessed decisions, **0** financial outcomes, **0** cash receipt rows.
- Legacy Workbench production database, default branch: **0** Signal decision records, **0** Signal outcome rows, **0** commercial outcomes, **0** cash receipt rows.

These counts apply only to the audited stores, not other external systems. No raw business identifiers, owners, customer data or financial amounts were retrieved. Therefore **there is currently no eligible source cohort, observed real baseline monetary variance, or experimental software-assignment history** in those stores. Current verdict: `PRE_ENROLLMENT_BLOCKED_NO_REAL_COHORT`. No trial could responsibly be enrolled from them.

## Frozen study definition

Canonical randomization unit: **one verified company relationship** (not contacts or multiple opportunities). All repeated decisions for a company and closely related parent/child entities must share its treatment arm. If distinct companies can interfere, randomization and analysis must be revised at the broader independent cluster. Workbench's existing evidence governance and human-approval barriers remain equally mandatory in both arms.

**Control:** Workbench's existing, human-approved commercial assessment and current Signal-supported evidence governance.

**Treatment:** the same existing assessment and safety rules, with **additional** Signal economic advice shown for human evaluation; the original native `evaluateDecision` gate is still binding. A denied or reduced-scale proposal cannot be promoted to a full-size action. No autonomous outreach, spending, contracts, payments or actuation.

**Primary estimand:** predeclared 90-day realized **collected USD net contribution per randomized canonical relationship**, including assigned units that were not contacted, Signal abstentions, rejects or noncompliant decisions. Verify receipts, reversals, direct delivery costs, sales/delivery time and rates, incremental software/review expense, waiting/opportunity effects and harm/remediation. Unknown costs **cannot** be set to zero. Historical BRL records must not be silently relabeled USD.

**Null and gate:** two-sided randomized ITT null with lower 95% CI strictly exceeding a frozen *positive* minimum meaningful net-USD effect; safety noninferiority and assignment/sample/policy-disagreement gates must also pass. Do not tune the model, segmentation, outcome period, or policy after assignments.

## Offline assigned-manifest protocol (no enrollment)

After independent approval, measured baseline variance, safe shadow policy differences, and source-authenticated pre-outcome frozen proposals have been obtained:

1. Register `study.json` with exact keys required by the [prospective audit](../../scripts/validation/prospective-policy-trial-audit.mjs). The trial ID, locked Git commit, target effect, policies, utility, risk/safety threshold, 90-day window, approval reference and min per-arm sample must be frozen externally *before* any assignment.
2. The actual Workbench system (not this script) must produce a **sealed, securely stored CSV of already-approved pre-outcome proposals** with **exactly** these columns in this order:

   ```csv
   unit_hash,decision_at,baseline_action,signal_action,decision_input_sha256,evidence_sha256,native_action_allowed,native_action_scale,eligible_preassigned,consent_attested,hard_stops_preserved
   ```

   `unit_hash` must represent a canonical relationship, be 64 hex, and be derived from a privacy-approved keyed transformation that cannot be reversed by dictionary guessing. The plain company name, email, owner, account ID, phone number or actual relationship ID must **not** be stored in the CSV. These identifiers and source financial details must stay in the private approved Workbench source system. `decision_input_sha256` and `evidence_sha256` must digest actual pre-outcome material, not future labels. `signal_action` is the **effective**, post-native-permission action. Both policy recommendations must precede allocation. Every cohort record must assert `eligible_preassigned=1,consent_attested=1,hard_stops_preserved=1` or the entire candidate cohort is rejected without silently excluding rows.
3. An independent enrollment custodian generates a new **uniform 256-bit or longer secret**, stores it outside Git, sets `SIGNAL_TRIAL_ASSIGNMENT_KEY_HEX` in a controlled local environment and records a secret commitment with an externally trusted timestamp. **Never place the secret in commits, tickets, conversations or workflow logs.** Do not guess or reuse a published test key.
4. Run `prospective-cohort-assignment.mjs` at the real UTC assignment time, with an absolute manifest and report location **outside the source checkout**. The script refuses timestamps outside ±5 minutes of its local clock (this is **not** trusted external clock attestation), refuses absent approval flags, duplicate company hashes, missing action disagreement, late proposal times and Signal actions inconsistent with native zero/partial scale. It deterministically assigns each company using **HMAC-SHA256(trial ID, company hash, independent secret)** and never balances or rerolls the allocation. The resulting manifest includes the exact 10 columns that the downstream randomized outcome auditor requires.
5. Immediately anchor the raw manifest **SHA-256** and frozen registration in an **external append-only timestamped custodian** before any treatment is exposed or outcomes occur. Store private assigned-arm records in the approved system with access control and a single immutable assignment for all related opportunities. Validate no crossed arms, consent changes, source version drift, post-assignment omissions or source tampering.
6. Only then can a separately approved system show arm-specific human-reviewed advice. The script itself emits `readyForEnrollment:false` regardless of the numeric inputs, because external consent, unit-independence, accounting and authentic assignment are **not provable** by a local CLI.
7. After the entire preregistered observation window has matured, independently reconcile a **finalized, fully observed ITT source** whose 18 exact columns match `prospective-policy-trial-audit.mjs`. The audit checks every finalized outcome against the original externally attested manifest; zero outcomes must be verified from complete cash ledgers. No substitution or post-hoc unit exclusions are allowed.

### Commands

**Synthetic test only (CI-safe, produces no private records):**
```sh
node scripts/validation/prospective-cohort-assignment.mjs --self-test
node scripts/validation/prospective-policy-trial-audit.mjs --self-test
```

**Real candidate manifest (requires independently verified source and approvals; NOT enrollment):**
```sh
# Set SIGNAL_TRIAL_ASSIGNMENT_KEY_HEX securely in your trusted shell/secret manager;
# never write the secret in this file, a repository, or a pasted command.
node scripts/validation/prospective-cohort-assignment.mjs \
  --config /secure/private/study.json \
  --cohort /secure/private/frozen-pre-outcome.csv \
  --assigned-at 2026-11-14T15:00:00Z \
  --manifest /secure/private/manifest.csv \
  --report /secure/private/manifest-summary.json
```

The example UTC date is **illustrative only**, not a scheduled trial or invitation to backdate. Use the actual current UTC timestamp at execution. The CLI refuses overwriting output files and creates them mode 0600. Protect the parent directory and secret environment. The manifest digest is intended for independent timestamp anchoring, not for public disclosure of the units.

## What this cannot establish

- Genuine participant consent, eligibility, safe domain permission, ethical approval, non-interference, or financial authenticity are **caller assertions**, not independently verified.
- A synthetic CI pass does **not** prove the randomization service was run in Workbench or customers saw the trial treatment.
- HMAC output is cryptographically stable but **does not** establish an independently fair enrollment process if an operator can select the cohort after seeing assignments or search for a favorable seed. External secret commitment, source archive and audit remain essential.
- An assignment manifest cannot demonstrate net profit until actual observed, complete, externally reconciled economic outcomes mature and pass a predeclared ITT statistical review.

**Current blocker:** first obtain a real consented independent cohort and verified baseline net-USD variance. Until those exist, report `NOT_READY` rather than registering fictitious participants. See [economic shadow adapter](./economic-shadow-authorization.md) and [shadow-policy power readiness](./shadow-policy-readiness.md) for the earlier pre-enrollment stages.
