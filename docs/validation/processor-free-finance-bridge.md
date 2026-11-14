# Independent Signal trial: Stripe-free bank + bookkeeping finance bridge

**Status:** additive research-only, offline and no-deploy. No Stripe, Workbench, payment-processor API, bank API, database writes or account connections. No real independent partner or actual financial outcomes have been supplied. This tool **does not constitute a live randomized trial or a finding of causal Signal profit**.

## What this solves

The existing [independent software exposure and net-profit auditor](./independent-software-profit-trial.md) accepts a source-verified `finances.jsonl` file and combines it with real assignment, delivery, human-approval and independently signed financial records. Previously, there was no explicit, processor-neutral way to turn ordinary business *bank statements plus internal bookkeeping exports* into that exact accounting schema.

The new `scripts/validation/independent-bank-finance-bridge.mjs` bridges that gap without any provider's connector. It enforces all one-to-one randomized relationship units, independently declared closed accounting windows, verified explicit zero receipts, unique source transaction hashes, and cents-only cost consistency. It never fabricates an absent payment into zero or guesses unknown cost values.

**Important:** this adapter **cannot authenticate** that a purported "bank" CSV is genuinely from a bank. Original bank and bookkeeping files, provenance, complete account/channel coverage, settlement status, charges, refunds, participant consent and external accountability must be validated and attested by the real independent custodian, outside the code. A cryptographic hash of the user's self-supplied CSV is not proof of authenticity.

## Sanitized input contracts (NO PII)

Only use owner-approved, locally normalized export files with **exact field names and order**, comma-delimited, no quoted cells. Never put original bank accounts, real payment IDs, customer names, addresses, emails, phone numbers, transaction narrative text or personally identifying references in a CSV. Use a privacy-reviewed keyed relationship pseudonym (`unit_hash`) and separate 64-hex hashes for source lines. Keep *original* bank statements in an independently controlled private audit vault. Do not upload these original financial records to GitHub, issue comments or ChatGPT.

### 1. Frozen pre-exposure assignments

Use the existing `prospective-cohort-assignment.mjs` generated private `manifest.csv`. Its ten fixed columns are: `unit_hash,registered_trial_id,assigned_arm,assigned_at,decision_at,baseline_action,signal_action,baseline_model_version,signal_model_version,decision_input_sha256`. All pre-outcome policy snapshots must be genuine and created before assignment; the HMAC key must be independently committed and externally timestamp-anchored. Do not create any enrollment or unapproved real assignment just to use this adapter.

### 2. Normalized bank transactions

File `normalized-bank-transactions.csv`, header:

```csv
unit_hash,transaction_hash,posted_at,currency,entry_type,amount_cents,statement_sha256,source_record_sha256
```

Each **settled, positive** financial entry has one row. `entry_type` is exactly `settled_receipt`, `settled_refund` (include chargebacks/reversals), or `payment_fee`. Use integer USD cents and actual UTC posting time. `statement_sha256` must identify the **original** bank statement, and `source_record_sha256` uniquely represents its original source line; both must be 64-hex. The same original line cannot be counted twice, even across units. A transaction for an unassigned unit is rejected. Payments must post between assignment and the predeclared outcome cutoff; refunds/fees may post in the separately verified closeout tail before the final statement. A file with only its header represents no transactions **only when the independent closeout explicitly verifies zero settled receipts for every unit**.

**This is normalized source accounting, not bank scraping.** The independent custodian must confirm deposits are not merely invoices, card authorizations or accruals; refunds are deducted once; all relevant financial accounts and funding channels were reconciled; and payment fees are not duplicated in bookkeeping. No bank account or merchant token is needed by this tool.

### 3. Independent operating-cost bookkeeping

File `normalized-independent-costs.csv`, header:

```csv
unit_hash,bookkeeping_sha256,cost_record_sha256,fulfillment_cents,sales_minutes,sales_hourly_loaded_cents,delivery_minutes,delivery_hourly_loaded_cents,review_minutes,review_hourly_loaded_cents,compute_cents,other_software_cents,delay_cents,remediation_cents,harm_event
```

All values required, including explicit zeroes. `cost_record_sha256` is unique original record provenance, not an arbitrary pasted text ID. Fixed software license, AI compute, human review, payroll overhead, equipment, commissions and financing costs must be allocated according to the **independently registered, identical cost-accounting methodology for both arms**. The listed schema does not independently ensure all potential taxes or business-specific opportunity costs have been captured; the accountant must either include them consistently within a frozen approved category or determine this is a contribution-margin trial rather than a full net-income trial. Never rename gross revenue "net profit."

The adapter checks cents, minutes and loaded hourly rate boundaries, and uses the exact same rounding rule as the signed ledger. It intentionally refuses oversized or incompatible monetary books rather than risking JavaScript precision loss.

### 4. Independent closeout certification

File `verified-account-closeouts.csv`, header:

```csv
unit_hash,outcome_at,statement_at,bank_statement_sha256,bookkeeping_sha256,period_complete,receipts_reconciled,costs_reconciled,all_payment_channels_included,zero_receipts_verified,reversal_window_closed
```

One closeout per **every randomized unit**, including no-action, wait, abstention, nonadherence, zero receipts, and refunds. All `period_complete`, `receipts_reconciled`, `costs_reconciled`, `all_payment_channels_included` and `reversal_window_closed` must explicitly be `1`; those values remain **accountant assertions requiring external audit**, not self-proving facts. `outcome_at` must be after the entire registered observation window. `statement_at` must follow or equal `outcome_at`, to include a verified refund/chargeback tail. Later money cannot silently be excluded if the externally frozen economic definition requires it. All original bank and cost source hashes must match normalized records.

The adapter refuses incomplete or duplicate units, unknown currency, fake zeros, pre-assignment money, late receipts outside the outcome window, bank entries after statement close, unrecognized transaction types, unsigned participant additions and source-line double counting.

## Processor-free runbook

When a **real, consenting, independently approved** partner and source accountant exist, they keep original bank/ledger data securely, normalize it locally, and run:

```sh
node scripts/validation/independent-bank-finance-bridge.mjs \
  --config /private/trial/frozen-study.json \
  --manifest /private/trial/externally-anchored-assignments.csv \
  --transactions /private/trial/normalized-bank-transactions.csv \
  --costs /private/trial/normalized-independent-costs.csv \
  --closeouts /private/trial/verified-account-closeouts.csv \
  --finances /private/trial/finances.jsonl \
  --report /private/trial/bank-bridge-summary.json
```

This produces **private**, write-once 0600 files outside the checkout. It does not print money by unit. The output `finances.jsonl` has the **exact** `FINANCE` fields required by the unchanged signed `independent-software-profit-ledger.mjs`; it reports its own provenance limitations and never gives a green efficacy verdict.

After independent bank/source reconciliation is complete, the approved **independent custodian** signs hashes of the exact frozen config, original externally anchored assignment manifest, real exposure JSONL, and this validated `finances.jsonl` using its separately trusted Ed25519 private key. The private key must never be stored in a public repo or assistant transcript. The prior source-custody protocol and downstream commands are in [independent-software-profit-trial.md](./independent-software-profit-trial.md). No software action is sent by this bridge.

After all required real outcomes mature, assemble the signed, full intention-to-treat finalized financial CSV with `independent-software-profit-ledger.mjs` and run the existing `prospective-policy-trial-audit.mjs`. Its statistical superiority gate must pass independently reviewed assignment integrity, realized **net USD contribution**, material improvement versus the strong conventional optimizer, and safety—not just produce a positive point estimate.

## CI and scientific verdict

```sh
node scripts/validation/independent-bank-finance-bridge.mjs --self-test
```

The fixture contains 64 fictional randomized units, real-world-like **synthetic** settled-cash entries including explicit zero receipts, partial refunds and fees; cost schedules and closed statements. It tests the full chain through a synthetic Ed25519 signature, existing independent software ledger and existing ITT auditor. This checks software correctness only—**not real bank authenticity, experimental consent or causal profit**.

**Current status: independent trial not enrolled, actual Signal software deployment not randomized, actual net profit not observed, causal Signal superiority not demonstrated.** The next real prerequisite is an independently approved partner with eligible decisions, actual bank/operating-cost records, and a feasible baseline variance/power analysis. Neither Stripe nor Workbench is necessary.
