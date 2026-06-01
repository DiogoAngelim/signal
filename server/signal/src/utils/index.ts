export const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const nowIso = (): string => new Date().toISOString();

export const parseIsoDate = (value: string): Date => new Date(value);

export const isValidDate = (date: Date): boolean =>
  !Number.isNaN(date.getTime());
