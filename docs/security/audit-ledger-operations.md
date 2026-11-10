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
enforces contiguous sequence numbers and previous-hash linkage, and rejects
checkpoints that do not match a persisted chain head.

This protects against ordinary application-role mutation. It does not protect
against a database owner, superuser, privileged migration role, storage
administrator, or an attacker who can replace both database and trust anchor.
Triggers and SQL grants are not a substitute for independent checkpoint
anchoring.

## Apply migration

Apply migrations in order through 0005_append_only_audit_ledger.sql. Run
migrations as a dedicated schema owner, not as the application runtime role.
Do not let application processes execute DDL.

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

    import { createPostgresAuditLedger } from "@signal/idempotency-postgres";

    const ledger = createPostgresAuditLedger({
      connectionString: process.env.SIGNAL_AUDIT_DATABASE_URL!,
      maxConnections: 5,
    });

Append each AuditChainEntry in sequence. The first entry must have sequence
zero and the genesis previous hash (64 zeroes). Later entries must use the
persisted head hash and next sequence. Use readEntries for reconstruction.
Use appendCheckpoint only after signing with a separately managed key.
latestCheckpoint returns the latest stored checkpoint; verify its signature
against a trusted public-key registry before relying on it. Close the adapter
during graceful shutdown.

The adapter validates chain continuity and checkpoint-to-head binding. The same insert-only role may persist replay evidence through createPostgresReplayEvidenceStore after migration 0006; grant SELECT and INSERT on signal_replay_evidence and no mutation privileges. It does
not independently recompute every entry hash or verify checkpoint signatures.
Use Signal's verifyChain, verifyAuditCheckpoint, and
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
