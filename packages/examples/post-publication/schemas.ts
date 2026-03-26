import { z } from "zod";

export const postGetInputSchema = z.object({
  postId: z.string().min(1),
});

export const postStateSchema = z.object({
  postId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().nullable(),
  publishAttempts: z.number().int().nonnegative(),
});

export const postPublishInputSchema = z.object({
  postId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const postPublishedEventSchema = z.object({
  postId: z.string().min(1),
  title: z.string().min(1),
  publishedAt: z.string().datetime(),
});

export type PostGetInput = z.infer<typeof postGetInputSchema>;
export type PostState = z.infer<typeof postStateSchema>;
export type PostPublishInput = z.infer<typeof postPublishInputSchema>;
export type PostPublishedEvent = z.infer<typeof postPublishedEventSchema>;
