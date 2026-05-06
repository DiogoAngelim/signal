import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { createSignalRuntime } from "@signal/sdk-node";
import { createMemoryIdempotencyStore, createReplaySafeSubscriber } from "@signal/runtime";

export function createExampleRuntime() {
  return createSignalRuntime({
    idempotencyStore: createMemoryIdempotencyStore(),
    runtimeName: "signal-example",
  });
}

type MaybePromise<T> = T | Promise<T>;

export type ExampleTrainingOperationKind =
  | "query"
  | "mutation"
  | "event"
  | "subscriber"
  | "dispatch"
  | "subscription";

export interface ExampleTrainingOperationState {
  kind: ExampleTrainingOperationKind;
  name: string;
  observations: number;
  successes: number;
  failures: number;
  weight: number;
  confidence: number;
  lastObservedAt: string | null;
  lastInput?: unknown;
  lastResult?: unknown;
  lastError?: {
    name?: string;
    code?: string;
    message: string;
  } | null;
}

export interface ExampleTrainingObservation {
  kind: ExampleTrainingOperationKind;
  name: string;
  status: "success" | "failure";
  at: string;
}

export interface ExampleSelfTrainingSnapshot {
  version: 1;
  moduleId: string;
  updatedAt: string;
  totals: {
    observations: number;
    successes: number;
    failures: number;
  };
  parameters: {
    learningRate: number;
    decayRate: number;
    minimumWeight: number;
    maximumWeight: number;
    operations: Record<string, ExampleTrainingOperationState>;
  };
  recentObservations: ExampleTrainingObservation[];
}

export interface ExampleSelfTrainingModule {
  readonly moduleId: string;
  readonly storageKind: "file" | "postgres";
  readonly storageKey: string;
  readonly filePath?: string;
  snapshot(): Promise<ExampleSelfTrainingSnapshot>;
  recordQuery(
    name: string,
    input: unknown,
    outcome: { status: "success"; result: unknown } | { status: "failure"; error: unknown }
  ): Promise<void>;
  recordMutation(
    name: string,
    input: unknown,
    outcome: { status: "success"; result: unknown } | { status: "failure"; error: unknown }
  ): Promise<void>;
  recordEvent(
    name: string,
    input: unknown,
    outcome: { status: "success"; result: unknown } | { status: "failure"; error: unknown }
  ): Promise<void>;
  recordSubscriber(
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void>;
  recordDispatch(
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void>;
  recordSubscription(
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void>;
}

export interface ExampleSelfTrainingOptions {
  trainingDir?: string;
  connectionString?: string;
  pool?: Pool;
  tableName?: string;
}

export interface ExampleStateWithSelfTraining {
  selfTraining?: ExampleSelfTrainingModule;
}

interface ExampleTrainingStorage {
  kind: "file" | "postgres";
  storageKey: string;
  filePath?: string;
  load(moduleId: string): Promise<ExampleSelfTrainingSnapshot>;
  persist(snapshot: ExampleSelfTrainingSnapshot): Promise<void>;
}

const DEFAULT_TRAINING_DIR = path.resolve(process.cwd(), ".signal-example-training");
const DEFAULT_TRAINING_TABLE = "signal_example_self_training";
const TRAINING_SNAPSHOT_VERSION = 1 as const;
const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_DECAY_RATE = 0.5;
const DEFAULT_MIN_WEIGHT = 0.1;
const DEFAULT_MAX_WEIGHT = 4;
const MAX_RECENT_OBSERVATIONS = 20;
const MAX_SNAPSHOT_DEPTH = 4;
const MAX_SNAPSHOT_ITEMS = 10;
const SHARED_TRAINING_POOLS = new Map<string, Pool>();
const ENSURED_TRAINING_TABLES = new WeakMap<Pool, Map<string, Promise<void>>>();

function sanitizeModuleId(moduleId: string): string {
  return moduleId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-") || "example";
}

function sanitizeTableName(tableName: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName) ? tableName : DEFAULT_TRAINING_TABLE;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function createEmptyTrainingSnapshot(moduleId: string): ExampleSelfTrainingSnapshot {
  return {
    version: TRAINING_SNAPSHOT_VERSION,
    moduleId,
    updatedAt: new Date(0).toISOString(),
    totals: {
      observations: 0,
      successes: 0,
      failures: 0,
    },
    parameters: {
      learningRate: DEFAULT_LEARNING_RATE,
      decayRate: DEFAULT_DECAY_RATE,
      minimumWeight: DEFAULT_MIN_WEIGHT,
      maximumWeight: DEFAULT_MAX_WEIGHT,
      operations: {},
    },
    recentObservations: [],
  };
}

function cloneSnapshot(snapshot: ExampleSelfTrainingSnapshot): ExampleSelfTrainingSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ExampleSelfTrainingSnapshot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth >= MAX_SNAPSHOT_DEPTH) {
    return "[truncated]";
  }
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    const maybeCode =
      typeof (value as { code?: unknown }).code === "string"
        ? (value as { code?: string }).code
        : undefined;
    return {
      name: value.name,
      code: maybeCode,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_SNAPSHOT_ITEMS).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()]
        .slice(0, MAX_SNAPSHOT_ITEMS)
        .map(([key, entry]) => [String(key), sanitizeValue(entry, depth + 1)])
    );
  }
  if (value instanceof Set) {
    return [...value.values()]
      .slice(0, MAX_SNAPSHOT_ITEMS)
      .map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_SNAPSHOT_ITEMS)
        .map(([key, entry]) => [key, sanitizeValue(entry, depth + 1)])
    );
  }
  return String(value);
}

function resolveTrainingTableName(options: ExampleSelfTrainingOptions): string {
  return sanitizeTableName(
    options.tableName ?? process.env["SIGNAL_EXAMPLE_TRAINING_TABLE"] ?? DEFAULT_TRAINING_TABLE
  );
}

function resolveTrainingConnectionString(options: ExampleSelfTrainingOptions): string | undefined {
  if (options.pool) {
    return undefined;
  }

  if (options.connectionString) {
    return options.connectionString;
  }

  if (process.env["SIGNAL_EXAMPLE_TRAINING_DATABASE_URL"]) {
    return process.env["SIGNAL_EXAMPLE_TRAINING_DATABASE_URL"];
  }

  const explicitTrainingDir =
    options.trainingDir ?? process.env["SIGNAL_EXAMPLE_TRAINING_DIR"];
  if (explicitTrainingDir) {
    return undefined;
  }

  return process.env["DATABASE_URL"];
}

function resolveTrainingDir(options: ExampleSelfTrainingOptions): string {
  return (
    options.trainingDir ??
    process.env["SIGNAL_EXAMPLE_TRAINING_DIR"] ??
    DEFAULT_TRAINING_DIR
  );
}

function getSharedTrainingPool(connectionString: string): Pool {
  const existing = SHARED_TRAINING_POOLS.get(connectionString);
  if (existing) {
    return existing;
  }

  const config: PoolConfig = {
    allowExitOnIdle: true,
    connectionString,
    max: 1,
  };
  const pool = new Pool(config);
  SHARED_TRAINING_POOLS.set(connectionString, pool);
  return pool;
}

async function withPoolClient<T>(pool: Pool, task: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await task(client);
  } finally {
    client.release();
  }
}

async function ensureTrainingTable(pool: Pool, tableName: string): Promise<void> {
  const readyTables = ENSURED_TRAINING_TABLES.get(pool) ?? new Map<string, Promise<void>>();
  ENSURED_TRAINING_TABLES.set(pool, readyTables);

  const existing = readyTables.get(tableName);
  if (existing) {
    await existing;
    return;
  }

  const quotedTable = quoteIdentifier(tableName);
  const createTable = withPoolClient(pool, async (client) => {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${quotedTable} (
        module_id TEXT PRIMARY KEY,
        snapshot JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
  });

  readyTables.set(tableName, createTable);

  try {
    await createTable;
  } catch (error) {
    readyTables.delete(tableName);
    throw error;
  }
}

async function loadFileTrainingSnapshot(
  filePath: string,
  moduleId: string
): Promise<ExampleSelfTrainingSnapshot> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as
      | ExampleSelfTrainingSnapshot
      | undefined;
    if (parsed?.version !== TRAINING_SNAPSHOT_VERSION || parsed.moduleId !== moduleId) {
      return createEmptyTrainingSnapshot(moduleId);
    }
    return parsed;
  } catch {
    return createEmptyTrainingSnapshot(moduleId);
  }
}

async function persistFileTrainingSnapshot(
  filePath: string,
  snapshot: ExampleSelfTrainingSnapshot
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(snapshot, null, 2));
}

async function loadPostgresTrainingSnapshot(
  pool: Pool,
  tableName: string,
  moduleId: string
): Promise<ExampleSelfTrainingSnapshot> {
  await ensureTrainingTable(pool, tableName);

  const quotedTable = quoteIdentifier(tableName);
  const result = await withPoolClient(pool, (client) =>
    client.query<{ snapshot: ExampleSelfTrainingSnapshot | string }>(
      `SELECT snapshot FROM ${quotedTable} WHERE module_id = $1 LIMIT 1`,
      [moduleId]
    )
  );

  const row = result.rows[0];
  if (!row) {
    return createEmptyTrainingSnapshot(moduleId);
  }

  try {
    const parsed =
      typeof row.snapshot === "string"
        ? (JSON.parse(row.snapshot) as ExampleSelfTrainingSnapshot)
        : row.snapshot;

    if (parsed.version !== TRAINING_SNAPSHOT_VERSION || parsed.moduleId !== moduleId) {
      return createEmptyTrainingSnapshot(moduleId);
    }

    return parsed;
  } catch {
    return createEmptyTrainingSnapshot(moduleId);
  }
}

async function persistPostgresTrainingSnapshot(
  pool: Pool,
  tableName: string,
  snapshot: ExampleSelfTrainingSnapshot
): Promise<void> {
  await ensureTrainingTable(pool, tableName);

  const quotedTable = quoteIdentifier(tableName);
  await withPoolClient(pool, (client) =>
    client.query(
      `INSERT INTO ${quotedTable} (module_id, snapshot, updated_at)
       VALUES ($1, $2::jsonb, $3::timestamptz)
       ON CONFLICT (module_id)
       DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = EXCLUDED.updated_at`,
      [snapshot.moduleId, JSON.stringify(snapshot), snapshot.updatedAt]
    )
  );
}

function createTrainingStorage(
  moduleId: string,
  options: ExampleSelfTrainingOptions
): ExampleTrainingStorage {
  const tableName = resolveTrainingTableName(options);
  const connectionString = resolveTrainingConnectionString(options);
  const pool = options.pool ?? (connectionString ? getSharedTrainingPool(connectionString) : undefined);

  if (pool) {
    return {
      kind: "postgres",
      storageKey: `postgres:${tableName}:${sanitizeModuleId(moduleId)}`,
      load: (moduleId) => loadPostgresTrainingSnapshot(pool, tableName, moduleId),
      persist: (snapshot) => persistPostgresTrainingSnapshot(pool, tableName, snapshot),
    };
  }

  const filePath = path.join(resolveTrainingDir(options), `${sanitizeModuleId(moduleId)}.json`);

  return {
    kind: "file",
    storageKey: filePath,
    filePath,
    load: () => loadFileTrainingSnapshot(filePath, moduleId),
    persist: (snapshot) => persistFileTrainingSnapshot(filePath, snapshot),
  };
}

class PersistentExampleSelfTraining implements ExampleSelfTrainingModule {
  readonly moduleId: string;
  readonly storageKind: "file" | "postgres";
  readonly storageKey: string;
  readonly filePath?: string;
  private readonly storage: ExampleTrainingStorage;
  private state: ExampleSelfTrainingSnapshot;
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(moduleId: string, storage: ExampleTrainingStorage) {
    this.moduleId = moduleId;
    this.storage = storage;
    this.storageKind = storage.kind;
    this.storageKey = storage.storageKey;
    this.filePath = storage.filePath;
    this.state = createEmptyTrainingSnapshot(moduleId);
  }

  async snapshot(): Promise<ExampleSelfTrainingSnapshot> {
    await this.ensureLoaded();
    await this.writeQueue;
    return cloneSnapshot(this.state);
  }

  async recordQuery(
    name: string,
    input: unknown,
    outcome: { status: "success"; result: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    await this.recordSafely("query", name, input, outcome);
  }

  async recordMutation(
    name: string,
    input: unknown,
    outcome: { status: "success"; result: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    await this.recordSafely("mutation", name, input, outcome);
  }

  async recordEvent(
    name: string,
    input: unknown,
    outcome: { status: "success"; result: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    await this.recordSafely("event", name, input, outcome);
  }

  async recordSubscriber(
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    await this.recordSafely("subscriber", name, input, outcome);
  }

  async recordDispatch(
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    await this.recordSafely("dispatch", name, input, outcome);
  }

  async recordSubscription(
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    await this.recordSafely("subscription", name, input, outcome);
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        this.state = await this.storage.load(this.moduleId);
      })();
    }

    await this.loadPromise;
  }

  private async recordSafely(
    kind: ExampleTrainingOperationKind,
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    try {
      await this.record(kind, name, input, outcome);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[signal examples] self-training persistence failed for ${this.moduleId}: ${message}`);
    }
  }

  private async record(
    kind: ExampleTrainingOperationKind,
    name: string,
    input: unknown,
    outcome: { status: "success"; result?: unknown } | { status: "failure"; error: unknown }
  ): Promise<void> {
    const run = this.writeQueue.then(async () => {
      await this.ensureLoaded();

      const key = `${kind}:${name}`;
      const at = new Date().toISOString();
      const existing =
        this.state.parameters.operations[key] ??
        {
          kind,
          name,
          observations: 0,
          successes: 0,
          failures: 0,
          weight: 1,
          confidence: 0,
          lastObservedAt: null,
        };

      existing.observations += 1;
      existing.lastObservedAt = at;
      existing.lastInput = sanitizeValue(input);
      existing.lastError = null;

      this.state.totals.observations += 1;

      if (outcome.status === "success") {
        existing.successes += 1;
        existing.lastResult = sanitizeValue(outcome.result);
        this.state.totals.successes += 1;
      } else {
        existing.failures += 1;
        existing.lastResult = undefined;
        existing.lastError = sanitizeValue(outcome.error) as ExampleTrainingOperationState["lastError"];
        this.state.totals.failures += 1;
      }

      existing.confidence =
        existing.observations > 0
          ? Number((existing.successes / existing.observations).toFixed(4))
          : 0;

      const nextWeight =
        outcome.status === "success"
          ? existing.weight + this.state.parameters.learningRate * (1 - existing.confidence)
          : existing.weight - this.state.parameters.learningRate * this.state.parameters.decayRate;

      existing.weight = Number(
        clamp(
          nextWeight,
          this.state.parameters.minimumWeight,
          this.state.parameters.maximumWeight
        ).toFixed(4)
      );

      this.state.parameters.operations[key] = existing;
      this.state.updatedAt = at;
      this.state.recentObservations.unshift({
        kind,
        name,
        status: outcome.status,
        at,
      });
      this.state.recentObservations = this.state.recentObservations.slice(
        0,
        MAX_RECENT_OBSERVATIONS
      );

      await this.storage.persist(this.state);
    });

    this.writeQueue = run.catch(() => undefined);
    await run;
  }
}

export function createPersistentExampleSelfTraining(
  moduleId: string,
  options: ExampleSelfTrainingOptions = {}
): ExampleSelfTrainingModule {
  return new PersistentExampleSelfTraining(moduleId, createTrainingStorage(moduleId, options));
}

export function ensureExampleSelfTraining<T extends ExampleStateWithSelfTraining>(
  state: T,
  moduleId: string,
  options: ExampleSelfTrainingOptions = {}
): ExampleSelfTrainingModule {
  if (!state.selfTraining) {
    state.selfTraining = createPersistentExampleSelfTraining(moduleId, options);
  }
  return state.selfTraining;
}

export function instrumentExampleQuery<TInput, TResult>(
  selfTraining: ExampleSelfTrainingModule,
  name: string,
  handler: (input: TInput) => MaybePromise<TResult>
): (input: TInput) => Promise<TResult> {
  return async (input: TInput): Promise<TResult> => {
    try {
      const result = await handler(input);
      await selfTraining.recordQuery(name, input, { status: "success", result });
      return result;
    } catch (error) {
      await selfTraining.recordQuery(name, input, { status: "failure", error });
      throw error;
    }
  };
}

export function instrumentExampleMutation<TInput, TResult, TContext>(
  selfTraining: ExampleSelfTrainingModule,
  name: string,
  handler: (input: TInput, context: TContext) => MaybePromise<TResult>
): (input: TInput, context: TContext) => Promise<TResult> {
  return async (input: TInput, context: TContext): Promise<TResult> => {
    try {
      const result = await handler(input, context);
      await selfTraining.recordMutation(name, input, { status: "success", result });
      return result;
    } catch (error) {
      await selfTraining.recordMutation(name, input, { status: "failure", error });
      throw error;
    }
  };
}

export function instrumentExampleEvent<TInput, TResult>(
  selfTraining: ExampleSelfTrainingModule,
  name: string,
  handler: (input: TInput) => MaybePromise<TResult>
): (input: TInput) => Promise<TResult> {
  return async (input: TInput): Promise<TResult> => {
    try {
      const result = await handler(input);
      await selfTraining.recordEvent(name, input, { status: "success", result });
      return result;
    } catch (error) {
      await selfTraining.recordEvent(name, input, { status: "failure", error });
      throw error;
    }
  };
}

export function instrumentExampleSubscriber<TInput, TResult = void>(
  selfTraining: ExampleSelfTrainingModule,
  name: string,
  handler: (input: TInput) => MaybePromise<TResult>
): (input: TInput) => Promise<TResult> {
  return async (input: TInput): Promise<TResult> => {
    try {
      const result = await handler(input);
      await selfTraining.recordSubscriber(name, input, { status: "success", result });
      return result;
    } catch (error) {
      await selfTraining.recordSubscriber(name, input, { status: "failure", error });
      throw error;
    }
  };
}

export { createReplaySafeSubscriber };
