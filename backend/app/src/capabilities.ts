import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const appCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["app.intent.handle.v1"],
    events: [],
    subscriptions: [],
  });
