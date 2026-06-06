import type { CalibrationInput } from "./engine";

export type CalibrationQuery = {
  from?: string;
  to?: string;
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
  metadata?: Record<string, unknown>;
};

export type CalibrationStore = {
  record(input: CalibrationInput): Promise<void>;
  list(query?: CalibrationQuery): Promise<CalibrationInput[]>;
  clear(): Promise<void>;
};

export class InMemoryCalibrationStore implements CalibrationStore {
  private records: CalibrationInput[] = [];

  async record(input: CalibrationInput) {
    this.records.push(cloneInput(input));
  }

  async list(query: CalibrationQuery = {}) {
    return applyQuery(this.records, query).map(cloneInput);
  }

  async clear() {
    this.records = [];
  }
}

export class FileSystemCalibrationStore implements CalibrationStore {
  constructor(private readonly filePath: string) {}

  async record(input: CalibrationInput) {
    const records = await this.readRecords();
    records.push(cloneInput(input));
    await this.writeRecords(records);
  }

  async list(query: CalibrationQuery = {}) {
    return applyQuery(await this.readRecords(), query).map(cloneInput);
  }

  async clear() {
    const { rm } = await import("node:fs/promises");
    await rm(this.filePath, { force: true });
  }

  private async readRecords() {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isCalibrationInput) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeRecords(records: CalibrationInput[]) {
    const [{ mkdir, writeFile }, { dirname }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`);
  }
}

function applyQuery(records: CalibrationInput[], query: CalibrationQuery) {
  const from = dateValue(query.from);
  const to = dateValue(query.to);
  const minConfidence =
    query.minConfidence == null ? undefined : normalizeConfidence(query.minConfidence);
  const maxConfidence =
    query.maxConfidence == null ? undefined : normalizeConfidence(query.maxConfidence);
  const limit = positiveLimit(query.limit);
  const filtered = records.filter((record) => {
    const timestamp = dateValue(record.timestamp);
    const confidence = normalizeConfidence(record.confidence);
    const timestampMatches =
      (from == null || (timestamp != null && timestamp >= from)) &&
      (to == null || (timestamp != null && timestamp <= to));
    const confidenceMatches =
      (minConfidence == null || confidence >= minConfidence) &&
      (maxConfidence == null || confidence <= maxConfidence);
    const metadataMatches = metadataMatchesQuery(record.metadata, query.metadata);
    return timestampMatches && confidenceMatches && metadataMatches;
  });
  return limit == null ? filtered : filtered.slice(0, limit);
}

function metadataMatchesQuery(
  metadata: Record<string, unknown> | undefined,
  query: Record<string, unknown> | undefined,
) {
  if (!query) return true;
  return Object.entries(query).every(([key, value]) =>
    Object.is(metadata?.[key], value),
  );
}

function dateValue(value: string | undefined) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function positiveLimit(value: number | undefined) {
  if (value == null) return undefined;
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : 0;
}

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? Math.min(100, Math.max(0, value * 100)) : Math.min(100, Math.max(0, value));
}

function cloneInput(input: CalibrationInput) {
  return structuredClone(input);
}

function isCalibrationInput(value: unknown): value is CalibrationInput {
  return (
    value != null &&
    typeof value === "object" &&
    "prediction" in value &&
    Number.isFinite(Number((value as CalibrationInput).confidence))
  );
}
