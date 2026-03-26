import { describe, expect, it } from "vitest";
import {
  createExampleRuntime,
  createReplaySafeSubscriber,
} from "../support";
import {
  registerPaymentCapture,
  runPaymentCaptureDemo,
} from "../payment-capture";
import {
  registerEscrowRelease,
  runEscrowReleaseDemo,
} from "../escrow-release";
import {
  registerUserOnboarding,
  runUserOnboardingDemo,
} from "../user-onboarding";
import * as examples from "../index";

describe("example flow", () => {
  it("keeps payment capture replay-safe", async () => {
    const result = await runPaymentCaptureDemo();

    expect(result.first.ok).toBe(true);
    expect(result.replay.ok).toBe(true);
    expect(result.state.payments.get("pay_1001")?.captureAttempts).toBe(1);
    expect(result.state.ledgerMessages).toHaveLength(1);
  });

  it("keeps escrow release replay-safe", async () => {
    const result = await runEscrowReleaseDemo();

    expect(result.first.ok).toBe(true);
    expect(result.replay.ok).toBe(true);
    expect(result.state.escrows.get("esc_2001")?.releaseAttempts).toBe(1);
    expect(result.state.releaseLog).toHaveLength(1);
  });

  it("keeps onboarding replay-safe", async () => {
    const result = await runUserOnboardingDemo();

    expect(result.first.ok).toBe(true);
    expect(result.replay.ok).toBe(true);
    expect(result.state.users.get("user_3001")?.onboardAttempts).toBe(1);
    expect(result.state.welcomeMessages).toHaveLength(1);
  });

  it("exposes the example runtime helpers", async () => {
    const runtime = createExampleRuntime();
    const seen: string[] = [];
    runtime.subscribe(
      "support.event.v1",
      createReplaySafeSubscriber(async (event) => {
        seen.push(event.messageId);
      })
    );

    expect(runtime.runtimeName).toBe("signal-example");
    expect(seen).toHaveLength(0);
    expect(examples.createExampleRuntime).toBe(createExampleRuntime);
  });

  it("supports direct registrations for the flow examples", async () => {
    const payment = registerPaymentCapture();
    const escrow = registerEscrowRelease();
    const user = registerUserOnboarding();

    const existingPayment = await payment.runtime.query("payment.status.v1", {
      paymentId: "pay_1001",
    });
    const missingPayment = await payment.runtime.query("payment.status.v1", {
      paymentId: "missing",
    });
    const existingEscrow = await escrow.runtime.query("escrow.status.v1", {
      escrowId: "esc_2001",
    });
    const missingEscrow = await escrow.runtime.query("escrow.status.v1", {
      escrowId: "missing",
    });
    const existingUser = await user.runtime.query("user.profile.v1", {
      userId: "user_3001",
    });
    const missingUser = await user.runtime.query("user.profile.v1", {
      userId: "missing",
    });

    expect(existingPayment.ok).toBe(true);
    expect(missingPayment.ok).toBe(false);
    expect(existingEscrow.ok).toBe(true);
    expect(missingEscrow.ok).toBe(false);
    expect(existingUser.ok).toBe(true);
    expect(missingUser.ok).toBe(false);
  });

  it("covers example error paths and already-processed branches", async () => {
    const payment = registerPaymentCapture();
    const escrow = registerEscrowRelease();
    const user = registerUserOnboarding();

    const paymentNotFound = await payment.runtime.query("payment.status.v1", {
      paymentId: "missing",
    });
    const paymentConflict = await payment.runtime.mutation(
      "payment.capture.v1",
      { paymentId: "pay_1001", amount: 999, currency: "USD" },
      { idempotencyKey: "payment-conflict-1" }
    );
    const paymentMissingMutation = await payment.runtime.mutation(
      "payment.capture.v1",
      { paymentId: "missing", amount: 120, currency: "USD" },
      { idempotencyKey: "payment-missing-1" }
    );
    const firstPaymentCapture = await payment.runtime.mutation(
      "payment.capture.v1",
      { paymentId: "pay_1001", amount: 120, currency: "USD" },
      { idempotencyKey: "payment-capture-1" }
    );
    const alreadyCapturedPayment = await payment.runtime.mutation(
      "payment.capture.v1",
      { paymentId: "pay_1001", amount: 120, currency: "USD" },
      { idempotencyKey: "payment-capture-2" }
    );

    const escrowNotFound = await escrow.runtime.query("escrow.status.v1", {
      escrowId: "missing",
    });
    const escrowMissingMutation = await escrow.runtime.mutation(
      "escrow.release.v1",
      { escrowId: "missing" },
      { idempotencyKey: "escrow-missing-1" }
    );
    const firstEscrowRelease = await escrow.runtime.mutation(
      "escrow.release.v1",
      { escrowId: "esc_2001" },
      { idempotencyKey: "escrow-release-1" }
    );
    const alreadyReleasedEscrow = await escrow.runtime.mutation(
      "escrow.release.v1",
      { escrowId: "esc_2001" },
      { idempotencyKey: "escrow-release-2" }
    );

    const userNotFound = await user.runtime.query("user.profile.v1", {
      userId: "missing",
    });
    const userMissingMutation = await user.runtime.mutation(
      "user.onboard.v1",
      { userId: "missing", email: "missing@example.com", plan: "free" },
      { idempotencyKey: "user-missing-1" }
    );
    const firstOnboard = await user.runtime.mutation(
      "user.onboard.v1",
      { userId: "user_3001", email: "ada@example.com", plan: "pro" },
      { idempotencyKey: "user-onboard-1" }
    );
    const alreadyOnboardedUser = await user.runtime.mutation(
      "user.onboard.v1",
      { userId: "user_3001", email: "ada@example.com", plan: "pro" },
      { idempotencyKey: "user-onboard-2" }
    );

    expect(paymentNotFound.ok).toBe(false);
    expect(paymentConflict.ok).toBe(false);
    expect(paymentMissingMutation.ok).toBe(false);
    expect(firstPaymentCapture.ok).toBe(true);
    expect(alreadyCapturedPayment.ok).toBe(true);
    expect(escrowNotFound.ok).toBe(false);
    expect(escrowMissingMutation.ok).toBe(false);
    expect(firstEscrowRelease.ok).toBe(true);
    expect(alreadyReleasedEscrow.ok).toBe(true);
    expect(userNotFound.ok).toBe(false);
    expect(userMissingMutation.ok).toBe(true);
    expect(firstOnboard.ok).toBe(true);
    expect(alreadyOnboardedUser.ok).toBe(true);
  });
});
