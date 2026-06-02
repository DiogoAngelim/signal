import { z } from "zod";

export const paymentStatusInputSchema = z.object({
  paymentId: z.string().min(1),
});

export const paymentStatusResultSchema = z.object({
  paymentId: z.string().min(1),
  status: z.enum(["authorized", "captured"]),
  amount: z.number().positive(),
  currency: z.string().length(3),
  capturedAt: z.string().datetime().nullable(),
  captureAttempts: z.number().int().nonnegative(),
});

export const paymentCaptureInputSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
});

export const paymentCapturedEventSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  capturedAt: z.string().datetime(),
});

export const paymentCaptureLogInputSchema = z.object({
  paymentId: z.string().min(1),
});

export const paymentCaptureLogEntrySchema = z.object({
  messageId: z.string().min(1),
  paymentId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  capturedAt: z.string().datetime(),
});

export const paymentCaptureLogResultSchema = z.object({
  paymentId: z.string().min(1),
  events: z.array(paymentCaptureLogEntrySchema),
});

export type PaymentStatusInput = z.infer<typeof paymentStatusInputSchema>;
export type PaymentStatusResult = z.infer<typeof paymentStatusResultSchema>;
export type PaymentCaptureInput = z.infer<typeof paymentCaptureInputSchema>;
export type PaymentCapturedEvent = z.infer<typeof paymentCapturedEventSchema>;
export type PaymentCaptureLogInput = z.infer<typeof paymentCaptureLogInputSchema>;
export type PaymentCaptureLogEntry = z.infer<typeof paymentCaptureLogEntrySchema>;
export type PaymentCaptureLogResult = z.infer<typeof paymentCaptureLogResultSchema>;
