# Discovery Intelligence Migration Notes

## New Snapshot Field

`SignalSnapshot` now includes:

```ts
discoveryIntelligence?: DiscoveryIntelligenceResult;
```

`SignalContext` may supply optional source records:

```ts
discoveryIntelligence?: Partial<DiscoveryIntelligenceInput>;
```

The core engine derives generic records from prior module outputs and merges any supplied records.

## Executive IA

`buildExecutiveDashboardIA` accepts:

```ts
discoveryIntelligence?: DiscoveryIntelligenceResult | null;
```

It preserves the module in traceability, adds it to the decision pipeline after Survival, and adds evidence and terminology entries.

## Stocks Optimizer

The stocks optimizer maps existing diagnostics into generic Discovery Intelligence records:

- candidates become `DiscoveryRecord`
- strategy decisions become `DecisionRecord`
- trade/outcome history becomes `OutcomeRecord`
- gates and blockers become `RestrictionRecord`
- calibration/trust/survival/quality/governance values become `TraceRecord`

No financial logic was added to the Discovery Intelligence module itself.

## Backward Compatibility

Existing consumers can ignore `discoveryIntelligence`. Empty or missing values render as pending dashboard states.
