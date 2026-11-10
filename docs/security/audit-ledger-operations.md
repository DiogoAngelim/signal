# PostgreSQL append-only audit ledger operations

## Capability

The idempotency-postgres package exports createPostgresAuditLedger. Migration
0005_append_only_audit_ledger.sql creates:
- signal_audit_entries, storing a contiguous sequence, full entry,
  previous hash, and entry hash;
- signal_audit_checkpoints, storing signed checkpoint metadata;
- triggers rejecting row updates/deletes and table truncation;
- default PUBLIC revocations for update, delete, and truncate.

The adapter serializes appends with a transaction-scoped advisory lock,
enforces contiguous sequence numbers and previous-hash linkage, verifies each
persisted entry hash when reading, checks the persisted head before appending,
and requires trusted entry and checkpoint verification callbacks. It verifies
checkpoint signatures when loading the latest checkpoint.

This protects against ordinary application-role mutation. It does not protect
against a database owner, superuser, privileged migration role, storage
administrator, or an attacker who can replace both database and trust anchor.
Triggers and SQL grants are not a substitute for independent checkpoint
anchoring.

## Apply migration

Apply migrations in numeric order through 0005_append_only_audit_ledger.sql
for the audit ledger. If using the replay evidence store, also apply
0006_immutable_replay_evidence.sql before granting access to
signal_replay_evidence. Apply 0007_shared_retry_budgets.sql before using the
PostgreSQL retry-budget adapter. Run migrations as a dedicated schema owner, not as the
application runtime role. Do not let application processes execute DDL.

## Least-privilege application role

Create a non-owner role for the runtime and grant only required operations:

    CREATE ROLE signal_audit_writer LOGIN;
    GRANT CONNECT ON DATABASE your_database TO signal_audit_writer;
    GRANT USAGE ON SCHEMA public TO signal_audit_writer;
    GRANT SELECT, INSERT ON signal_audit_entries TO signal_audit_writer;
    GRANT SELECT, INSERT ON signal_audit_checkpoints TO signal_audit_writer;
    GRANT SELECT, INSERT ON signal_replay_evidence TO signal_audit_writer;
    GRANT USAGE, SELECT ON SEQUENCE signal_audit_checkpoints_checkpoint_id_seq
      TO signal_audit_writer;
    REVOKE UPDATE, DELETE, TRUNCATE ON signal_audit_entries FROM signal_audit_writer;
    REVOKE UPDATE, DELETE, TRUNCATE ON signal_audit_checkpoints FROM signal_audit_writer;
    REVOKE UPDATE, DELETE, TRUNCATE ON signal_replay_evidence FROM signal_audit_writer;

Do not grant ownership, CREATE on the schema, trigger-management privileges,
or membership in a role that can mutate audit tables. Review inherited grants
and default privileges. Use separate roles for migration, application writes,
read-only audit, and checkpoint anchoring.

## Runtime wiring

    import { createPostgresAuditLedger, createPostgresRetryBudget } from "@signal/idempotency-postgres";
    import { verifyAuditChainEntry, verifyAuditCheckpoint } from "@signal/runtime";

    const ledger = createPostgresAuditLedger({
      connectionString: process.env.SIGNAL_AUDIT_DATABASE_URL!,
      verifyEntry: verifyAuditChainEntry,
      verifyCheckpoint: (checkpoint) => {
        const publicKey = trustedPublicKeys.get(checkpoint.keyId);
        return publicKey
          ? verifyAuditCheckpoint(checkpoint, publicKey, checkpoint.keyId)
          : false;
      },
      maxConnections: 5,
    });

Append each AuditChainEntry in sequence. The first entry must have sequence
zero and the genesis previous hash (64 zeroes). Later entries must use the
persisted head hash and next sequence. Use readEntries for reconstruction.
Use appendCheckpoint only after signing with a separately managed key.
latestCheckpoint verifies the stored signature through the configured
trusted-key callback before returning a checkpoint. The caller must still
verify the checkpoint against an independently retained chain head and trust
anchor. Close the adapter during graceful shutdown.

For retries that must be budgeted across replicas, use
createPostgresRetryBudget with a stable shared budgetKey, capacity, and refill
rate. Apply migration 0007 first and inject the returned adapter into
executeWithRetry as retryBudget. All replicas sharing a fleet-wide allowance
must use the same key and coordination database. This performs a database
round trip for each retry; choose a low-latency coordination database and
define a fail-closed response for its outage. Close the budget adapter during
graceful shutdown.

The adapter verifies each returned entry's schema and content hash, sequence,
and linkage to the preceding persisted entry (including the predecessor for
paged reads). Before appending, it verifies the current persisted head. It also
verifies checkpoint signatures through the configured trusted-key callback.
The caller remains responsible for full-history verification from a trusted
checkpoint and for comparison with an independently stored trust anchor. The
same least-privilege role may persist replay evidence after migration 0006;
grant only SELECT and INSERT on signal_replay_evidence and no mutation
privileges. Use Signal's verifyChain, verifyAuditCheckpoint, and
verifyCheckpointAgainstChain primitives during audit/recovery workflows.

## External checkpoint anchoring and key custody

Production deployments must:
1. Keep private signing keys in a managed KMS/HSM or equivalent isolated
   secret boundary. Never store private keys in this database, source control,
   application logs, or ordinary environment files.
2. Use key IDs mapped to a versioned public-key trust registry. Record key
   activation, overlap, retirement, revocation, and operator approvals.
3. Periodically sign the latest verified chain head and write the checkpoint
   to an independently administered append-only or object-lock store.
4. Keep the external store IAM boundary separate from the Signal database
   administrator and application writer.
5. Retain previous checkpoints and key metadata for the audit-retention period.
6. Verify signatures and chain-head consistency after backup restore.
7. Test substitution, deletion, rollback, and full-history rewrite attacks
   against the deployed external store.
8. Record access, key rotation, restore, and verification in an independently
   protected administrative audit log.

A checkpoint stored only beside the mutable audit chain is not an independent
trust anchor. A signature proves possession of the signing key, not that the
underlying evidence is truthful or externally timestamped.

## Failure and recovery

- Never update or delete ledger rows to repair a chain. Preserve original
  evidence and append a correction or superseding record under governance.
- If an append fails due to sequence/hash mismatch, stop the writer and
  investigate the persisted head. Do not skip sequence numbers.
- If the latest checkpoint does not match a restored chain, quarantine the
  restored copy and investigate before serving audit reads.
- If a signing key is suspected compromised, stop signing, preserve public-key
  history, revoke the key in the trust registry, and perform reviewed rotation.
- Test restore with the external checkpoint store available and unavailable;
  define recovery-point and recovery-time objectives separately.

## Validation boundary

The repository contains source and PostgreSQL integration tests for
append-only triggers, contiguous writes, and checkpoint/head binding.
Production key custody, independently controlled checkpoint storage,
privileged-role review, retention, restore verification, and substitution
testing remain deployment responsibilities until exercised against the actual
infrastructure.
