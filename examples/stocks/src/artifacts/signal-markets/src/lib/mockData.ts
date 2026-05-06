export type StockStatus = "Stable" | "Rising" | "Watch" | "Dip";

export interface StockData {
  ticker: string;
  name: string;
  country: string;
  price: number;
  changePercent: number;
  status: StockStatus;
  cap: string;
  high52: number;
  low52: number;
  peRatio?: number;
  history: number[];
  summary: string;
  impact: string;
}

export interface PortfolioData {
  totalValue: number;
  todayChangeDollar: number;
  todayChangePercent: number;
  marketStatus: "Open" | "Closed" | "Pre-market";
  overallSignal: string;
}

export const MOCK_PORTFOLIO: PortfolioData = {
  totalValue: 145280.5,
  todayChangeDollar: 1250.4,
  todayChangePercent: 0.86,
  marketStatus: "Open",
  overallSignal: "Mostly Stable",
};

// Generates a simple sparkline path array
function generateHistory(base: number, volatility: number = 0.05): number[] {
  let current = base;
  return Array.from({ length: 30 }, () => {
    const change = current * volatility * (Math.random() - 0.5);
    current += change;
    return current;
  });
}

export const MOCK_STOCKS: StockData[] = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    country: "United States",
    price: 201.45,
    changePercent: 1.8,
    status: "Stable",
    cap: "$3.02T",
    high52: 210.3,
    low52: 165.4,
    peRatio: 28.4,
    history: generateHistory(195, 0.02),
    summary: "Up 1.8% today — holding steady near recent highs.",
    impact:
      "Steady performance supports your tech core. No immediate action required.",
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corp.",
    country: "United States",
    price: 415.2,
    changePercent: 0.6,
    status: "Stable",
    cap: "$3.09T",
    high52: 430.82,
    low52: 312.4,
    peRatio: 35.2,
    history: generateHistory(410, 0.015),
    summary: "Up 0.6% today — quiet trading within its normal range.",
    impact: "Cloud revenue continues to anchor the price. A safe holding.",
  },
  {
    ticker: "TSLA",
    name: "Tesla Inc.",
    country: "United States",
    price: 162.8,
    changePercent: -3.2,
    status: "Watch",
    cap: "$519B",
    high52: 299.29,
    low52: 152.37,
    peRatio: 38.6,
    history: generateHistory(170, 0.04),
    summary:
      "Down 3.2% today — testing key support levels amid sector pressure.",
    impact: "Increased volatility. Keep an eye on it if it breaks below $160.",
  },
  {
    ticker: "PBR",
    name: "Petrobras",
    country: "Brazil",
    price: 14.9,
    changePercent: 2.1,
    status: "Rising",
    cap: "$94B",
    high52: 17.9,
    low52: 10.4,
    peRatio: 3.8,
    history: generateHistory(14, 0.03),
    summary:
      "Up 2.1% today — strong momentum following positive energy sector news.",
    impact: "Excellent dividend yield and upward price action. Solid hold.",
  },
  {
    ticker: "VALE",
    name: "Vale S.A.",
    country: "Brazil",
    price: 9.85,
    changePercent: -1.4,
    status: "Dip",
    cap: "$44B",
    high52: 16.2,
    low52: 9.5,
    peRatio: 5.2,
    history: generateHistory(10.5, 0.02),
    summary: "Down 1.4% today — soft commodity prices weighing on the stock.",
    impact:
      "Approaching annual lows. Consider if this aligns with your long-term thesis.",
  },
  {
    ticker: "SPY",
    name: "SPDR S&P 500 ETF",
    country: "United States",
    price: 552.3,
    changePercent: 0.4,
    status: "Stable",
    cap: "$520B",
    high52: 554.2,
    low52: 410.5,
    peRatio: 22.5,
    history: generateHistory(545, 0.01),
    summary: "Up 0.4% today — reflecting broader market calm.",
    impact: "The benchmark is healthy, keeping your diversified assets stable.",
  },
];

export const MOCK_UPDATES = [
  "Apple just crossed $200 per share.",
  "Market volume is slightly below average today.",
  "Energy sector is leading morning gains.",
  "Tesla experiencing increased retail activity.",
  "Market closes in 3 hours.",
  "S&P 500 touches new intra-day high.",
];
