import { describe, expect, it } from "vitest";
import {
  LUMINA_PRACTICE_SESSION_KEY, readPracticeChoices, writePracticeChoices,
  type PracticeSessionStorage,
} from "./lumina-practice-session";
import { journeyReducer, newJourney } from "./lumina-journey";

function memoryStorage(): PracticeSessionStorage & { records: Map<string, string> } {
  const records = new Map<string, string>();
  return {
    records,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: (key) => { records.delete(key); },
  };
}
function example() {
  const exploring = journeyReducer(newJourney(), { type: "START", text: "Just explore a simple example" });
  const saved = journeyReducer(exploring, {
    type: "SAVE", id: "demo-1", at: "2026-11-15T20:00:00.000Z",
  });
  return saved.choices;
}

describe("Lúmina tab-scoped Practice continuity", () => {
  it("persists only explicitly saved, versioned illustrative choice data", () => {
    const storage = memoryStorage();
    const choices = example();
    expect(writePracticeChoices(choices, storage)).toBe(true);
    expect(readPracticeChoices(storage)).toEqual(choices);
    const raw = storage.getItem(LUMINA_PRACTICE_SESSION_KEY);
    expect(raw).toContain('"version":1');
    expect(raw).toContain('"executed":false');
    expect(raw).not.toContain("Just explore a simple example");
  });

  it("forgets the saved choice without deleting unrelated browser data", () => {
    const storage = memoryStorage();
    storage.setItem("unrelated-app", "keep-me");
    writePracticeChoices(example(), storage);
    expect(writePracticeChoices([], storage)).toBe(true);
    expect(readPracticeChoices(storage)).toEqual([]);
    expect(storage.getItem(LUMINA_PRACTICE_SESSION_KEY)).toBeNull();
    expect(storage.getItem("unrelated-app")).toBe("keep-me");
  });

  it("refuses forged execution events and invalid or corrupted session records", () => {
    const storage = memoryStorage();
    const original = example()[0];
    const invalid = [
      { ...original, id: "forged-1", executed: true },
      { ...original, id: "forged-2", provenance: "verified-external" },
      { ...original, id: "forged-3", accessiblePercent: 40 },
      { ...original, id: "forged-4", goal: "<script>alert(1)</script>" },
      { ...original, id: "forged-5", amount: -200 },
      { ...original, id: "forged-6", horizon: "yesterday" },
    ];
    storage.setItem(LUMINA_PRACTICE_SESSION_KEY, JSON.stringify({
      version: 1, choices: [original, ...invalid],
    }));
    expect(readPracticeChoices(storage)).toEqual([original]);

    storage.setItem(LUMINA_PRACTICE_SESSION_KEY, "{bad json");
    expect(readPracticeChoices(storage)).toEqual([]);
    storage.setItem(LUMINA_PRACTICE_SESSION_KEY, JSON.stringify({ version: 999, choices: example() }));
    expect(readPracticeChoices(storage)).toEqual([]);
  });

  it("continues gracefully when browser storage is unavailable", () => {
    const unavailable: PracticeSessionStorage = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    };
    expect(readPracticeChoices(unavailable)).toEqual([]);
    expect(writePracticeChoices(example(), unavailable)).toBe(false);
    expect(writePracticeChoices(example(), null)).toBe(false);
  });

  it("caps saved history so it cannot grow without bound", () => {
    const storage = memoryStorage();
    const repeated = Array.from({ length: 100 }, (_, i) => ({ ...example()[0], id: "demo-" + i }));
    expect(writePracticeChoices(repeated, storage)).toBe(true);
    expect(readPracticeChoices(storage)).toHaveLength(25);
  });
});
