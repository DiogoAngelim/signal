import type { MetricDescriptor } from "../types";

export class MetricRegistry {
  private readonly descriptors = new Map<string, MetricDescriptor>();

  register(descriptor: MetricDescriptor) {
    this.descriptors.set(descriptor.key, descriptor);
    return this;
  }

  get(key: string) {
    return this.descriptors.get(key);
  }

  all() {
    return Array.from(this.descriptors.values());
  }
}
