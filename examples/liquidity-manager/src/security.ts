export const ENCRYPTION_SECRET_ENV = "LIQUIDITY_MANAGER_ENCRYPTION_SECRET";

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const lastTwo = digits.slice(-2);
  return `***.***.***-${lastTwo}`;
}

export function readEncryptionSecret(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return (
    process.env?.[ENCRYPTION_SECRET_ENV] ??
    process.env?.VITE_LIQUIDITY_MANAGER_ENCRYPTION_SECRET
  );
}

export async function encryptSessionData(
  data: unknown,
  secret = readEncryptionSecret(),
): Promise<string> {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const secretMaterial = secret || "development-only-local-secret";
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.subtle && typeof cryptoApi.getRandomValues === "function") {
    const encoder = new TextEncoder();
    const keyDigest = await cryptoApi.subtle.digest(
      "SHA-256",
      encoder.encode(secretMaterial),
    );
    const key = await cryptoApi.subtle.importKey(
      "raw",
      keyDigest,
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const encrypted = await cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(payload),
    );
    return `aes-gcm:v1:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
  }

  const bytes = new TextEncoder().encode(payload);
  const secretBytes = new TextEncoder().encode(secretMaterial);
  const mixed = bytes.map(
    (byte, index) => byte ^ secretBytes[index % secretBytes.length]!,
  );
  return `development-fallback:v1:${toBase64(mixed)}`;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
