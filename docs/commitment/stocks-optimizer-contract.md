# Stocks Optimizer Integration Contract

## Boundary

Signal returns abstract commitment. Stocks Optimizer converts abstract commitment into exact units.

Stocks Optimizer may know:

- investor intent
- available capital
- current holdings
- market data
- symbols
- prices
- broker constraints
- exact units

Signal may not know those things.

## Signal Request

```json
{
  "strategy": "sharpe_like",
  "policy": "balanced",
  "resource": {
    "available": 10000,
    "requested": 5000
  },
  "decisions": [
    {
      "id": "AAPL",
      "confidence": 0.82,
      "trust": 0.78,
      "risk": 0.3,
      "outcomeSeries": [0.01, -0.002, 0.006]
    }
  ],
  "seed": "portfolio-2026-06-01"
}
```

Stocks Optimizer is responsible for translating market-specific data into this generic form before calling Signal.

## Signal Response

```json
{
  "operation": "commitment.evaluate.v1",
  "status": "recommended",
  "totalRecommended": 2500,
  "normalizedCommitment": 0.25,
  "recommendations": [
    {
      "targetId": "AAPL",
      "amount": 2500,
      "normalizedCommitment": 0.25,
      "mode": "normal"
    }
  ],
  "limitedBy": [],
  "invalidation": {},
  "monitoringPlan": {}
}
```

Stocks Optimizer then converts `amount: 2500` into units using price, lot size, fees, taxes, cash, and broker rules.

## Stocks Optimizer Output

```json
{
  "commitment": {
    "operation": "commitment.evaluate.v1",
    "targetId": "AAPL",
    "amount": 2500
  },
  "executionPlan": {
    "symbol": "AAPL",
    "side": "buy",
    "quantity": 14,
    "estimatedCashUsed": 2478,
    "unspentCash": 22,
    "constraintsApplied": ["whole-share-floor", "cash-available"]
  }
}
```

## Migration Plan

1. Stocks Optimizer keeps market data loading and current portfolio state.
2. It maps each candidate asset to a `CommitmentDecision`.
3. It calls `commitment.evaluate.v1`.
4. It maps abstract amounts to exact units.
5. It records both Signal's commitment result and its own execution plan.
6. Risk Divider backend logic can be retired after parity fixtures pass in Stocks Optimizer.
