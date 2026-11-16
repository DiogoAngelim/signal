import pg from "pg";
import nodemailer from "nodemailer";
import { betterAuth } from "better-auth";
import { ApiProblem } from "../observability/signal-http.js";

let cachedAuth: ReturnType<typeof betterAuth> | null = null;
const { Pool } = pg;

/**
 * Better Auth remains lazily initialized: existing Signal endpoints can build
 * and run without Lúmina provisioning. Auth itself FAILS CLOSED until secrets,
 * a durable Postgres DB, and production email delivery have been configured.
 */
export function luminaConfigured() {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  return Boolean(process.env.DATABASE_URL && secret.length >= 32);
}

export function luminaMailReady() {
  return Boolean(
    process.env.LUMINA_SMTP_HOST &&
    process.env.LUMINA_SMTP_FROM &&
    process.env.LUMINA_SMTP_USER &&
    process.env.LUMINA_SMTP_PASSWORD,
  );
}

export function getLuminaAuth() {
  if (!luminaConfigured()) {
    throw new ApiProblem(503, "lumina_auth_unconfigured", "Lúmina account services need DATABASE_URL and BETTER_AUTH_SECRET.");
  }
  if (!cachedAuth) {
    const production = process.env.NODE_ENV === "production";
    const emailVerificationRequired = production || process.env.LUMINA_REQUIRE_EMAIL_VERIFICATION === "true";
    if (emailVerificationRequired && !luminaMailReady()) {
      throw new ApiProblem(503, "lumina_email_unconfigured", "Email verification is required before public accounts can be enabled.");
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 30_000 });
    const smtp = luminaMailReady() ? nodemailer.createTransport({
      host: process.env.LUMINA_SMTP_HOST,
      port: Number(process.env.LUMINA_SMTP_PORT ?? 587),
      secure: process.env.LUMINA_SMTP_SECURE === "true",
      auth: { user: process.env.LUMINA_SMTP_USER, pass: process.env.LUMINA_SMTP_PASSWORD },
    }) : null;

    cachedAuth = betterAuth({
      secret: process.env.BETTER_AUTH_SECRET!,
      // Keep the same-origin /api/auth path so session cookies remain private.
      basePath: "/api/auth",
      ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
      database: pool,
      user: { modelName: "lumina_user" },
      session: {
        modelName: "lumina_session",
        cookieCache: { enabled: true, maxAge: 60 },
        expiresIn: 60 * 60 * 24 * 14,
        updateAge: 60 * 60 * 24,
      },
      account: { modelName: "lumina_account" },
      verification: { modelName: "lumina_verification" },
      rateLimit: { enabled: true, storage: "database", modelName: "lumina_auth_rate_limit" },
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
        requireEmailVerification: emailVerificationRequired,
      },
      emailVerification: {
        sendOnSignUp: emailVerificationRequired,
        sendVerificationEmail: async ({ user, url }) => {
          if (!smtp) throw new Error("Email delivery is not configured.");
          await smtp.sendMail({
            from: process.env.LUMINA_SMTP_FROM,
            to: user.email,
            subject: "Verify your Lúmina account",
            text: "Verify your Lúmina account using this secure link:\n\n" + url + "\n\nIf you did not request this, ignore the message.",
          });
        },
      },
      trustedOrigins: (process.env.LUMINA_AUTH_TRUSTED_ORIGINS ?? "")
        .split(",").map((value) => value.trim()).filter(Boolean),
      advanced: {
        useSecureCookies: production,
      },
    });
  }
  return cachedAuth;
}
