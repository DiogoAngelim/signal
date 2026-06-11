import { spawn } from "node:child_process";
import type { StockQuote } from "./stock-data";

type SignalEmailProvider = "resend" | "sendmail" | "smtp";
type SignalEmailFailureReason =
  | "disabled"
  | "failed"
  | "missing-provider"
  | "not-actionable";

type TransportMessage = {
  from: string;
  html?: string;
  replyTo?: string;
  subject: string;
  text: string;
  to: string;
};

type SignalEmailScope = {
  scopeCode: string;
  scopeType: string;
};

export type SignalEmailEvent = {
  emittedAt?: string;
  id?: string;
  quote: StockQuote;
  scope: SignalEmailScope;
};

export type SignalEmailDeliveryResult = {
  error?: string;
  provider?: SignalEmailProvider;
  reason?: SignalEmailFailureReason;
  sent: boolean;
  signalAction?: StockQuote["signalAction"];
  symbol?: string;
};

type NodemailerTransport = {
  close?: () => void;
  sendMail: (message: Record<string, unknown>) => Promise<unknown>;
};

type NodemailerModule = {
  createTransport: (options: Record<string, unknown>) => NodemailerTransport;
};

const DEFAULT_SIGNAL_EMAIL_TO = "diogoangelim@gmail.com";
const DEFAULT_SIGNAL_EMAIL_FROM = "Signal Alerts <signals@localhost>";
const DEFAULT_RESEND_EMAIL_FROM = "Signal Alerts <onboarding@resend.dev>";
const RESEND_EMAIL_URL = "https://api.resend.com/emails";

let nodemailerModulePromise: Promise<NodemailerModule> | null = null;
let disabledWarningLogged = false;
let missingProviderWarningLogged = false;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function signalEmailEnabled(): boolean {
  return parseBoolean(
    readEnv("SIGNAL_EMAIL_ENABLED"),
    process.env.NODE_ENV !== "test",
  );
}

function signalEmailRecipients(): string {
  return (readEnv("SIGNAL_EMAIL_TO") ?? DEFAULT_SIGNAL_EMAIL_TO)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function signalEmailFrom(provider?: SignalEmailProvider): string {
  return (
    readEnv("SIGNAL_EMAIL_FROM") ??
    readEnv("EMAIL_FROM") ??
    readEnv("SMTP_FROM") ??
    (provider === "resend" ? DEFAULT_RESEND_EMAIL_FROM : undefined) ??
    DEFAULT_SIGNAL_EMAIL_FROM
  );
}

function resolveProvider(): SignalEmailProvider | null {
  const configured = readEnv("SIGNAL_EMAIL_PROVIDER")?.toLowerCase();
  if (
    configured === "resend" ||
    configured === "sendmail" ||
    configured === "smtp"
  ) {
    return configured;
  }

  if (readEnv("RESEND_API_KEY")) return "resend";
  if (readEnv("SMTP_HOST")) return "smtp";
  if (!process.env.VERCEL) return "sendmail";
  return null;
}

function isBuySellSignal(quote: StockQuote): boolean {
  return quote.signalAction === "Buy" || quote.signalAction === "Sell";
}

function formatNumber(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function formatPercent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value)
    ? "n/a"
    : `${formatNumber(value, 2)}%`;
}

function formatSignedPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 2)}%`;
}

function formatPrice(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return formatNumber(value, value > 0 && value < 1 ? 8 : 2);
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actionTheme(action: string) {
  if (action === "Sell") {
    return {
      accent: "#dc2626",
      background: "#fff1f2",
      border: "#fecdd3",
      label: "Risk-off signal",
      soft: "#7f1d1d",
      text: "The model is flagging elevated downside or deterioration. Treat this as a prompt to review exposure, stops, and whether the position still earns its risk.",
    };
  }

  return {
    accent: "#059669",
    background: "#ecfdf5",
    border: "#a7f3d0",
    label: "Constructive signal",
    soft: "#064e3b",
    text: "The model is seeing enough strength in the setup to warrant a closer entry or allocation review. Confirm liquidity, sizing, and portfolio fit before acting.",
  };
}

function buildSignalInterpretation(quote: StockQuote): string {
  const action = quote.signalAction ?? "Signal";
  const change = quote.changePercent;
  const confidence = quote.signalConfidence;
  const confidenceText =
    confidence !== undefined && Number.isFinite(confidence)
      ? `${formatNumber(confidence, 0)}% confidence`
      : "available confidence";
  const moveText =
    change !== undefined && Number.isFinite(change)
      ? `with a ${formatSignedPercent(change)} latest move`
      : "with the latest market data";

  if (action === "Sell") {
    return `This Sell signal was emitted ${moveText}. At ${confidenceText}, the system is asking you to reduce complacency: review downside protection, position size, and whether the original thesis is still intact.`;
  }

  return `This Buy signal was emitted ${moveText}. At ${confidenceText}, the system is asking you to review the setup for a possible entry or add, while still checking liquidity, risk, and sizing discipline.`;
}

function detailLine(label: string, value: string): string {
  return `${label}: ${value}`;
}

function htmlMetric(label: string, value: string): string {
  return `
    <td style="width: 50%; padding: 8px;">
      <div style="border: 1px solid #d8e0dd; border-radius: 10px; padding: 14px 16px; background: #ffffff;">
        <div style="font-size: 11px; line-height: 16px; text-transform: uppercase; letter-spacing: 0.06em; color: #64736d;">${escapeHtml(label)}</div>
        <div style="font-size: 20px; line-height: 28px; font-weight: 700; color: #18231f;">${escapeHtml(value)}</div>
      </div>
    </td>
  `;
}

function htmlDetail(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 8px 0; color: #64736d; font-size: 13px; line-height: 18px;">${escapeHtml(label)}</td>
      <td style="padding: 8px 0; color: #18231f; font-size: 13px; line-height: 18px; font-weight: 600; text-align: right;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function buildSignalEmailHtml(event: SignalEmailEvent): string {
  const { quote, scope } = event;
  const action = quote.signalAction ?? "Signal";
  const theme = actionTheme(action);
  const confidence =
    quote.signalConfidence === undefined
      ? "n/a"
      : `${formatNumber(quote.signalConfidence, 0)}%`;
  const emittedAt =
    quote.signalEmittedAt ?? event.emittedAt ?? new Date().toISOString();
  const formattedTime = formatTimestamp(emittedAt);
  const interpretation = buildSignalInterpretation(quote);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(action)} signal for ${escapeHtml(quote.symbol)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f4f7f6; font-family: Arial, Helvetica, sans-serif; color: #18231f;">
    <div style="display: none; overflow: hidden; line-height: 1px; opacity: 0; max-height: 0; max-width: 0;">
      ${escapeHtml(action)} signal for ${escapeHtml(quote.symbol)} at ${escapeHtml(confidence)} confidence.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f4f7f6; padding: 28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background: #ffffff; border: 1px solid #dbe5e1; border-radius: 16px; overflow: hidden;">
            <tr>
              <td style="height: 6px; background: ${theme.accent};"></td>
            </tr>
            <tr>
              <td style="padding: 28px 28px 14px;">
                <div style="font-size: 12px; line-height: 18px; text-transform: uppercase; letter-spacing: 0.08em; color: #64736d; font-weight: 700;">Signal Markets Alert</div>
                <h1 style="margin: 10px 0 8px; font-size: 30px; line-height: 36px; color: #18231f;">${escapeHtml(action)} signal for ${escapeHtml(quote.symbol)}</h1>
                <div style="display: inline-block; padding: 7px 11px; border-radius: 999px; color: ${theme.soft}; background: ${theme.background}; border: 1px solid ${theme.border}; font-size: 13px; line-height: 18px; font-weight: 700;">
                  ${escapeHtml(theme.label)} - ${escapeHtml(confidence)} confidence
                </div>
                <p style="margin: 18px 0 0; color: #40504a; font-size: 15px; line-height: 23px;">${escapeHtml(theme.text)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 20px 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    ${htmlMetric("Price", formatPrice(quote.price))}
                    ${htmlMetric("Latest move", formatSignedPercent(quote.changePercent))}
                  </tr>
                  <tr>
                    ${htmlMetric("Entry price", formatPrice(quote.signalEntryPrice))}
                    ${htmlMetric("Signal return", formatSignedPercent(quote.signalReturnPercent))}
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 28px 0;">
                <div style="border-left: 4px solid ${theme.accent}; background: #f8fbfa; padding: 16px 18px; border-radius: 10px;">
                  <div style="font-size: 13px; line-height: 18px; color: #64736d; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;">Interpretation</div>
                  <p style="margin: 7px 0 0; color: #283631; font-size: 15px; line-height: 24px;">${escapeHtml(interpretation)}</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 22px 28px 0;">
                <h2 style="margin: 0 0 8px; font-size: 16px; line-height: 22px; color: #18231f;">Why this matters</h2>
                <p style="margin: 0; color: #40504a; font-size: 14px; line-height: 22px;">${escapeHtml(quote.summary || "No summary was provided for this signal.")}</p>
                <p style="margin: 10px 0 0; color: #40504a; font-size: 14px; line-height: 22px;">${escapeHtml(quote.impact || "No impact note was provided for this signal.")}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 22px 28px 4px;">
                <h2 style="margin: 0 0 8px; font-size: 16px; line-height: 22px; color: #18231f;">Signal details</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e5ece9;">
                  ${htmlDetail("Emitted", formattedTime)}
                  ${htmlDetail("Source", quote.signalSource ?? "n/a")}
                  ${htmlDetail("Status", quote.status ?? "n/a")}
                  ${htmlDetail("Scope", `${scope.scopeType}:${scope.scopeCode}`)}
                  ${event.id ? htmlDetail("Event ID", event.id) : ""}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 28px 30px;">
                <div style="border-radius: 10px; background: #f4f7f6; padding: 14px 16px; color: #64736d; font-size: 12px; line-height: 18px;">
                  This alert is informational and should be reviewed alongside portfolio exposure, liquidity, and your own risk rules before any trade is placed.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildSignalEmail(
  event: SignalEmailEvent,
  provider?: SignalEmailProvider,
): TransportMessage {
  const { quote, scope } = event;
  const action = quote.signalAction ?? "Signal";
  const confidence =
    quote.signalConfidence === undefined
      ? "n/a"
      : `${formatNumber(quote.signalConfidence, 0)}%`;
  const emittedAt =
    quote.signalEmittedAt ?? event.emittedAt ?? new Date().toISOString();
  const subject = `[${action}] ${quote.symbol} signal ${confidence}`;
  const interpretation = buildSignalInterpretation(quote);

  const lines = [
    `${action} signal for ${quote.symbol}`,
    "",
    "Interpretation:",
    interpretation,
    "",
    "Key numbers:",
    detailLine("Confidence", confidence),
    detailLine("Price", formatPrice(quote.price)),
    detailLine("Latest move", formatSignedPercent(quote.changePercent)),
    detailLine("Entry price", formatPrice(quote.signalEntryPrice)),
    detailLine("Signal return", formatSignedPercent(quote.signalReturnPercent)),
    "",
    "Why this matters:",
    quote.summary || "n/a",
    "",
    "Impact:",
    quote.impact || "n/a",
    "",
    "Signal details:",
    detailLine("Action", action),
    detailLine("Symbol", quote.symbol),
    detailLine("Scope", `${scope.scopeType}:${scope.scopeCode}`),
    detailLine("Source", quote.signalSource ?? "n/a"),
    detailLine("Emitted", formatTimestamp(emittedAt)),
    detailLine("Status", quote.status ?? "n/a"),
    event.id ? detailLine("Event ID", event.id) : null,
    "",
    "Risk note:",
    "This alert is informational and should be reviewed alongside portfolio exposure, liquidity, and your own risk rules before any trade is placed.",
  ].filter((line): line is string => line !== null);

  return {
    from: signalEmailFrom(provider),
    html: buildSignalEmailHtml(event),
    replyTo: readEnv("SIGNAL_EMAIL_REPLY_TO"),
    subject,
    text: lines.join("\n"),
    to: signalEmailRecipients(),
  };
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function renderSendmailMessage(message: TransportMessage): string {
  const headers = [
    `To: ${sanitizeHeader(message.to)}`,
    `From: ${sanitizeHeader(message.from)}`,
    message.replyTo ? `Reply-To: ${sanitizeHeader(message.replyTo)}` : null,
    `Subject: ${sanitizeHeader(message.subject)}`,
    message.html
      ? "Content-Type: text/html; charset=UTF-8"
      : "Content-Type: text/plain; charset=UTF-8",
  ].filter((line): line is string => line !== null);

  return `${headers.join("\n")}\n\n${message.html ?? message.text}\n`;
}

async function sendWithResend(message: TransportMessage): Promise<void> {
  const apiKey = readEnv("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is required for SIGNAL_EMAIL_PROVIDER=resend",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    parsePositiveNumber(readEnv("SIGNAL_EMAIL_TIMEOUT_MS"), 10_000),
  );

  try {
    const response = await fetch(RESEND_EMAIL_URL, {
      body: JSON.stringify({
        from: message.from,
        html: message.html,
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
        to: message.to
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Resend email failed with ${response.status}: ${body.slice(0, 250)}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWithSendmail(message: TransportMessage): Promise<void> {
  const sendmailPath = readEnv("SENDMAIL_PATH") ?? "/usr/sbin/sendmail";
  const timeoutMs = parsePositiveNumber(
    readEnv("SIGNAL_EMAIL_TIMEOUT_MS"),
    10_000,
  );
  const rawMessage = renderSendmailMessage(message);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(sendmailPath, ["-t"]);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`sendmail timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`sendmail exited with code ${code ?? "unknown"}`));
    });

    child.stdin.end(rawMessage);
  });
}

async function loadNodemailer(): Promise<NodemailerModule> {
  if (!nodemailerModulePromise) {
    nodemailerModulePromise = import("nodemailer").then((module) => {
      const candidate = module as { default?: NodemailerModule };
      return (candidate.default ?? module) as NodemailerModule;
    });
  }
  return nodemailerModulePromise;
}

async function sendWithSmtp(message: TransportMessage): Promise<void> {
  const host = readEnv("SMTP_HOST");
  if (!host) {
    throw new Error("SMTP_HOST is required for SIGNAL_EMAIL_PROVIDER=smtp");
  }

  const secure = parseBoolean(readEnv("SMTP_SECURE"), false);
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const timeoutMs = parsePositiveNumber(
    readEnv("SIGNAL_EMAIL_TIMEOUT_MS"),
    10_000,
  );
  const transport = (await loadNodemailer()).createTransport({
    auth: user && pass ? { pass, user } : undefined,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    host,
    port: parsePositiveNumber(readEnv("SMTP_PORT"), secure ? 465 : 587),
    secure,
    socketTimeout: timeoutMs,
  });

  try {
    await transport.sendMail({
      from: message.from,
      html: message.html,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      to: message.to,
    });
  } finally {
    transport.close?.();
  }
}

async function sendSignalNotificationEmail(
  event: SignalEmailEvent,
): Promise<SignalEmailDeliveryResult> {
  if (!isBuySellSignal(event.quote)) {
    return {
      reason: "not-actionable",
      sent: false,
      signalAction: event.quote.signalAction,
      symbol: event.quote.symbol,
    };
  }

  if (!signalEmailEnabled()) {
    if (!disabledWarningLogged) {
      disabledWarningLogged = true;
      console.info("Signal email notifications are disabled");
    }
    return {
      reason: "disabled",
      sent: false,
      signalAction: event.quote.signalAction,
      symbol: event.quote.symbol,
    };
  }

  const provider = resolveProvider();
  if (!provider) {
    if (!missingProviderWarningLogged) {
      missingProviderWarningLogged = true;
      console.warn(
        "Signal email notifications need RESEND_API_KEY, SMTP_HOST, or SIGNAL_EMAIL_PROVIDER=sendmail",
      );
    }
    return {
      error:
        "Set RESEND_API_KEY or SMTP_HOST on the Vercel project to send signal emails.",
      reason: "missing-provider",
      sent: false,
      signalAction: event.quote.signalAction,
      symbol: event.quote.symbol,
    };
  }

  const message = buildSignalEmail(event, provider);
  try {
    if (provider === "resend") {
      await sendWithResend(message);
    } else if (provider === "smtp") {
      await sendWithSmtp(message);
    } else {
      await sendWithSendmail(message);
    }
    return {
      provider,
      sent: true,
      signalAction: event.quote.signalAction,
      symbol: event.quote.symbol,
    };
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Email send failed";
    console.error("Signal email notification failed", {
      error: messageText,
      provider,
      signalAction: event.quote.signalAction,
      symbol: event.quote.symbol,
    });
    return {
      error: messageText,
      provider,
      reason: "failed",
      sent: false,
      signalAction: event.quote.signalAction,
      symbol: event.quote.symbol,
    };
  }
}

export async function sendSignalNotificationEmails(
  events: SignalEmailEvent[],
): Promise<SignalEmailDeliveryResult[]> {
  const actionableEvents = events.filter((event) =>
    isBuySellSignal(event.quote),
  );
  if (!actionableEvents.length) return [];

  const results = await Promise.all(
    actionableEvents.map((event) => sendSignalNotificationEmail(event)),
  );
  const sentCount = results.filter((result) => result.sent).length;

  if (sentCount > 0) {
    console.info("Signal email notifications sent", { count: sentCount });
  }

  return results;
}

export async function sendSignalNotificationTestEmail(
  input?: Partial<StockQuote> & { scopeCode?: string; scopeType?: string },
): Promise<SignalEmailDeliveryResult> {
  const symbol = (input?.symbol ?? "VERCEL-TEST").trim().toUpperCase();
  const price = Number(input?.price ?? 123.45);
  const entryPrice = Number(input?.signalEntryPrice ?? 120);
  const now = new Date().toISOString();

  return sendSignalNotificationEmail({
    id: `test:${now}`,
    quote: {
      symbol,
      price,
      bid: Number(input?.bid ?? price),
      ask: Number(input?.ask ?? price),
      changePercent: Number(input?.changePercent ?? 2.88),
      status: input?.status ?? "Rising",
      high52: Number(input?.high52 ?? price),
      low52: Number(input?.low52 ?? entryPrice),
      history: input?.history ?? [entryPrice, price],
      summary:
        input?.summary ??
        "Vercel-originated test signal email for Buy/Sell notifications.",
      impact:
        input?.impact ??
        "This is a delivery test only; no trading action is required.",
      cap: input?.cap,
      peRatio: input?.peRatio,
      signalAction: input?.signalAction ?? "Buy",
      signalConfidence: Number(input?.signalConfidence ?? 88),
      signalEmittedAt: input?.signalEmittedAt ?? now,
      signalEntryPrice: entryPrice,
      signalReturnPercent: Number(
        (((price - entryPrice) / entryPrice) * 100).toFixed(2),
      ),
      signalSource: input?.signalSource ?? "heuristic",
    },
    scope: {
      scopeCode: input?.scopeCode ?? "VERCEL",
      scopeType: input?.scopeType ?? "test",
    },
  });
}
