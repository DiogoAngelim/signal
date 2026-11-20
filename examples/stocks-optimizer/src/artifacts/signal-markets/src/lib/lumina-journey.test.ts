import { describe, expect, it } from "vitest";
import {
  formatBRL, journeyReducer, newJourney, resolveHorizon,
  resolveMoney, scenario, type JourneyState,
} from "./lumina-journey";

function send(state: JourneyState, text: string) {
  return journeyReducer(state, { type: "SUBMIT", text });
}

describe("Lúmina offline practice journey", () => {
  it("begins without credentials, a connection or a fabricated holding", () => {
    const state = newJourney();
    expect(state.step).toBe("welcome");
    expect(state.amount).toBeNull();
    expect(state.choices).toEqual([]);
    expect(state.messages).toEqual([]);
  });

  it("asks about timing when it could change the explanation", () => {
    const started = send(newJourney(), "I have R$ 5,000 and want to invest.");
    expect(started.amount).toBe(5_000);
    expect(started.step).toBe("horizon");
    const answered = journeyReducer(started, { type: "PICK_HORIZON", value: "soon" });
    expect(answered.step).toBe("visual");
    expect(answered.horizon).toBe("soon");
    expect(answered.messages.at(-1)?.kind).toBe("scenario");
  });

  it("asks for an amount only when missing", () => {
    const started = send(newJourney(), "I'm saving to buy a home in 2 years.");
    expect(started.goal).toBe("your home");
    expect(started.horizon).toBe("middle");
    expect(started.step).toBe("amount");
    const choice = journeyReducer(started, { type: "PICK_AMOUNT", value: 1_000 });
    expect(choice.step).toBe("visual");
    expect(choice.amount).toBe(1_000);
  });

  it("lets someone explore made-up money without an account", () => {
    const state = send(newJourney(), "Just explore a simple example");
    expect(state.step).toBe("visual");
    expect(state.amount).toBe(5_000);
    expect(state.horizon).toBe("unsure");
    expect(state.choices).toEqual([]);
  });

  it("keeps visual changes and typed changes synchronized", () => {
    const started = send(newJourney(), "Just explore a simple example");
    const adjusted = journeyReducer(started, { type: "EXPOSURE", value: 45 });
    expect(adjusted.exposedPercent).toBe(45);
    expect(send(adjusted, "keep 80% accessible").exposedPercent).toBe(20);
    expect(send(adjusted, "more exposure").exposedPercent).toBe(55);
    expect(send(adjusted, "less risk").exposedPercent).toBe(35);
    expect(send(adjusted, "R$ 7.500").amount).toBe(7_500);
  });

  it("never mistakes a practice choice for execution", () => {
    const started = send(newJourney(), "Just explore a simple example");
    const unsupported = send(started, "Buy Bitcoin now");
    expect(unsupported.messages.at(-1)?.kind).toBe("unsupported");
    expect(unsupported.choices).toHaveLength(0);
    const saved = journeyReducer(started, {
      type: "SAVE", id: "practice-1", at: "2026-11-15T20:00:00.000Z",
    });
    expect(saved.choices[0]).toMatchObject({
      amount: 5_000, exposedPercent: 20, accessiblePercent: 80,
      provenance: "illustrative", executed: false,
    });
    expect(saved.choices).toHaveLength(1);
    expect(journeyReducer(saved, { type: "RESET" }).choices).toHaveLength(1);
    expect(journeyReducer(saved, { type: "CLEAR_HISTORY" }).choices).toEqual([]);
  });

  it("keeps the arithmetic hypothetical and never returns a forecast", () => {
    const result = scenario(5_000, 20);
    expect(result).toMatchObject({
      accessiblePercent: 80, exposedPercent: 20,
      accessibleValue: 4_000, exposedValue: 1_000,
      hypotheticalLoss20: 200, provenance: "illustrative",
    });
    expect(result).not.toHaveProperty("predictedReturn");
    expect(result).not.toHaveProperty("probability");
  });

  it("parses explicitly supplied amounts without treating dates as amounts", () => {
    expect(resolveMoney("I have R$ 5.000")).toBe(5_000);
    expect(resolveMoney("R$ 7.500")).toBe(7_500);
    expect(resolveMoney("I'm saving for a home in 2028")).toBeNull();
    expect(resolveHorizon("I'm not sure yet")).toBe("unsure");
    expect(formatBRL(5_000)).toContain("5.000");
  });

  it("rejects impossible or ambiguous percentage inputs", () => {
    const state = send(newJourney(), "Just explore a simple example");
    expect(send(state, "150% market").exposedPercent).toBe(20);
    expect(journeyReducer(state, { type: "EXPOSURE", value: Number.NaN })).toBe(state);
    expect(journeyReducer(state, { type: "EXPOSURE", value: 999 }).exposedPercent).toBe(100);
  });
});
