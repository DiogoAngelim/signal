import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const resultCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["result.record.v1"],
    events: [],
    subscriptions: [],
  });
