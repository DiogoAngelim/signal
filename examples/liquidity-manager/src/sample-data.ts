import type { BalanceSnapshot, RawTransaction } from "./models.js";

export type SampleFinancialDataset = {
  userId: string;
  connectionId: string;
  balances: BalanceSnapshot[];
  transactions: RawTransaction[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function createSampleFinancialDataset({
  userId = "demo-user",
  connectionId = "sample-connection",
  now = new Date("2026-06-03T12:00:00.000Z"),
}: {
  userId?: string;
  connectionId?: string;
  now?: Date;
} = {}): SampleFinancialDataset {
  const transactions: RawTransaction[] = [];

  for (let monthOffset = 6; monthOffset >= 0; monthOffset -= 1) {
    const base = shiftMonth(now, -monthOffset);
    transactions.push(
      raw(
        `salary-${monthOffset}`,
        "sample",
        7800,
        "Salary deposit",
        atDay(base, 25),
        "Income",
      ),
    );
    transactions.push(
      raw(
        `rent-${monthOffset}`,
        "sample",
        -2450,
        "Apartment rent",
        atDay(base, 3),
        "Housing",
      ),
    );
    transactions.push(
      raw(
        `utilities-${monthOffset}`,
        "sample",
        -360,
        "Electric and internet bill",
        atDay(base, 8),
        "Utilities",
      ),
    );
    transactions.push(
      raw(
        `health-${monthOffset}`,
        "sample",
        -420,
        "Health insurance",
        atDay(base, 11),
        "Health",
      ),
    );
    transactions.push(
      raw(
        `transport-pass-${monthOffset}`,
        "sample",
        -290,
        "Transit pass",
        atDay(base, 15),
        "Transport",
      ),
    );
  }

  for (let week = 0; week < 28; week += 1) {
    const date = new Date(now.getTime() - week * 7 * DAY_MS);
    transactions.push(
      raw(
        `groceries-${week}`,
        "sample",
        -360 - (week % 3) * 25,
        "Grocery market",
        date,
        "Groceries",
      ),
    );
    transactions.push(
      raw(
        `meal-${week}`,
        "sample",
        -95 - (week % 4) * 8,
        "Restaurant meal",
        addDays(date, 1),
        "Dining",
      ),
    );
    transactions.push(
      raw(
        `ride-${week}`,
        "sample",
        -46 - (week % 5) * 4,
        "Ride share",
        addDays(date, 2),
        "Transport",
      ),
    );
    transactions.push(
      raw(
        `pharmacy-${week}`,
        "sample",
        -34 - (week % 2) * 9,
        "Pharmacy",
        addDays(date, 3),
        "Health",
      ),
    );
  }

  transactions.push(
    raw(
      "tax-refund",
      "sample",
      1350,
      "Tax refund",
      new Date("2026-03-18T12:00:00.000Z"),
      "Refund",
    ),
  );
  transactions.push(
    raw(
      "course-reimbursement",
      "sample",
      800,
      "Training reimbursement",
      new Date("2026-05-09T12:00:00.000Z"),
      "Income",
    ),
  );
  transactions.push(
    raw(
      "laptop-repair",
      "sample",
      -680,
      "Laptop repair",
      new Date("2026-04-14T12:00:00.000Z"),
      "Work",
    ),
  );

  return {
    userId,
    connectionId,
    balances: [
      {
        id: "sample-balance-current",
        userId,
        connectionId,
        availableAmount: 23000,
        currency: "BRL",
        capturedAt: now,
      },
    ],
    transactions: transactions.sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    ),
  };
}

function raw(
  id: string,
  source: RawTransaction["source"],
  amount: number,
  description: string,
  date: Date,
  category: string,
): RawTransaction {
  return {
    id,
    source,
    amount,
    description,
    date,
    metadata: { category },
  };
}

function shiftMonth(date: Date, offset: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + offset);
  return next;
}

function atDay(date: Date, day: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day, 12, 0, 0),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
