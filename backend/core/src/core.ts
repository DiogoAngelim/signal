import type { PulseOutput } from "@digelim/05.pulse";
import type { LifecycleTracker } from "@digelim/12.signal";

export type CoreDecision = {
  decision: "approve" | "reject" | "neutral";
  reasonCodes: string[];
  policyId: string;
  policyVersion: string;
};

export type CorePolicyRule = {
  policyId: string;
  policyVersion: string;
  decision: "approve" | "reject" | "neutral";
  minScore?: number;
  minConfidence?: number;
  reasonCodes?: string[];
};

export type CoreContext = {
  lifecycle?: LifecycleTracker;
  traceId?: string;
};

export class CoreEngine {
  constructor(private readonly policies: CorePolicyRule[]) {}

  decide(pulse: PulseOutput, context: CoreContext = {}): CoreDecision {
    for (const policy of this.policies) {
      const scoreOk =
        typeof policy.minScore === "number"
          ? pulse.score >= policy.minScore
          : true;
      const confidenceOk =
        typeof policy.minConfidence === "number"
          ? pulse.confidence >= policy.minConfidence
          : true;

      if (scoreOk && confidenceOk) {
        context.lifecycle?.transition("decided");
        return {
          decision: policy.decision,
          reasonCodes: policy.reasonCodes ?? [],
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
        };
      }
    }

    context.lifecycle?.transition("decided");

    return {
      decision: "neutral",
      reasonCodes: ["NO_POLICY_MATCH"],
      policyId: "default",
      policyVersion: "v1",
    };
  }
}
