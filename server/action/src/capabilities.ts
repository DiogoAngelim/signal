import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const actionCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["action.execute.v1"],
    events: [],
    subscriptions: [],
  });
