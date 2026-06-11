export function sanitizePromotionState(input: any) {
  const summary = { ...(input ?? {}) };

  const flags = new Set<string>(
    Array.isArray(summary.failureFlags) ? summary.failureFlags : [],
  );

  const sharpeInvalid =
    summary.annualizedSharpe == null ||
    summary.sharpeRatio == null ||
    !Number.isFinite(Number(summary.annualizedSharpe ?? summary.sharpeRatio));

  const drawdownInvalid =
    summary.maxDrawdownPct == null ||
    !Number.isFinite(Number(summary.maxDrawdownPct));

  const excessReturn = Number(
    summary.excessReturnPct ?? summary.excessReturn ?? 0,
  );

  const benchmarkFailed =
    summary.benchmarkStatus === "Failed" ||
    summary.benchmarkPassed === false ||
    summary.benchmarkComparison === "Failed" ||
    excessReturn < 0;

  const insufficientSegments =
    Number(summary.segmentCount ?? 0) <
    Number(summary.minimumRequiredSegments ?? 3);

  if (sharpeInvalid) flags.add("INVALID_SHARPE");
  if (drawdownInvalid) flags.add("INVALID_DRAWDOWN");
  if (benchmarkFailed) flags.add("BENCHMARK_FAILED");
  if (excessReturn <= -10) flags.add("SEVERE_BENCHMARK_UNDERPERFORMANCE");
  if (insufficientSegments) flags.add("INSUFFICIENT_WALK_FORWARD_SEGMENTS");

  const blocked = flags.size > 0 || summary.promotionBlocked === true;

  if (blocked) {
    summary.status = "guarded";
    summary.backtestStatus = "guarded";

    summary.lifecycleStage = "Research validated";
    summary.promotionState = "Blocked";
    summary.promotionLabel = "Blocked";
    summary.readinessLabel = "Blocked";

    summary.forwardTestEligible = false;
    summary.forwardEligible = false;
    summary.isForwardTestEligible = false;
    summary.promotionBlocked = true;
    summary.automaticFailureDetected = true;

    summary.gatesPassed = Math.min(
      Number(summary.gatesPassed ?? summary.passedGates ?? 0),
      5,
    );
    summary.passedGates = summary.gatesPassed;

    summary.survivalScore = Math.min(Number(summary.survivalScore ?? 0), 45);
    summary.promotionConfidence = Math.min(
      Number(summary.promotionConfidence ?? summary.survivalScore ?? 0),
      45,
    );
  }

  summary.failureFlags = Array.from(flags);

  summary.automaticFailureReasons = summary.failureFlags.map((flag: string) => {
    switch (flag) {
      case "INVALID_SHARPE":
        return "Sharpe ratio is unavailable or invalid";
      case "INVALID_DRAWDOWN":
        return "Drawdown calculation is unavailable or invalid";
      case "BENCHMARK_FAILED":
        return "Strategy failed benchmark comparison";
      case "SEVERE_BENCHMARK_UNDERPERFORMANCE":
        return "Strategy severely underperformed benchmark";
      case "INSUFFICIENT_WALK_FORWARD_SEGMENTS":
        return "Insufficient walk-forward validation segments";
      default:
        return flag;
    }
  });

  return summary;
}
