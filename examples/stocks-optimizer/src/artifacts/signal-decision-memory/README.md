# @signal/decision-memory

Durable shared decision memory for Signal.

The package stores Signal reality snapshots, decisions, outcomes, replay checkpoints, calibration and trust history, memory summaries, and retention jobs. It supports an in-memory adapter for tests and a Postgres adapter for Neon or any compatible Postgres database.

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
SIGNAL_MEMORY_ENABLED=true
SIGNAL_MEMORY_PROVIDER=postgres
SIGNAL_MEMORY_RETENTION_HOT_DAYS=30
SIGNAL_MEMORY_RETENTION_WARM_DAYS=180
SIGNAL_MEMORY_RETENTION_COLD_DAYS=365
```

Every decision references a `RealitySnapshot` so replay can explain the external state that informed the decision. Raw inputs age from hot to warm to cold and finally expire. Compaction preserves lessons, outcome accuracy, trust changes, calibration changes, replay checkpoints, and human explanations while reducing raw payloads and duplicated snapshots.
