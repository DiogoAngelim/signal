import { describe, expect, it } from "vitest";
import {
  type SemanticLexicon,
  loadBundledSemanticLexicon,
  resolveSemanticState,
  validateSemanticLexicon,
} from "./index";

function lexicon(
  entries: SemanticLexicon["entries"],
  version = "test.v1",
): SemanticLexicon {
  return { version, entries };
}

describe("semantic-state", () => {
  it("selects an exact matching word from a custom lexicon", () => {
    const custom = lexicon([
      { word: "Still", dimensions: { stability: 1, momentum: 0 } },
      { word: "Moving", dimensions: { stability: 0, momentum: 1 } },
    ]);

    const result = resolveSemanticState(
      { dimensions: { stability: 1, momentum: 0 } },
      { lexicon: custom },
    );

    expect(result.word).toBe("Still");
    expect(result.score).toBe(1);
    expect(result.confidence).toBe(1);
    expect(result.lexiconVersion).toBe("test.v1");
    expect(result.breakdown).toEqual({ momentum: 1, stability: 1 });
  });

  it("returns deterministic output for the same input, lexicon, and config", () => {
    const custom = lexicon([
      { word: "Gamma", dimensions: { coherence: 0.4 } },
      { word: "Alpha", dimensions: { coherence: 0.4 } },
    ]);
    const input = { dimensions: { coherence: 0.4 } };
    const config = { lexicon: custom, secondaryLimit: 1 };

    expect(resolveSemanticState(input, config)).toEqual(
      resolveSemanticState(input, config),
    );
  });

  it("returns ranked secondary candidates with categories", () => {
    const custom = lexicon([
      { word: "Primary", category: "fit", dimensions: { stability: 0.9 } },
      { word: "RunnerUp", category: "fit", dimensions: { stability: 0.8 } },
      { word: "Third", category: "fit", dimensions: { stability: 0.7 } },
      { word: "Distant", category: "fit", dimensions: { stability: 0.1 } },
    ]);

    const result = resolveSemanticState(
      { dimensions: { stability: 0.9 } },
      { lexicon: custom, secondaryLimit: 2 },
    );

    expect(result.word).toBe("Primary");
    expect(result.category).toBe("fit");
    expect(result.secondary).toEqual([
      { word: "RunnerUp", score: 0.9, confidence: 0.9, category: "fit" },
      { word: "Third", score: 0.8, confidence: 0.8, category: "fit" },
    ]);
  });

  it("supports fallback behavior when confidence is below the configured floor", () => {
    const custom = lexicon([
      { word: "Closest", dimensions: { stability: 1 } },
      { word: "Fallback", dimensions: { stability: 0 } },
    ]);

    const result = resolveSemanticState(
      { dimensions: { stability: 0.5 } },
      { lexicon: custom, minConfidence: 0.9, fallbackWord: "fallback" },
    );

    expect(result.word).toBe("Fallback");
    expect(result.score).toBe(0.5);
    expect(result.secondary[0]?.word).toBe("Closest");
  });

  it("falls back to the highest scoring word when the configured fallback is absent", () => {
    const custom = lexicon([
      { word: "Highest", dimensions: { stability: 0.6 } },
      { word: "Lower", dimensions: { stability: 0 } },
    ]);

    const result = resolveSemanticState(
      { dimensions: { stability: 0.6 } },
      { lexicon: custom, minConfidence: 1, fallbackWord: "Missing" },
    );

    expect(result.word).toBe("Highest");
  });

  it("rejects invalid input dimensions", () => {
    expect(() =>
      resolveSemanticState({ dimensions: { stability: 1.1 } }),
    ).toThrow(
      "Semantic state input dimensions.stability must be a number between 0 and 1.",
    );

    expect(() => resolveSemanticState({ dimensions: {} })).toThrow(
      "Semantic state input dimensions must include at least one dimension.",
    );
  });

  it("rejects duplicate words unless validation explicitly allows them", () => {
    const duplicate = lexicon([
      { word: "Echo", dimensions: { coherence: 1 } },
      { word: "echo", dimensions: { coherence: 0 } },
    ]);

    expect(() => validateSemanticLexicon(duplicate)).toThrow(
      'Duplicate semantic lexicon word "echo" is not allowed.',
    );
    expect(
      validateSemanticLexicon(duplicate, { allowDuplicateWords: true }),
    ).toBe(duplicate);
  });

  it("rejects empty or malformed lexicons with clear errors", () => {
    expect(() =>
      validateSemanticLexicon({ version: "empty.v1", entries: [] }),
    ).toThrow("Semantic lexicon must include at least one entry.");
    expect(() =>
      validateSemanticLexicon(null as unknown as SemanticLexicon),
    ).toThrow("Semantic lexicon must be an object.");
    expect(() => validateSemanticLexicon({ version: "", entries: [] })).toThrow(
      "Semantic lexicon must include a non-empty version.",
    );
  });

  it("uses per-dimension weights during scoring", () => {
    const custom = lexicon([
      { word: "StabilityFit", dimensions: { stability: 1, urgency: 0 } },
      { word: "UrgencyFit", dimensions: { stability: 0, urgency: 1 } },
    ]);

    const result = resolveSemanticState(
      { dimensions: { stability: 1, urgency: 1 } },
      { lexicon: custom, weights: { stability: 0.1, urgency: 2 } },
    );

    expect(result.word).toBe("UrgencyFit");
  });

  it("supports app-level custom lexicon overrides", () => {
    const appLexicon = lexicon(
      [
        { word: "AppCold", dimensions: { temperature: 0 } },
        { word: "AppHot", dimensions: { temperature: 1 } },
      ],
      "app.v1",
    );

    const result = resolveSemanticState(
      { dimensions: { temperature: 1 } },
      { lexicon: appLexicon },
    );

    expect(result.word).toBe("AppHot");
    expect(result.lexiconVersion).toBe("app.v1");
  });

  it("always returns a word from the active lexicon", () => {
    const bundled = loadBundledSemanticLexicon();
    const result = resolveSemanticState({
      dimensions: {
        stability: 0.35,
        participation: 0.12,
        synchronization: 0.86,
        confidence: 0.41,
        volatility: 0.22,
        stress: 0.48,
        uncertainty: 0.62,
        coherence: 0.72,
        urgency: 0.31,
      },
    });

    expect(bundled.entries.map((entry) => entry.word)).toContain(result.word);
    expect(result.lexiconVersion).toBe("generic-state.v1");
  });

  it("accepts stocks-optimizer-like normalized dimensions without domain logic", () => {
    const result = resolveSemanticState({
      dimensions: {
        stability: 0.72,
        momentum: 0.66,
        participation: 0.18,
        synchronization: 0.8,
        confidence: 0.64,
        volatility: 0.2,
        stress: 0.28,
        uncertainty: 0.38,
        urgency: 0.26,
        coherence: 0.76,
        direction: 0.62,
      },
    });
    const words = new Set(
      loadBundledSemanticLexicon("generic-state").entries.map(
        (entry) => entry.word,
      ),
    );

    expect(words.has(result.word)).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("uses priority and alphabetical tie-breaking deterministically", () => {
    const custom = lexicon([
      { word: "Zulu", dimensions: { coherence: 0.5 } },
      { word: "Alpha", dimensions: { coherence: 0.5 } },
      { word: "Middle", dimensions: { coherence: 0.5 } },
    ]);

    expect(
      resolveSemanticState(
        { dimensions: { coherence: 0.5 } },
        { lexicon: custom },
      ).word,
    ).toBe("Alpha");
    expect(
      resolveSemanticState(
        { dimensions: { coherence: 0.5 } },
        { lexicon: custom, priority: ["Zulu"] },
      ).word,
    ).toBe("Zulu");
    expect(
      resolveSemanticState(
        { dimensions: { coherence: 0.5 } },
        { lexicon: custom, priority: { Middle: 10 } },
      ).word,
    ).toBe("Middle");
  });

  it("validates optional lexicon metadata", () => {
    expect(() =>
      validateSemanticLexicon(
        lexicon([
          {
            word: "Bad",
            dimensions: { stability: 1 },
            polarity: "mixed" as never,
          },
        ]),
      ),
    ).toThrow('Semantic lexicon entry "Bad" has an invalid polarity.');

    expect(() =>
      validateSemanticLexicon(
        lexicon([{ word: "Bad", dimensions: { stability: 1 }, intensity: 2 }]),
      ),
    ).toThrow(
      'Semantic lexicon entry "Bad" intensity must be a number between 0 and 1.',
    );

    expect(() =>
      validateSemanticLexicon(
        lexicon([{ word: "Bad", dimensions: { stability: 1 }, aliases: [""] }]),
      ),
    ).toThrow(
      'Semantic lexicon entry "Bad" aliases must be non-empty strings.',
    );
  });

  it("validates malformed lexicon entries and dimensions", () => {
    expect(() =>
      validateSemanticLexicon(
        lexicon([null as unknown as SemanticLexicon["entries"][number]]),
      ),
    ).toThrow("Semantic lexicon entry at index 0 must be an object.");

    expect(() =>
      validateSemanticLexicon(
        lexicon([{ word: "", dimensions: { stability: 1 } }]),
      ),
    ).toThrow("Semantic lexicon entry at index 0 must include a valid word.");

    expect(() =>
      validateSemanticLexicon(
        lexicon([
          { word: "Bad", dimensions: [] as unknown as Record<string, number> },
        ]),
      ),
    ).toThrow('Semantic lexicon entry "Bad" dimensions must be an object.');

    expect(() =>
      validateSemanticLexicon(
        lexicon([{ word: "Bad", dimensions: { "": 1 } }]),
      ),
    ).toThrow(
      'Semantic lexicon entry "Bad" dimensions contains an invalid dimension name.',
    );
  });

  it("validates weights, priority, confidence, and secondary limits", () => {
    const custom = lexicon([{ word: "Only", dimensions: { stability: 1 } }]);

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, weights: { stability: -1 } },
      ),
    ).toThrow(
      'Semantic state weight for "stability" must be a non-negative number.',
    );

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, weights: { "": 1 } },
      ),
    ).toThrow("Semantic state weights contain an invalid dimension name.");

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, weights: { stability: 0 } },
      ),
    ).toThrow(
      "Semantic state scoring requires at least one positive dimension weight.",
    );

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, minConfidence: 2 },
      ),
    ).toThrow("minConfidence must be a number between 0 and 1.");

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, secondaryLimit: -1 },
      ),
    ).toThrow("secondaryLimit must be a non-negative integer.");

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, priority: [""] },
      ),
    ).toThrow("Semantic state priority words must be non-empty strings.");

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, priority: { Only: Number.NaN } },
      ),
    ).toThrow('Semantic state priority for "Only" must be numeric.');

    expect(() =>
      resolveSemanticState(
        { dimensions: { stability: 1 } },
        { lexicon: custom, priority: { "": 1 } },
      ),
    ).toThrow("Semantic state priority contains an invalid word.");
  });

  it("supports zero secondary candidates and unknown bundled lexicon errors", () => {
    const custom = lexicon([
      { word: "One", dimensions: { stability: 1 } },
      { word: "Two", dimensions: { stability: 0 } },
    ]);
    const result = resolveSemanticState(
      { dimensions: { stability: 1 } },
      { lexicon: custom, secondaryLimit: 0 },
    );

    expect(result.secondary).toEqual([]);
    expect(() => loadBundledSemanticLexicon("missing")).toThrow(
      'Bundled semantic lexicon "missing" was not found.',
    );
  });
});
