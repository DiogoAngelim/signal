import { z } from "zod";

export const userProfileInputSchema = z.object({
  userId: z.string().min(1),
});

export const userProfileResultSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  plan: z.enum(["free", "pro"]),
  status: z.enum(["draft", "onboarded"]),
  onboardedAt: z.string().datetime().nullable(),
  onboardAttempts: z.number().int().nonnegative(),
});

export const userOnboardInputSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  plan: z.enum(["free", "pro"]),
});

export const userOnboardedEventSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  plan: z.enum(["free", "pro"]),
  onboardedAt: z.string().datetime(),
});
