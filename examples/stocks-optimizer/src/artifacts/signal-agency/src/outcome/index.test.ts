import { describe, expect, it } from "vitest";
import { resolveOutcome } from ".";

describe("outcome", () => {
  it("returns an unknown outcome when no data is available", () => {
    expect(resolveOutcome()).toEqual({
      success: null,
      outcomeLabel: "unknown",
    });
  });

  it("maps explicit success labels to positive and negative outcomes", () => {
    expect(resolveOutcome({ success: true })).toMatchObject({
      success: true,
      outcomeLabel: "positive",
    });
    expect(resolveOutcome({ success: false })).toMatchObject({
      success: false,
      outcomeLabel: "negative",
    });
  });

  it("infers labels from reward and loss values", () => {
    expect(resolveOutcome({ reward: 5, loss: 2 }).outcomeLabel).toBe("positive");
    expect(resolveOutcome({ loss: 2 }).outcomeLabel).toBe("negative");
    expect(resolveOutcome({ reward: 1, loss: 4 }).outcomeLabel).toBe("negative");
    expect(resolveOutcome({ reward: 3, loss: 3 }).outcomeLabel).toBe("neutral");
    expect(resolveOutcome({ reward: 0 }).outcomeLabel).toBe("neutral");
  });

  it("preserves explicit labels and measurable fields", () => {
    expect(resolveOutcome({
      success: null,
      reward: 1,
      loss: 0,
      durationMs: 20,
      outcomeLabel: "neutral",
    })).toEqual({
      success: null,
      reward: 1,
      loss: 0,
      durationMs: 20,
      outcomeLabel: "neutral",
    });
  });

  it("rejects negative measurable fields", () => {
    expect(() => resolveOutcome({ reward: -1 })).toThrow("reward must be a non-negative number.");
    expect(() => resolveOutcome({ loss: -1 })).toThrow("loss must be a non-negative number.");
    expect(() => resolveOutcome({ durationMs: -1 })).toThrow("durationMs must be a non-negative number.");
  });
});
