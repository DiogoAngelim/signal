import { NubankConnector, type NubankSessionAdapter } from "../connectors.js";
import { jsonResponse } from "./http.js";
import { loadLocalNubankStatementData } from "./local-nubank-statement.js";
import { createNubankApiSessionAdapter } from "./nubank-api-adapter.js";

export type NubankConnectApiResult =
  | {
      ok: true;
      connection: Awaited<ReturnType<NubankConnector["connect"]>>["connection"];
      balances: Awaited<ReturnType<NubankConnector["fetchBalances"]>>;
      rawTransactions: Awaited<
        ReturnType<NubankConnector["fetchTransactions"]>
      >;
      message?: string;
    }
  | {
      ok: false;
      message: string;
    };

export type SafeNubankAttempt = {
  status: "success" | "failed";
  statusCode: number;
  message: string;
  balanceCount?: number;
  transactionCount?: number;
  updatedAt: string;
};

let lastNubankAttempt: SafeNubankAttempt | undefined;

export async function handleLiquidityManagerApiRequest(
  request: Request,
  options: {
    nubankAdapter?: NubankSessionAdapter;
    encryptionSecret?: string;
    localStatementPath?: string;
    localStatementManifestPath?: string;
    now?: () => Date;
  } = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.pathname === "/api/local-nubank-statement" &&
    request.method === "GET"
  ) {
    const result = loadLocalNubankStatementData({
      userId: url.searchParams.get("userId") ?? undefined,
      now: options.now?.() ?? new Date(),
      statementPath: options.localStatementPath,
      manifestPath: options.localStatementManifestPath,
    });
    return jsonResponse(result, { status: result.ok ? 200 : 404 });
  }
  if (url.pathname === "/api/nubank/connect" && request.method === "POST") {
    return handleNubankConnect(request, options);
  }
  if (url.pathname === "/api/nubank/last-attempt" && request.method === "GET") {
    return jsonResponse({
      ok: Boolean(lastNubankAttempt),
      attempt: lastNubankAttempt,
      message: lastNubankAttempt
        ? "Last Nubank attempt is available."
        : "No Nubank sync attempt has run yet.",
    });
  }

  return jsonResponse(
    { ok: false, message: "Route not found." },
    { status: 404 },
  );
}

async function handleNubankConnect(
  request: Request,
  options: {
    nubankAdapter?: NubankSessionAdapter;
    encryptionSecret?: string;
    now?: () => Date;
  },
): Promise<Response> {
  const body = await safeJson(request);
  const cpf = typeof body?.cpf === "string" ? body.cpf : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const authCode = typeof body?.authCode === "string" ? body.authCode : "";
  const userId = typeof body?.userId === "string" ? body.userId : "demo-user";

  if (!cpf.trim()) {
    rememberNubankAttempt({
      status: "failed",
      statusCode: 400,
      message: "Enter CPF to request a QR-authorized Nubank session.",
    });
    return jsonResponse(
      {
        ok: false,
        message: "Enter CPF to request a QR-authorized Nubank session.",
      } satisfies NubankConnectApiResult,
      { status: 400 },
    );
  }

  const connector = new NubankConnector({
    adapter: options.nubankAdapter ?? createNubankApiSessionAdapter(),
    encryptionSecret: options.encryptionSecret,
    now: options.now,
  });
  const result = await connector.connect({ userId, cpf, password, authCode });

  if (!result.ok) {
    const message =
      result.message ??
      "Could not connect to Nubank automatically. Upload a Nubank statement instead.";
    rememberNubankAttempt({
      status: "failed",
      statusCode: 502,
      message,
    });
    return jsonResponse(
      {
        ok: false,
        message,
      } satisfies NubankConnectApiResult,
      { status: 502 },
    );
  }

  const balances = await connector.fetchBalances(result.connection.id);
  const rawTransactions = await connector.fetchTransactions(
    result.connection.id,
  );
  rememberNubankAttempt({
    status: "success",
    statusCode: 200,
    message:
      result.message ??
      "Nubank transactions imported through the QR-authorized connector.",
    balanceCount: balances.length,
    transactionCount: rawTransactions.length,
  });

  return jsonResponse({
    ok: true,
    connection: result.connection,
    balances,
    rawTransactions,
    message: result.message,
  } satisfies NubankConnectApiResult);
}

function rememberNubankAttempt(
  attempt: Omit<SafeNubankAttempt, "updatedAt">,
): void {
  lastNubankAttempt = {
    ...attempt,
    updatedAt: new Date().toISOString(),
  };
}

async function safeJson(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = await request.json();
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
