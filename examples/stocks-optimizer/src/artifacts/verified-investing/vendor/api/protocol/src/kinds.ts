export const signalKinds = ["query", "mutation", "event"] as const;

export type SignalKind = (typeof signalKinds)[number];
