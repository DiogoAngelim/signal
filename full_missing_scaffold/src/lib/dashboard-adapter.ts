export class DashboardAdapter {
  static async getDashboardData() {
    return {
      portfolio: { totalValue: 0, dailyPnL: 0, positions: [] },
      metrics: { sharpeRatio: 0, winRate: 0, profitFactor: 0 },
      signals: [],
      positions: [],
      orders: [],
      risk: { exposure: 0, allocation: 0 },
      market: { status: "open" },
    };
  }
}