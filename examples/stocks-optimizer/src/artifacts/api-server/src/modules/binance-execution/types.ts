export type ExecutionMode = "dry_run" | "testnet" | "live";

export type DecisionAction = "BUY" | "SELL" | "EXIT" | "HOLD";

export type BinanceOrderSide = "BUY" | "SELL";

export type BinanceOrderType = "LIMIT" | "LIMIT_MAKER" | "MARKET";

export type BinanceTimeInForce = "GTC" | "IOC" | "FOK";

export type BinanceExecutionDecision = {
  id: string;
  symbol: string;
  action: DecisionAction;
  confidence: number;
  trust: number;
  calibratedConfidence?: number;
  appSizePct: number;
  suggestedNotional?: number;
  expectedMovePct?: number;
  price?: number;
  limitPrice?: number;
  orderType?: BinanceOrderType;
  exitQuantity?: number;
  riskState?: string;
  sizingMode?: string;
  strategyId?: string;
  timestamp: string;
};

export type RiskGuardApproval = {
  liveTradingApproved?: boolean;
  marketOrdersApproved?: boolean;
};

export type BinanceExecutionConfigInput = {
  mode?: ExecutionMode;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  testnetBaseUrl?: string;
  allowedSymbols?: string[];
  maxNotionalPerOrder?: number;
  maxDailyNotional?: number;
  maxOpenOrders?: number;
  allocationMode?: "normalized" | "system_proportional";
  minConfidence?: number;
  minTrust?: number;
  strategyEquityCap?: number;
  accountEquityOverride?: number;
  staleDecisionMs?: number;
  staleSyncMs?: number;
  cooldownMs?: number;
  recvWindow?: number;
  allowMarketOrders?: boolean;
  confirmLiveTrading?: boolean;
  liveTradingEnabled?: boolean;
  riskGuard?: RiskGuardApproval;
  stateFile?: string;
  exchangeInfoTtlMs?: number;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
};

export type BinanceExecutionConfig = Required<
  Omit<
    BinanceExecutionConfigInput,
    "apiKey" | "apiSecret" | "fetch" | "riskGuard" | "stateFile"
  >
> & {
  apiKey?: string;
  apiSecret?: string;
  allocationMode: "normalized" | "system_proportional";
  riskGuard: Required<RiskGuardApproval>;
  stateFile: string;
  fetch: typeof fetch;
  validationErrors: string[];
};

export type BinanceFilter =
  | {
      filterType: "LOT_SIZE" | "MARKET_LOT_SIZE";
      minQty: string;
      maxQty: string;
      stepSize: string;
    }
  | {
      filterType: "PRICE_FILTER";
      minPrice: string;
      maxPrice: string;
      tickSize: string;
    }
  | {
      filterType: "MIN_NOTIONAL";
      minNotional: string;
      applyToMarket?: boolean;
    }
  | {
      filterType: "NOTIONAL";
      minNotional?: string;
      maxNotional?: string;
      applyMinToMarket?: boolean;
      applyMaxToMarket?: boolean;
    }
  | {
      filterType: "MAX_NUM_ORDERS";
      maxNumOrders: number;
    }
  | {
      filterType: "MAX_POSITION";
      maxPosition: string;
    }
  | {
      filterType: string;
      [key: string]: unknown;
    };

export type BinanceSymbolInfo = {
  symbol: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  filters: BinanceFilter[];
};

export type BinanceExchangeInfo = {
  timezone?: string;
  serverTime?: number;
  symbols: BinanceSymbolInfo[];
};

export type BinanceBalance = {
  asset: string;
  free: string;
  locked: string;
};

export type BinanceAccountSnapshot = {
  balances: BinanceBalance[];
  updateTime?: number;
};

export type BinanceOpenOrder = {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  side: BinanceOrderSide;
  type: BinanceOrderType;
  time?: number;
};

export type BinanceTrade = {
  id: number;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
};

export type NormalizedOrderRequest = {
  decisionId: string;
  clientOrderId: string;
  symbol: string;
  side: BinanceOrderSide;
  type: BinanceOrderType;
  quantity: number;
  price?: number;
  quoteOrderQty?: number;
  timeInForce?: BinanceTimeInForce;
  notional: number;
  strategyId?: string;
  dryRun?: boolean;
};

export type OrderValidationResult = {
  ok: boolean;
  normalized?: NormalizedOrderRequest;
  reasons: string[];
};

export type Reservation = {
  id: string;
  decisionId: string;
  symbol: string;
  amount: number;
  side: BinanceOrderSide;
  status: "reserved" | "released" | "consumed";
  createdAt: string;
  releasedAt?: string;
};

export type ExecutionOrderRecord = {
  id: string;
  decisionId: string;
  clientOrderId: string;
  symbol: string;
  side: BinanceOrderSide;
  type: BinanceOrderType;
  status: string;
  quantity: number;
  price?: number;
  notional: number;
  mode: ExecutionMode;
  createdAt: string;
  updatedAt: string;
  raw?: unknown;
};

export type DecisionExecutionRecord = {
  decisionId: string;
  clientOrderId?: string;
  status:
    | "approved"
    | "rejected"
    | "attempted"
    | "accepted"
    | "failed"
    | "cancelled";
  reasons: string[];
  decision: BinanceExecutionDecision;
  createdAt: string;
  updatedAt: string;
};

export type AccountState = {
  syncedAt: string | null;
  equity: number;
  availableEquity: number;
  balances: Record<string, { free: number; locked: number }>;
  openOrders: BinanceOpenOrder[];
  fills: BinanceTrade[];
};

export type PositionSnapshot = {
  expectedPositions: Record<string, number>;
  actualPositions: Record<string, number>;
  reservedCapital: number;
  activeExposure: number;
  driftDetected: boolean;
  driftReasons: string[];
  createdAt: string;
};

export type ExecutionStateSnapshot = {
  mode: ExecutionMode;
  decisions: DecisionExecutionRecord[];
  orders: ExecutionOrderRecord[];
  reservations: Reservation[];
  account: AccountState;
  positions: PositionSnapshot | null;
  killSwitch: {
    active: boolean;
    reason: string | null;
    updatedAt: string | null;
  };
  circuitBreaker: {
    state: "closed" | "open" | "half-open";
    failureCount: number;
    openedAt: string | null;
  };
  metrics: Record<string, number>;
};

export type RiskRejection = {
  code: string;
  message: string;
};

export type RiskGuardResult = {
  ok: boolean;
  reasons: RiskRejection[];
};

export type ExecutionResult = {
  decisionId: string;
  status:
    | "approved"
    | "rejected"
    | "accepted"
    | "filled"
    | "partially_filled"
    | "cancelled"
    | "failed";
  mode: ExecutionMode;
  order?: ExecutionOrderRecord;
  clientOrderId?: string;
  reasons: string[];
};

export type HealthCheckResult = {
  ok: boolean;
  mode: ExecutionMode;
  accountSynced: boolean;
  exchangeReachable: boolean;
  reconciliationHealthy: boolean;
  killSwitchActive: boolean;
  staleState: boolean;
  lastSyncAt: string | null;
  reasons: string[];
};

export type BinanceClientResponse<T> = {
  status: number;
  data: T;
  headers: Headers;
};
