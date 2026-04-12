export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(value: string | number | Date | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

export function parseIso(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return undefined;
  }
  return time;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
