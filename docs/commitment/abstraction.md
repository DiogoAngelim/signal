# Commitment Abstraction

## Problem Statement

Signal needs to answer:

I have a decision. I trust it to some degree. I have constraints and limited resources. How much should I commit?

The smallest reusable abstraction is:

Decision -> Trust -> Constraints -> Commitment -> Action

Signal owns the commitment recommendation. Execution systems own the action details.

## Responsibilities

The commitment module is responsible for:

- normalizing decision confidence, trust, risk, and utility
- resolving an explicit versioned policy
- applying hard and soft constraints
- selecting a deterministic strategy
- recommending an abstract resource amount
- explaining why that amount was recommended
- reporting what limited the recommendation
- declaring what could invalidate it
- declaring what should be monitored next

## Non-Responsibilities

The module is not responsible for:

- generating the decision
- fetching market, operational, or domain data
- knowing stocks, portfolios, crypto, prices, shares, orders, or brokers
- converting commitment into exact units
- executing actions
- storing state
- learning from outcomes by itself
- making probabilistic calls to external services

## Boundaries

Inside Signal:

- `CommitmentDecision`
- `CommitmentTrust`
- `CommitmentConstraint`
- `CommitmentResource`
- `CommitmentPolicy`
- strategy selection and deterministic scoring
- `CommitmentResult`
- invalidation and monitoring plans
- protocol operation `commitment.evaluate.v1`

Inside Stocks Optimizer:

- investor intent
- available capital
- current holdings
- market data
- exact units
- broker and execution constraints
- tax, liquidity, slippage, and transaction costs
- mapping abstract commitment to orders

Belongs nowhere in the migrated backend:

- UI-specific portfolio cards
- Electron/iOS storage and window code
- generated assets
- vendor chart rendering
- unversioned implicit assumptions
- nondeterministic `Math.random()` optimizer behavior

## Invariants

- The same input must produce the same result.
- No hidden state is read or written.
- Every policy is named, versioned, auditable, and explainable.
- Every recommendation has reasons.
- Every result includes invalidation.
- Every result includes monitoring guidance.
- Hard critical constraints can block commitment.
- Positive confidence can still produce zero commitment.
- Missing data must use an explicit fallback or defer.
- Signal never emits exact domain units.
