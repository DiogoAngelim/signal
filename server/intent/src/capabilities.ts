import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const intentCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["intent.normalize.v1"],
    events: [],
    subscriptions: [],
  });
