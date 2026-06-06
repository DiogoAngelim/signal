import type {
  BinanceFilter,
  BinanceSymbolInfo,
  NormalizedOrderRequest,
  OrderValidationResult,
} from "./types";

export function normalizeQuantity(quantity: number, symbolInfo: BinanceSymbolInfo, marketOrder = false) {
  const lot = filterFor(symbolInfo, marketOrder ? "MARKET_LOT_SIZE" : "LOT_SIZE") ??
    filterFor(symbolInfo, "LOT_SIZE");
  if (!lot || !("stepSize" in lot)) return quantity;
  return floorToStep(quantity, Number(lot.stepSize));
}

export function normalizePrice(price: number, symbolInfo: BinanceSymbolInfo) {
  const priceFilter = filterFor(symbolInfo, "PRICE_FILTER");
  if (!priceFilter || !("tickSize" in priceFilter)) return price;
  return floorToStep(price, Number(priceFilter.tickSize));
}

export function minNotionalFor(symbolInfo: BinanceSymbolInfo) {
  const minNotional = filterFor(symbolInfo, "MIN_NOTIONAL");
  const notional = filterFor(symbolInfo, "NOTIONAL");
  const values = [
    minNotional && "minNotional" in minNotional ? Number(minNotional.minNotional) : 0,
    notional && "minNotional" in notional ? Number(notional.minNotional ?? 0) : 0,
  ].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

export function validateOrderAgainstExchangeFilters(
  order: NormalizedOrderRequest,
  symbolInfo: BinanceSymbolInfo | null,
  options: {
    openOrderCount?: number;
    currentPositionQty?: number;
  } = {},
): OrderValidationResult {
  const reasons: string[] = [];
  if (!symbolInfo) return { ok: false, reasons: ["symbol_not_found"] };
  if (symbolInfo.status && symbolInfo.status !== "TRADING") reasons.push("symbol_not_trading");

  const marketOrder = order.type === "MARKET";
  const normalized: NormalizedOrderRequest = {
    ...order,
    quantity: normalizeQuantity(order.quantity, symbolInfo, marketOrder),
    price: order.price == null ? undefined : normalizePrice(order.price, symbolInfo),
  };
  normalized.notional = normalized.price
    ? normalized.quantity * normalized.price
    : order.notional;

  validateLotSize(normalized, symbolInfo, marketOrder, reasons);
  validatePrice(normalized, symbolInfo, reasons);
  validateNotional(normalized, symbolInfo, reasons);
  validateMaxOrders(symbolInfo, options.openOrderCount ?? 0, reasons);
  validateMaxPosition(normalized, symbolInfo, options.currentPositionQty ?? 0, reasons);
  validateSellPosition(normalized, options.currentPositionQty ?? 0, reasons);

  return {
    ok: reasons.length === 0,
    normalized,
    reasons,
  };
}

function validateLotSize(
  order: NormalizedOrderRequest,
  symbolInfo: BinanceSymbolInfo,
  marketOrder: boolean,
  reasons: string[],
) {
  const lot = filterFor(symbolInfo, marketOrder ? "MARKET_LOT_SIZE" : "LOT_SIZE") ??
    filterFor(symbolInfo, "LOT_SIZE");
  if (!lot || !("minQty" in lot)) return;
  const minQty = Number(lot.minQty);
  const maxQty = Number(lot.maxQty);
  const stepSize = Number(lot.stepSize);
  if (order.quantity < minQty) reasons.push("quantity_below_min");
  if (Number.isFinite(maxQty) && maxQty > 0 && order.quantity > maxQty) reasons.push("quantity_above_max");
  if (stepSize > 0 && !isStepAligned(order.quantity, stepSize)) reasons.push("quantity_step_mismatch");
}

function validatePrice(order: NormalizedOrderRequest, symbolInfo: BinanceSymbolInfo, reasons: string[]) {
  if (order.type === "MARKET") return;
  const priceFilter = filterFor(symbolInfo, "PRICE_FILTER");
  if (!priceFilter || !("minPrice" in priceFilter)) return;
  const price = order.price ?? 0;
  const minPrice = Number(priceFilter.minPrice);
  const maxPrice = Number(priceFilter.maxPrice);
  const tickSize = Number(priceFilter.tickSize);
  if (price <= 0) reasons.push("price_required");
  if (price < minPrice) reasons.push("price_below_min");
  if (Number.isFinite(maxPrice) && maxPrice > 0 && price > maxPrice) reasons.push("price_above_max");
  if (tickSize > 0 && !isStepAligned(price, tickSize)) reasons.push("price_tick_mismatch");
}

function validateNotional(order: NormalizedOrderRequest, symbolInfo: BinanceSymbolInfo, reasons: string[]) {
  const notional = order.notional;
  const minNotional = minNotionalFor(symbolInfo);
  const notionalFilter = filterFor(symbolInfo, "NOTIONAL");
  const maxNotional = notionalFilter && "maxNotional" in notionalFilter ? Number(notionalFilter.maxNotional ?? 0) : 0;
  if (minNotional > 0 && notional < minNotional) reasons.push("notional_below_min");
  if (maxNotional > 0 && notional > maxNotional) reasons.push("notional_above_max");
}

function validateMaxOrders(symbolInfo: BinanceSymbolInfo, openOrderCount: number, reasons: string[]) {
  const filter = filterFor(symbolInfo, "MAX_NUM_ORDERS");
  if (!filter || !("maxNumOrders" in filter)) return;
  if (openOrderCount >= Number(filter.maxNumOrders)) reasons.push("max_num_orders_exceeded");
}

function validateSellPosition(
  order: NormalizedOrderRequest,
  currentPositionQty: number,
  reasons: string[],
) {
  if (order.side !== "SELL") return;
  if (order.quantity > currentPositionQty + 1e-12) {
    reasons.push("insufficient_position");
  }
}

function validateMaxPosition(
  order: NormalizedOrderRequest,
  symbolInfo: BinanceSymbolInfo,
  currentPositionQty: number,
  reasons: string[],
) {
  const filter = filterFor(symbolInfo, "MAX_POSITION");
  if (!filter || !("maxPosition" in filter) || order.side !== "BUY") return;
  const maxPosition = Number(filter.maxPosition);
  if (maxPosition > 0 && currentPositionQty + order.quantity > maxPosition) {
    reasons.push("max_position_exceeded");
  }
}

function filterFor<T extends BinanceFilter["filterType"]>(
  symbolInfo: BinanceSymbolInfo,
  filterType: T,
) {
  return symbolInfo.filters.find((filter) => filter.filterType === filterType);
}

function floorToStep(value: number, step: number) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const precision = decimalPlaces(step);
  const scale = 10 ** precision;
  const scaledValue = Math.floor(value * scale + 1e-9);
  const scaledStep = Math.max(1, Math.round(step * scale));
  const floored = Math.floor(scaledValue / scaledStep) * scaledStep;
  return Number((floored / scale).toFixed(precision));
}

function isStepAligned(value: number, step: number) {
  if (step <= 0) return true;
  return Math.abs(value - floorToStep(value, step)) < step / 1_000_000;
}

function decimalPlaces(value: number) {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  const decimals = text.split(".")[1];
  return decimals ? decimals.length : 0;
}
