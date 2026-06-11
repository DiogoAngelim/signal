import { z } from "zod";

export const HealthCheckResponse = z.object({
  status: z.string(),
  timestamp: z.string().optional(),
  uptime: z.number().optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponse>;
