import { createHash } from "node:crypto";

export const createDeterministicId = (input: string): string =>
  createHash("sha256").update(input).digest("hex");
