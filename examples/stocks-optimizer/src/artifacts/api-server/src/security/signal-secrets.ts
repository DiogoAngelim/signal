import crypto from "node:crypto";
import { ApiProblem } from "../observability/signal-http.js";

const CIPHER_VERSION = "v1";

export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(ciphertext: string): string {
  const [version, iv, tag, encrypted] = ciphertext.split(".");
  if (version !== CIPHER_VERSION || !iv || !tag || !encrypted) {
    throw new ApiProblem(500, "secret_decryption_failed", "Stored signal secret has an unsupported format.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function secretPreview(secret: string) {
  if (secret.length <= 10) return "********";
  return `${secret.slice(0, 5)}...${secret.slice(-5)}`;
}

export function generateDisplaySecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function verifyWebhookSignatureWithSecrets(input: {
  currentSecret: string;
  previousSecret?: string;
  previousSecretExpiresAt?: string;
  timestamp: string;
  event: string;
  deliveryId: string;
  body: string;
  signature: string;
}) {
  const current = signWebhookPayload({
    secret: input.currentSecret,
    timestamp: input.timestamp,
    event: input.event,
    deliveryId: input.deliveryId,
    body: input.body,
  });
  if (constantTimeEqual(current, input.signature)) return true;

  if (!input.previousSecret || !input.previousSecretExpiresAt) return false;
  if (Date.parse(input.previousSecretExpiresAt) <= Date.now()) return false;

  const previous = signWebhookPayload({
    secret: input.previousSecret,
    timestamp: input.timestamp,
    event: input.event,
    deliveryId: input.deliveryId,
    body: input.body,
  });
  return constantTimeEqual(previous, input.signature);
}

export function signWebhookPayload(input: {
  secret: string;
  timestamp: string;
  event: string;
  deliveryId: string;
  body: string;
}) {
  return `sha256=${hmacSha256(input.secret, `${input.timestamp}.${input.event}.${input.deliveryId}.${input.body}`)}`;
}

export function signIngestionPayload(input: {
  secret: string;
  timestamp: string;
  body: string;
}) {
  return `sha256=${hmacSha256(input.secret, `${input.timestamp}.${input.body}`)}`;
}

export function hmacSha256(secret: string, message: string) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    const maxLength = Math.max(leftBuffer.length, rightBuffer.length, 1);
    const paddedLeft = Buffer.alloc(maxLength);
    const paddedRight = Buffer.alloc(maxLength);
    leftBuffer.copy(paddedLeft);
    rightBuffer.copy(paddedRight);
    crypto.timingSafeEqual(paddedLeft, paddedRight);
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function encryptionKey() {
  const configured = process.env.SIGNAL_SECRET_ENCRYPTION_KEY?.trim();

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiProblem(
        503,
        "secret_encryption_key_missing",
        "Production requires SIGNAL_SECRET_ENCRYPTION_KEY.",
      );
    }
    return crypto.createHash("sha256").update("stocks-optimizer-local-secret-key").digest();
  }

  if (/^[a-f0-9]{64}$/i.test(configured)) {
    return Buffer.from(configured, "hex");
  }

  try {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to deterministic hashing of deployment-provided secret material.
  }

  return crypto.createHash("sha256").update(configured).digest();
}
