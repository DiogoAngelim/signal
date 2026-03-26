import { registerEscrowRelease } from "@signal/examples/escrow-release";
import { registerPaymentCapture } from "@signal/examples/payment-capture";
import { registerUserOnboarding } from "@signal/examples/user-onboarding";
import type { SignalRuntime } from "@signal/runtime";

export function registerReferenceOperations(runtime: SignalRuntime) {
  const payment = registerPaymentCapture(runtime);
  const escrow = registerEscrowRelease(runtime);
  const user = registerUserOnboarding(runtime);

  return { payment, escrow, user };
}
