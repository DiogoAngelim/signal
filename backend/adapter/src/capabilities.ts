import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const adapterCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["adapter.http.handle.v1"],
    events: [],
    subscriptions: [],
  });
