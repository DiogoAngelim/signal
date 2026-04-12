import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const sourceCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["source.normalize.v1"],
    events: [],
    subscriptions: [],
  });
