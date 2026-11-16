import type { PracticeChoice } from "./lumina-journey";

/**
 * Prototype-only continuity. Saving is an explicit Practice action.
 * Stored records are not real holdings and never leave this browser tab.
 * Session storage intentionally does not synchronize between devices.
 */
export const LUMINA_PRACTICE_SESSION_KEY = "lumina-preview-practice-v1";
export const MAX_PRACTICE_CHOICES = 25;
const MAX_SERIALIZED_LENGTH = 24000;

export interface PracticeSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const GOALS = new Set(["your money", "your home", "your future", "your travels"]);
const HORIZONS = new Set(["soon", "middle", "later", "unsure"]);

function isChoice(value: unknown): value is PracticeChoice {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && item.id.length > 0 && item.id.length <= 100
    && /^[a-zA-Z0-9_.:-]+$/.test(item.id)
    && typeof item.at === "string" && item.at.length <= 40
    && Number.isFinite(Date.parse(item.at))
    && typeof item.amount === "number" && Number.isFinite(item.amount)
    && item.amount >= 100 && item.amount <= 10_000_000
    && typeof item.exposedPercent === "number" && Number.isInteger(item.exposedPercent)
    && item.exposedPercent >= 0 && item.exposedPercent <= 100
    && item.exposedPercent % 5 === 0
    && item.accessiblePercent === 100 - item.exposedPercent
    && typeof item.goal === "string" && GOALS.has(item.goal)
    && (item.horizon === null || (typeof item.horizon === "string" && HORIZONS.has(item.horizon)))
    && item.provenance === "illustrative" && item.executed === false;
}

export function previewSessionStorage(): PracticeSessionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPracticeChoices(
  storage: PracticeSessionStorage | null = previewSessionStorage(),
): PracticeChoice[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LUMINA_PRACTICE_SESSION_KEY);
    if (!raw || raw.length > MAX_SERIALIZED_LENGTH) return [];
    const record: unknown = JSON.parse(raw);
    if (typeof record !== "object" || record === null) return [];
    const envelope = record as Record<string, unknown>;
    if (envelope.version !== 1 || !Array.isArray(envelope.choices)) return [];
    return envelope.choices.filter(isChoice).slice(0, MAX_PRACTICE_CHOICES);
  } catch {
    // A blocked or corrupt browser session must never block the welcome screen.
    return [];
  }
}

export function writePracticeChoices(
  choices: readonly PracticeChoice[],
  storage: PracticeSessionStorage | null = previewSessionStorage(),
): boolean {
  if (!storage) return false;
  try {
    const valid = choices.filter(isChoice).slice(0, MAX_PRACTICE_CHOICES);
    if (valid.length === 0) {
      storage.removeItem(LUMINA_PRACTICE_SESSION_KEY);
    } else {
      storage.setItem(LUMINA_PRACTICE_SESSION_KEY, JSON.stringify({
        version: 1, choices: valid,
      }));
    }
    return true;
  } catch {
    // Still usable in memory, but cannot claim cross-refresh continuity.
    return false;
  }
}
