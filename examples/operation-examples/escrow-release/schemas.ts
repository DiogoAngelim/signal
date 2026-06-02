import { z } from "zod";

export const escrowStatusInputSchema = z.object({
  escrowId: z.string().min(1),
});

export const escrowStatusResultSchema = z.object({
  escrowId: z.string().min(1),
  status: z.enum(["held", "released"]),
  beneficiaryId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  releasedAt: z.string().datetime().nullable(),
  releaseAttempts: z.number().int().nonnegative(),
});

export const escrowReleaseInputSchema = z.object({
  escrowId: z.string().min(1),
});

export const escrowReleasedEventSchema = z.object({
  escrowId: z.string().min(1),
  beneficiaryId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  releasedAt: z.string().datetime(),
});
