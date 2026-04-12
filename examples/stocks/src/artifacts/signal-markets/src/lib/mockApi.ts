import { MOCK_PORTFOLIO, MOCK_STOCKS, MOCK_UPDATES } from "./mockData";

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchPortfolio() {
  await delay(200);
  return MOCK_PORTFOLIO;
}

export async function fetchStocks() {
  await delay(300);
  return MOCK_STOCKS;
}

export async function fetchStock(ticker: string) {
  await delay(400);
  const stock = MOCK_STOCKS.find(s => s.ticker === ticker);
  if (!stock) throw new Error("Stock not found");
  return stock;
}

// Simulate a websocket connection by returning a random update message periodically
export function subscribeToUpdates(callback: (msg: string) => void) {
  const interval = setInterval(() => {
    const msg = MOCK_UPDATES[Math.floor(Math.random() * MOCK_UPDATES.length)];
    callback(msg);
  }, 8000); // Every 8 seconds
  
  return () => clearInterval(interval);
}