import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const coreCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["core.decide.v1"],
    events: [],
    subscriptions: [],
  });
