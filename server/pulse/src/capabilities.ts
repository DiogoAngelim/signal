import {
  type CapabilityDocument,
  createCapabilityDocument,
} from "@digelim/12.signal";

export const pulseCapabilities = (): CapabilityDocument =>
  createCapabilityDocument({
    queries: [],
    mutations: ["pulse.evaluate.v1"],
    events: ["pulse.frame.evaluated.v1", "pulse.frame.rejected.v1"],
    subscriptions: [],
  });
