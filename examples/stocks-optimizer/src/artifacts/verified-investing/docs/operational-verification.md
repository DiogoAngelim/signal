# Operational verification and promotion boundaries

## Added operational controls

The production server now uses an account/mode-bound SQLite ledger, one renewable writer lease, authenticated startup/readiness endpoints, request draining, token revocation during in-flight SSE analysis, independently verified consumer data identity, and durable execution-result replay. An expired plan retry returns its existing execution result rather than submitting a second order.

`POST /api/investing/reconcile` requires the separate `investing:reconcile` scope. It queries exchange order identity/quantities/status and a fresh account snapshot; it never submits, cancels, or retries an order. Missing/ambiguous responses leave the reservation blocked. A fully terminal, independently reconciled batch requires a NEW plan against current balances. Partial fills are preserved as partial quantities, not original order quantities.

## Backup/restore drill

With a private configuration file and a private backup directory:

```sh
node scripts/ledger-maintenance.mjs verify
node scripts/ledger-maintenance.mjs backup /absolute/private/backups/snapshot.db
```

Keep the emitted SHA-256 digest in an independent trusted record. A colocated writable manifest alone is not an authenticity guarantee. To restore, stop the worker and restore into a NEW file, never overwrite an open database:

```sh
VERIFIED_BACKUP_FILE=/absolute/private/backups/snapshot.db \
  node scripts/ledger-maintenance.mjs restore /absolute/private/restored.db <trusted-sha256>
```

The restore operation checks the file digest, SQLite integrity and the complete audit chain. Research, profiles and unresolved execution reservations survive. Only the old process lease is removed. A restored unresolved exchange order remains blocked pending reconciliation. CI exercises this against actual temporary SQLite files; it is not a backup drill on the user's production host.

## Executable orders versus continuous targets

The MPT objective-gap certificate describes the continuous constrained optimization problem. Execution separately checks post-fee cash, reserve coverage, post-rounding concentration/exposure/volatility, lot/price steps, exchange quantity minimums and known maximums. A bounded one-lot repair may reduce BUY quantities; it never inflates an order to meet a minimum, spends anticipated sale proceeds, changes the user's risk limits or claims a global integer optimum. Unliquidatable dust and exhausted repair budgets remain explicit blockers.

The price-signal research report is not by itself validation of every personalized, dynamically rebalanced portfolio policy. The response explicitly reports `portfolioPolicyPerformanceVerified:false`. A full independently observed allocation-policy performance study remains a separate empirical requirement; passing software tests does not supply it.

## Required external evidence

No code or configuration flag creates 30 elapsed prospective days, actual user financial preferences, legally permitted global-equity coverage, production-host security clearance, exchange testnet fills or production availability evidence. None may be replaced with a simulated clock, made-up credentials or repeated inspection of an already-used final test. Read-only broker startup can be configured with trading permissions disabled; autonomous execution and live acknowledgement remain separate opt-ins.

The system is still single-host persistent infrastructure, not a multi-region HA trading cluster. Do not run the same real account in multiple independently configured ledgers. Credentials never belong in requests, committed configuration, fixtures or CI logs. No live trading is enabled by the operational test suite.
