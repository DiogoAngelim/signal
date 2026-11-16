import { describe, expect, it } from "vitest";
import {
  journeyReducer, newJourney, returningJourney, scenario, type JourneyState,
} from "./lumina-journey";

const AT = "2026-11-15T20:00:00.000Z";
function savedIdea(): JourneyState {
  const exploring = journeyReducer(newJourney(), { type: "START", text: "Just explore a simple example" });
  const adjusted = journeyReducer(exploring, { type: "EXPOSURE", value: 35 });
  return journeyReducer(adjusted, { type: "SAVE", at: AT, id: "idea-1" });
}

describe("Lúmina returning Practice journey", () => {
  it("recognizes only a saved idea, not a verified holding or a profit", () => {
    const first = savedIdea();
    const returning = returningJourney(first.choices);
    expect(returning.step).toBe("returning");
    expect(returning.messages).toEqual([]);
    expect(returning.choices[0]).toMatchObject({
      id: "idea-1", amount: 5000, exposedPercent: 35,
      provenance: "illustrative", executed: false,
    });
    expect(returning).not.toHaveProperty("marketPrice");
    expect(scenario(5000, 35)).not.toHaveProperty("return");
  });

  it("resumes the original example without overwriting the saved decision", () => {
    const returned = returningJourney(savedIdea().choices);
    const continued = journeyReducer(returned, { type: "RESUME_CHOICE", id: "idea-1" });
    expect(continued.step).toBe("visual");
    expect(continued.activeChoiceId).toBe("idea-1");
    expect(continued.exposedPercent).toBe(35);
    expect(continued.amount).toBe(5000);
    expect(continued.messages[0].text).toContain("not a verified position");
    const revised = journeyReducer(continued, { type: "EXPOSURE", value: 60 });
    expect(revised.exposedPercent).toBe(60);
    expect(revised.choices[0].exposedPercent).toBe(35); // immutable recorded choice
    expect(revised.choices[0].executed).toBe(false);
  });

  it("does not invent a market update after time has passed", () => {
    const returned = returningJourney(savedIdea().choices);
    const asked = journeyReducer(returned, { type: "SUBMIT", text: "What changed?" });
    expect(asked.step).toBe("returning");
    expect(asked.notice).toContain("can't verify what changed");
    expect(asked.notice).toContain("doesn't monitor prices");
    const resumed = journeyReducer(returned, { type: "RESUME_CHOICE", id: "idea-1" });
    const askedAgain = journeyReducer(resumed, { type: "SUBMIT", text: "Any updates?" });
    expect(askedAgain.messages.at(-1)?.text).toContain("doesn't monitor prices");
    expect(askedAgain.choices).toEqual(returned.choices);
  });

  it("fulfills a contextual request to forget and clears the current draft", () => {
    const returned = returningJourney(savedIdea().choices);
    const continued = journeyReducer(returned, { type: "RESUME_CHOICE", id: "idea-1" });
    const forgotten = journeyReducer(continued, { type: "SUBMIT", text: "Don't remember this" });
    expect(forgotten.choices).toEqual([]);
    expect(forgotten.step).toBe("welcome");
    expect(forgotten.messages).toEqual([]);
    expect(forgotten.amount).toBeNull();
    expect(forgotten.notice).toContain("forgotten");
    expect(returningJourney(forgotten.choices).step).toBe("welcome");
  });

  it("asks which one if 'this' is ambiguous, and never silently erases unrelated choices", () => {
    const first = savedIdea();
    const second = journeyReducer(first, { type: "SAVE", at: "2026-11-15T21:00:00.000Z", id: "idea-2" });
    const returned = returningJourney(second.choices);
    const ambiguous = journeyReducer(returned, { type: "SUBMIT", text: "Forget this" });
    expect(ambiguous.choices).toHaveLength(2);
    expect(ambiguous.notice).toContain("Open History");
    const targeted = journeyReducer(returned, { type: "FORGET_CHOICE", id: "idea-2" });
    expect(targeted.choices.map((c) => c.id)).toEqual(["idea-1"]);
    expect(targeted.step).toBe("returning");
    const cleared = journeyReducer(targeted, { type: "CLEAR_HISTORY" });
    expect(cleared.choices).toHaveLength(0);
    expect(cleared.step).toBe("welcome");
  });

  it("can start fresh without discarding saved choices", () => {
    const returned = returningJourney(savedIdea().choices);
    const fresh = journeyReducer(returned, { type: "RESET" });
    expect(fresh.step).toBe("welcome");
    expect(fresh.choices).toHaveLength(1);
    expect(fresh.activeChoiceId).toBeNull();
    expect(journeyReducer(returned, { type: "RESUME_CHOICE", id: "missing" })).toBe(returned);
  });
});
