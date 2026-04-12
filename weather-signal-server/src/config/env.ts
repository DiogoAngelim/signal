import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}, z.boolean());

export const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.string().default("info"),
  FORECAST_POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  ALERT_POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(180_000),
  EVENT_RETENTION_LIMIT: z.coerce.number().int().min(50).default(500),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).default(5_000),
  WEBHOOK_RETRY_COUNT: z.coerce.number().int().min(0).max(10).default(3),
  REGION_CONFIG_PATH: z.string().default("./regions.json"),
  PROVIDER_BATCH_SIZE: z.coerce.number().int().min(1).default(3),
  PROVIDER_BATCH_DELAY_MS: z.coerce.number().int().min(0).default(250),
  ENABLE_PROVIDER_OPENMETEO: booleanSchema.default(true),
  ENABLE_PROVIDER_NWS: booleanSchema.default(true),
  DEMO_MODE: booleanSchema.default(false)
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration: ${issues.join(", ")}`);
  }
  return parsed.data;
}
