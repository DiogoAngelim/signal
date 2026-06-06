import type { ExecutionMetrics } from "./metrics";

export class KillSwitch {
  private active = false;
  private reason: string | null = null;
  private updatedAt: string | null = null;

  constructor(private readonly metrics?: ExecutionMetrics) {}

  isActive() {
    return this.active;
  }

  enable(reason: string) {
    this.active = true;
    this.reason = reason || "unspecified";
    this.updatedAt = new Date().toISOString();
    this.metrics?.increment("kill_switch_activations");
    return this.snapshot();
  }

  disable(reason: string) {
    this.active = false;
    this.reason = reason || "manual_disable";
    this.updatedAt = new Date().toISOString();
    return this.snapshot();
  }

  hydrate(value?: { active?: boolean; reason?: string | null; updatedAt?: string | null }) {
    this.active = value?.active === true;
    this.reason = value?.reason ?? null;
    this.updatedAt = value?.updatedAt ?? null;
  }

  snapshot() {
    return {
      active: this.active,
      reason: this.reason,
      updatedAt: this.updatedAt,
    };
  }
}
