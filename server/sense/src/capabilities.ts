import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const senseCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["sense.execute.v1"],
    events: [],
    subscriptions: [],
  });
