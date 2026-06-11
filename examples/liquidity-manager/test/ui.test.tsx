import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App, ConnectScreen, PurchaseValidator } from "../src/frontend/App.js";
import {
  calculateCashflowProfile,
  createPurchaseDecision,
  createSampleFinancialDataset,
  normalizeRawTransactions,
} from "../src/index.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");

describe("Liquidity Manager UI", () => {
  it("starts with purchase validation, not a generic finance dashboard", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Is this purchase justifiable?");
    expect(html).toContain("Validate purchase");
    expect(html).toContain("Sample cashflow data is ready");
    expect(html).toContain("Connect");
    expect(html).not.toContain("Investment advice");
    expect(html).not.toContain("Pix");
  });

  it("keeps Connect focused on statement upload only", () => {
    const html = renderToStaticMarkup(
      <ConnectScreen onUpload={() => undefined} />,
    );

    expect(html).toContain("Upload statement");
    expect(html).not.toContain("Try with sample data");
    expect(html).not.toContain("Open Finance");
    expect(html).not.toContain("Connect Nubank with QR");
    expect(html).not.toContain("CPF");
    expect(html).not.toContain("Password");
    expect(html).not.toContain("QR id");
  });

  it("renders verdict, score, confidence, before/after metrics, and safer alternatives", () => {
    const dataset = createSampleFinancialDataset({
      userId: "u1",
      connectionId: "sample-1",
      now: NOW,
    });
    const normalized = normalizeRawTransactions({
      rawTransactions: dataset.transactions,
      userId: "u1",
      connectionId: "sample-1",
    });
    const profile = calculateCashflowProfile({
      userId: "u1",
      transactions: normalized,
      balances: dataset.balances,
      now: NOW,
    });
    const decision = createPurchaseDecision({
      input: {
        userId: "u1",
        amount: 14000,
        paymentMethod: "cash",
        necessity: "optional",
      },
      profile,
      transactions: normalized,
      now: NOW,
    });

    const html = renderToStaticMarkup(
      <PurchaseValidator
        form={{
          amount: "14000",
          category: "Travel",
          paymentMethod: "cash",
          installments: "6",
          necessity: "optional",
        }}
        profile={profile}
        transactionCount={normalized.length}
        decision={decision}
        disabled={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
        onLoadSample={() => undefined}
      />,
    );

    expect(html).toContain("Score");
    expect(html).toContain("Confidence");
    expect(html).toContain("Current balance");
    expect(html).toContain("Runway");
    expect(html).toContain("90-day risk");
    expect(html).toMatch(/Reduce|Delay|Wait|Risky|Not justifiable/);
  });
});
