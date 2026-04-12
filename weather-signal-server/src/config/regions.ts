import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Region } from "../types/index.js";

const regionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  country: z.string().min(2),
  state: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1),
  criticalityWeight: z.number().min(0.5).max(2).optional(),
  tags: z.array(z.string()).optional()
});

const regionsSchema = z.array(regionSchema).min(1);

export function loadRegions(configPath: string): Region[] {
  const resolvedPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = JSON.parse(raw);
  const result = regionsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid region configuration: ${issues.join(", ")}`);
  }
  return result.data;
}
