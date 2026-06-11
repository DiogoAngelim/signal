import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleLiquidityManagerApiRequest } from "../src/api/handler.js";
import {
  createUnofficialNubankSessionAdapter,
  normalizeNubankFeed,
  resolveNubankFactory,
} from "../src/api/nubank-adapter.js";
import {
  createNubankApiSessionAdapter,
  normalizeNubankApiAccountTransactions,
  normalizeNubankApiCardTransactions,
} from "../src/api/nubank-api-adapter.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");

describe("Liquidity Manager local API", () => {
  it("loads cleaned local Nubank statement data when available", async () => {
    const dir = mkdtempSync(join(tmpdir(), "liquidity-local-statement-"));
    const statementPath = join(dir, "nubank-statements.csv");
    const manifestPath = join(dir, "nubank-statements-manifest.json");
    writeFileSync(
      statementPath,
      `Data,Valor,Identificador,Descrição
01/04/2026,100.00,nu-1,Transferência recebida pelo Pix
01/04/2026,-20.00,nu-2,Compra no débito`,
    );
    writeFileSync(
      manifestPath,
      JSON.stringify({
        currentBalance: 3906.91,
        balanceSource: "Unit-test override",
        interval: {
          firstMonth: "2026-04",
          lastMonth: "2026-04",
          monthCount: 1,
        },
        missingMonths: [],
        sourceFileCount: 1,
        uniqueFileCount: 1,
        removedDuplicateFileCount: 0,
        transactionRows: 2,
      }),
    );

    const response = await handleLiquidityManagerApiRequest(
      new Request("http://127.0.0.1/api/local-nubank-statement?userId=u1"),
      {
        localStatementPath: statementPath,
        localStatementManifestPath: manifestPath,
        now: () => NOW,
      },
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.connection.provider).toBe("nubank");
    expect(result.rawTransactions).toHaveLength(2);
    expect(result.balances[0]?.availableAmount).toBe(3906.91);
    expect(result.coverage.firstMonth).toBe("2026-04");
    expect(result.coverage.removedDuplicateFileCount).toBe(0);
  });

  it("connects to Nubank through a server-side adapter without returning the password or token", async () => {
    const response = await handleLiquidityManagerApiRequest(
      new Request("http://127.0.0.1/api/nubank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "u1",
          cpf: "123.456.789-09",
          password: "never-return-this",
          authCode: "qr-id-never-return-this",
        }),
      }),
      {
        now: () => NOW,
        encryptionSecret: "unit-test-secret",
        nubankAdapter: {
          async createSession() {
            return {
              sessionData: { token: "secret-token-value" },
              balances: [{ availableAmount: 9600 }],
              transactions: [
                {
                  id: "nu-1",
                  source: "nubank",
                  amount: 7200,
                  description: "Salary deposit",
                  date: new Date("2026-05-25T12:00:00.000Z"),
                },
              ],
            };
          },
        },
      },
    );

    const text = await response.text();
    const result = JSON.parse(text) as {
      ok: boolean;
      connection: { maskedCpf?: string; encryptedSessionData?: string };
      balances: Array<{ availableAmount: number }>;
      rawTransactions: Array<{ source: string }>;
    };

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.connection.maskedCpf).toBe("***.***.***-09");
    expect(result.connection.encryptedSessionData).toBeTruthy();
    expect(result.balances[0]?.availableAmount).toBe(9600);
    expect(result.rawTransactions[0]?.source).toBe("nubank");
    expect(text).not.toContain("never-return-this");
    expect(text).not.toContain("qr-id-never-return-this");
    expect(text).not.toContain("secret-token-value");
    expect(text).not.toContain("123.456.789-09");
  });

  it("requires CPF before calling the local Nubank route", async () => {
    const response = await handleLiquidityManagerApiRequest(
      new Request("http://127.0.0.1/api/nubank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: "", password: "" }),
      }),
    );
    const result = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(400);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("CPF");
  });

  it("authenticates with the GitHub nubank-api QR flow and normalizes account and card records", async () => {
    const authCalls: Array<{
      cpf: string;
      password: string;
      authCode: string;
    }> = [];
    const adapter = createNubankApiSessionAdapter({
      createClient: () => ({
        authState: {
          accessToken: "secret-auth-state",
          privateUrls: {},
          publicUrls: {},
        },
        auth: {
          authenticateWithQrCode: async (
            cpf: string,
            password: string,
            authCode: string,
          ) => {
            authCalls.push({ cpf, password, authCode });
          },
        },
        account: {
          getBalance: async () => 123456,
          getFeedPaginated: async () => ({
            items: [
              {
                id: "account-1",
                __typename: "PixTransferOutEvent",
                title: "Pix sent",
                detail: "R$ 35,00",
                postDate: "2026-05-10",
              },
              {
                id: "account-2",
                __typename: "TransferInEvent",
                title: "Transfer received",
                detail: "R$ 150,00",
                postDate: "2026-05-11",
              },
            ],
          }),
        },
        card: {
          getTransactions: async () => [
            {
              id: "card-1",
              category: "transaction",
              title: "Market",
              amount: 3210,
              time: "2026-05-12T12:00:00.000Z",
            },
          ],
          getPayments: async () => [
            {
              id: "payment-1",
              category: "payment",
              title: "Card payment",
              amount: 200000,
              time: "2026-05-13T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    const session = await adapter.createSession({
      cpf: "123.456.789-09",
      password: "temporary",
      authCode: "qr-auth-id",
    });

    expect(authCalls).toEqual([
      { cpf: "12345678909", password: "temporary", authCode: "qr-auth-id" },
    ]);
    expect(session.balances?.[0]?.availableAmount).toBe(1234.56);
    expect(
      session.transactions?.map((transaction) => transaction.amount),
    ).toEqual([-35, 150, -32.1, 2000]);
    expect(JSON.stringify(session.transactions)).not.toContain(
      "secret-auth-state",
    );
  });

  it("requires QR id or saved auth state for the GitHub nubank-api adapter", async () => {
    const adapter = createNubankApiSessionAdapter({
      createClient: () => ({
        auth: {
          authenticateWithQrCode: async () => undefined,
        },
      }),
    });

    await expect(
      adapter.createSession({ cpf: "12345678909", password: "temporary" }),
    ).rejects.toMatchObject({
      publicMessage: expect.stringContaining("QR authorization"),
    });
  });

  it("exposes only safe metadata for the last Nubank attempt", async () => {
    await handleLiquidityManagerApiRequest(
      new Request("http://127.0.0.1/api/nubank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "u1",
          cpf: "12345678909",
          password: "temporary",
        }),
      }),
      {
        nubankAdapter: createUnofficialNubankSessionAdapter({
          createClient: () => ({
            getLoginToken: async () => {
              throw new Error("raw upstream detail");
            },
            getWholeFeed: async () => [],
          }),
        }),
      },
    );

    const response = await handleLiquidityManagerApiRequest(
      new Request("http://127.0.0.1/api/nubank/last-attempt"),
    );
    const text = await response.text();
    const result = JSON.parse(text) as {
      ok: boolean;
      attempt: {
        status: string;
        statusCode: number;
        message: string;
        updatedAt: string;
      };
    };

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.attempt.status).toBe("failed");
    expect(result.attempt.statusCode).toBe(502);
    expect(result.attempt.message).toContain("Nubank login failed");
    expect(result.attempt.updatedAt).toBeTruthy();
    expect(text).not.toContain("temporary");
    expect(text).not.toContain("12345678909");
    expect(text).not.toContain("raw upstream detail");
  });

  it("returns a safe login failure message from the unofficial adapter", async () => {
    const response = await handleLiquidityManagerApiRequest(
      new Request("http://127.0.0.1/api/nubank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "u1",
          cpf: "12345678909",
          password: "temporary",
        }),
      }),
      {
        nubankAdapter: createUnofficialNubankSessionAdapter({
          createClient: () => ({
            getLoginToken: async () => {
              throw new Error("raw auth provider detail");
            },
            getWholeFeed: async () => [],
          }),
        }),
      },
    );
    const text = await response.text();
    const result = JSON.parse(text) as { ok: boolean; message: string };

    expect(response.status).toBe(502);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Nubank login failed");
    expect(result.message).toContain("Upload a Nubank statement instead");
    expect(text).not.toContain("raw auth provider detail");
    expect(text).not.toContain("temporary");
    expect(text).not.toContain("12345678909");
  });

  it("reports missing Nubank feed link separately from invalid credentials", async () => {
    const response = await handleLiquidityManagerApiRequest(
      new Request("http://127.0.0.1/api/nubank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "u1",
          cpf: "123.456.789-09",
          password: "temporary",
        }),
      }),
      {
        nubankAdapter: createUnofficialNubankSessionAdapter({
          createClient: () => ({
            getLoginToken: async ({ login }: { login: string }) => ({
              access_token: "token",
              login,
            }),
            getWholeFeed: async () => [],
          }),
        }),
      },
    );
    const text = await response.text();
    const result = JSON.parse(text) as { ok: boolean; message: string };

    expect(response.status).toBe(502);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("did not return a transaction feed link");
    expect(text).not.toContain("123.456.789-09");
    expect(text).not.toContain("temporary");
    expect(text).not.toContain("token");
  });

  it("normalizes common unofficial Nubank feed shapes", () => {
    const transactions = normalizeNubankFeed([
      {
        id: "feed-1",
        title: "Coffee",
        category: "transaction",
        amount: 1890,
        time: "2026-05-12T12:00:00.000Z",
      },
      {
        id: "feed-2",
        description: "Payment received",
        category: "payment",
        amount: 500000,
        date: "2026-05-25T12:00:00.000Z",
      },
    ]);

    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.amount).toBe(-18.9);
    expect(transactions[1]?.amount).toBe(5000);
  });

  it("normalizes nubank-api account and card transaction shapes", () => {
    expect(
      normalizeNubankApiAccountTransactions([
        {
          id: "account-1",
          __typename: "BillPaymentEvent",
          title: "Bill",
          detail: "R$ 82,40",
          postDate: "2026-05-14",
        },
      ])[0]?.amount,
    ).toBe(-82.4);

    expect(
      normalizeNubankApiCardTransactions([
        {
          id: "payment-1",
          category: "payment",
          title: "Payment",
          amount: 500000,
          time: "2026-05-15T12:00:00.000Z",
        },
      ])[0]?.amount,
    ).toBe(5000);
  });

  it("unwraps the old CommonJS Nubank package default export", () => {
    const factory = () => ({ ok: true });

    expect(resolveNubankFactory(factory)).toBe(factory);
    expect(resolveNubankFactory({ default: factory })).toBe(factory);
  });
});
