import type { ForecastCache, NormalizedForecast } from "./types";

export class InMemoryForecastCache implements ForecastCache {
  private readonly records = new Map<string, NormalizedForecast>();

  async get(key: string): Promise<NormalizedForecast | undefined> {
    return this.records.get(key);
  }

  async set(key: string, value: NormalizedForecast): Promise<void> {
    this.records.set(key, value);
  }

  clear(): void {
    this.records.clear();
  }
}

export function createInMemoryForecastCache(): InMemoryForecastCache {
  return new InMemoryForecastCache();
}
