import bundledGenericState from "./lexicons/generic-state.v1.json";

export type SemanticStateInput = {
  dimensions: Record<string, number>;
  context?: Record<string, unknown>;
};

export type SemanticPolarity = "positive" | "neutral" | "negative";

export type SemanticLexiconEntry = {
  word: string;
  category?: string;
  dimensions: Record<string, number>;
  polarity?: SemanticPolarity;
  intensity?: number;
  aliases?: string[];
  description?: string;
};

export type SemanticLexicon = {
  name?: string;
  version: string;
  entries: SemanticLexiconEntry[];
};

export type SemanticStateConfig = {
  lexicon?: SemanticLexicon;
  weights?: Record<string, number>;
  secondaryLimit?: number;
  minConfidence?: number;
  fallbackWord?: string;
  priority?: Record<string, number> | string[];
};

export type SemanticStateResult = {
  word: string;
  confidence: number;
  score: number;
  lexiconVersion: string;
  category?: string;
  secondary: Array<{
    word: string;
    score: number;
    confidence: number;
    category?: string;
  }>;
  breakdown: Record<string, number>;
};

export type SemanticLexiconValidationOptions = {
  allowDuplicateWords?: boolean;
};

type SemanticCandidate = {
  entry: SemanticLexiconEntry;
  score: number;
  confidence: number;
  breakdown: Record<string, number>;
};

export const DEFAULT_BUNDLED_SEMANTIC_LEXICON = "generic-state.v1";

const BUNDLED_LEXICONS: Record<string, SemanticLexicon> = {
  "generic-state": bundledGenericState as unknown as SemanticLexicon,
  "generic-state.v1": bundledGenericState as unknown as SemanticLexicon,
};

export function loadBundledSemanticLexicon(
  name = DEFAULT_BUNDLED_SEMANTIC_LEXICON,
): SemanticLexicon {
  const lexicon = BUNDLED_LEXICONS[name];
  if (lexicon === undefined) {
    throw new Error(`Bundled semantic lexicon "${name}" was not found.`);
  }

  const cloned = cloneLexicon(lexicon);
  return validateSemanticLexicon(cloned);
}

export function validateSemanticLexicon(
  lexicon: SemanticLexicon,
  options: SemanticLexiconValidationOptions = {},
): SemanticLexicon {
  if (
    lexicon == null ||
    typeof lexicon !== "object" ||
    Array.isArray(lexicon)
  ) {
    throw new Error("Semantic lexicon must be an object.");
  }

  if (!nonEmptyString(lexicon.version)) {
    throw new Error("Semantic lexicon must include a non-empty version.");
  }

  if (!Array.isArray(lexicon.entries) || lexicon.entries.length === 0) {
    throw new Error("Semantic lexicon must include at least one entry.");
  }

  const seenWords = new Set<string>();
  for (const [index, entry] of lexicon.entries.entries()) {
    validateLexiconEntry(entry, index);
    const normalizedWord = entry.word.trim().toLocaleLowerCase();
    if (seenWords.has(normalizedWord) && options.allowDuplicateWords !== true) {
      throw new Error(
        `Duplicate semantic lexicon word "${entry.word}" is not allowed.`,
      );
    }
    seenWords.add(normalizedWord);
  }

  return lexicon;
}

export function resolveSemanticState(
  input: SemanticStateInput,
  config: SemanticStateConfig = {},
): SemanticStateResult {
  const lexicon =
    config.lexicon === undefined
      ? loadBundledSemanticLexicon()
      : validateSemanticLexicon(config.lexicon);
  const dimensions = validateDimensionMap(
    input.dimensions,
    "Semantic state input dimensions",
  );
  const weights = validateWeights(config.weights);
  const priority = buildPriority(config.priority);
  const candidates = lexicon.entries
    .map((entry) => scoreEntry(entry, dimensions, weights))
    .sort((a, b) => compareCandidates(a, b, priority));
  const [top] = candidates as [SemanticCandidate, ...SemanticCandidate[]];
  const minConfidence =
    config.minConfidence === undefined
      ? 0
      : validateUnitValue(config.minConfidence, "minConfidence");
  const fallbackCandidate =
    config.fallbackWord === undefined
      ? undefined
      : candidates.find((candidate) =>
          sameWord(candidate.entry.word, config.fallbackWord as string),
        );
  const selected =
    top.confidence < minConfidence && fallbackCandidate !== undefined
      ? fallbackCandidate
      : top;
  const secondaryLimit = normalizeSecondaryLimit(config.secondaryLimit);
  const secondary = candidates
    .filter((candidate) => !sameWord(candidate.entry.word, selected.entry.word))
    .slice(0, secondaryLimit)
    .map((candidate) => ({
      word: candidate.entry.word,
      score: candidate.score,
      confidence: candidate.confidence,
      ...(candidate.entry.category === undefined
        ? {}
        : { category: candidate.entry.category }),
    }));

  return {
    word: selected.entry.word,
    confidence: selected.confidence,
    score: selected.score,
    lexiconVersion: lexicon.version,
    ...(selected.entry.category === undefined
      ? {}
      : { category: selected.entry.category }),
    secondary,
    breakdown: selected.breakdown,
  };
}

function validateLexiconEntry(entry: SemanticLexiconEntry, index: number) {
  if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `Semantic lexicon entry at index ${index} must be an object.`,
    );
  }

  if (!nonEmptyString(entry.word)) {
    throw new Error(
      `Semantic lexicon entry at index ${index} must include a valid word.`,
    );
  }

  validateDimensionMap(
    entry.dimensions,
    `Semantic lexicon entry "${entry.word}" dimensions`,
  );

  if (
    entry.polarity !== undefined &&
    !["positive", "neutral", "negative"].includes(entry.polarity)
  ) {
    throw new Error(
      `Semantic lexicon entry "${entry.word}" has an invalid polarity.`,
    );
  }

  if (entry.intensity !== undefined) {
    validateUnitValue(
      entry.intensity,
      `Semantic lexicon entry "${entry.word}" intensity`,
    );
  }

  if (entry.aliases !== undefined && !entry.aliases.every(nonEmptyString)) {
    throw new Error(
      `Semantic lexicon entry "${entry.word}" aliases must be non-empty strings.`,
    );
  }
}

function validateDimensionMap(value: Record<string, number>, label: string) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${label} must include at least one dimension.`);
  }

  const normalized: Record<string, number> = {};
  for (const [dimension, dimensionValue] of entries) {
    if (!nonEmptyString(dimension)) {
      throw new Error(`${label} contains an invalid dimension name.`);
    }
    normalized[dimension] = validateUnitValue(
      dimensionValue,
      `${label}.${dimension}`,
    );
  }

  return normalized;
}

function validateWeights(weights: Record<string, number> | undefined) {
  if (weights === undefined) return {};
  const normalized: Record<string, number> = {};
  for (const [dimension, weight] of Object.entries(weights)) {
    if (!nonEmptyString(dimension)) {
      throw new Error(
        "Semantic state weights contain an invalid dimension name.",
      );
    }
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(
        `Semantic state weight for "${dimension}" must be a non-negative number.`,
      );
    }
    normalized[dimension] = weight;
  }
  return normalized;
}

function validateUnitValue(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number between 0 and 1.`);
  }
  return value;
}

function scoreEntry(
  entry: SemanticLexiconEntry,
  inputDimensions: Record<string, number>,
  weights: Record<string, number>,
): SemanticCandidate {
  const dimensions = sortedDimensionNames(inputDimensions, entry.dimensions);
  let weightedScore = 0;
  let totalWeight = 0;
  const breakdown: Record<string, number> = {};

  for (const dimension of dimensions) {
    const weight = weights[dimension] ?? 1;
    if (weight === 0) {
      continue;
    }
    const inputValue = inputDimensions[dimension] ?? 0.5;
    const targetValue = entry.dimensions[dimension] ?? 0.5;
    const dimensionScore = round(1 - Math.abs(inputValue - targetValue));
    breakdown[dimension] = dimensionScore;
    weightedScore += dimensionScore * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    throw new Error(
      "Semantic state scoring requires at least one positive dimension weight.",
    );
  }

  const score = round(weightedScore / totalWeight);
  return {
    entry,
    score,
    confidence: score,
    breakdown,
  };
}

function sortedDimensionNames(
  inputDimensions: Record<string, number>,
  entryDimensions: Record<string, number>,
) {
  return Array.from(
    new Set([...Object.keys(inputDimensions), ...Object.keys(entryDimensions)]),
  ).sort();
}

function compareCandidates(
  left: SemanticCandidate,
  right: SemanticCandidate,
  priority: Record<string, number>,
) {
  if (right.score !== left.score) return right.score - left.score;

  const priorityDelta =
    priorityFor(right.entry.word, priority) -
    priorityFor(left.entry.word, priority);
  if (priorityDelta !== 0) return priorityDelta;

  return alphabetical(left.entry.word, right.entry.word);
}

function buildPriority(priority: SemanticStateConfig["priority"]) {
  if (priority === undefined) return {};
  if (Array.isArray(priority)) {
    return priority.reduce<Record<string, number>>((result, word, index) => {
      if (!nonEmptyString(word)) {
        throw new Error(
          "Semantic state priority words must be non-empty strings.",
        );
      }
      result[word.toLocaleLowerCase()] = priority.length - index;
      return result;
    }, {});
  }

  const normalized: Record<string, number> = {};
  for (const [word, value] of Object.entries(priority)) {
    if (!nonEmptyString(word)) {
      throw new Error("Semantic state priority contains an invalid word.");
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Semantic state priority for "${word}" must be numeric.`);
    }
    normalized[word.toLocaleLowerCase()] = value;
  }
  return normalized;
}

function normalizeSecondaryLimit(value: number | undefined) {
  if (value === undefined) return 3;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("secondaryLimit must be a non-negative integer.");
  }
  return value;
}

function priorityFor(word: string, priority: Record<string, number>) {
  return priority[word.toLocaleLowerCase()] ?? 0;
}

function sameWord(left: string, right: string) {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function alphabetical(left: string, right: string) {
  const normalizedLeft = left.toLocaleLowerCase();
  const normalizedRight = right.toLocaleLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  return 1;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function round(value: number) {
  return Number(value.toFixed(6));
}

function cloneLexicon(lexicon: SemanticLexicon): SemanticLexicon {
  return JSON.parse(JSON.stringify(lexicon)) as SemanticLexicon;
}
