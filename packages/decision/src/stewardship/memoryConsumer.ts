import type { StewardshipEvidence, StewardshipLesson, StewardshipMemoryInput } from "./types";

export function consumeStewardshipMemory(memory?: StewardshipMemoryInput): {
  evidence: StewardshipEvidence[];
  lessons: StewardshipLesson[];
  missingMemory: boolean;
} {
  const evidence = dedupeById(memory?.evidence ?? []);
  const lessons = dedupeById(memory?.lessons ?? []).map((lesson) => ({
    ...lesson,
    repetition: Math.max(0, Math.round(Number(lesson.repetition) || 0)),
  }));

  return {
    evidence,
    lessons,
    missingMemory: evidence.length === 0 && lessons.length === 0,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = String(item.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}
