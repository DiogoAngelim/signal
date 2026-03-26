import { describe, expect, it } from "vitest";
import {
  createExampleRuntime,
  createReplaySafeSubscriber,
} from "../support";
import { runMinimalRuntimeDemo } from "../minimal-runtime";
import {
  registerPostPublication,
  runPostPublicationDemo,
} from "../post-publication";
import { runHttpPostPublicationDemo } from "../http-post-publication";
import { runCapabilitiesInspectionDemo } from "../capabilities-inspection";
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
  it("keeps the minimal runtime example explicit and inspectable", async () => {
    const result = await runMinimalRuntimeDemo();

    expect(result.result.ok).toBe(true);
    expect(result.capabilities.queries.map((entry) => entry.name)).toEqual([
      "note.get.v1",
    ]);
  });

  it("keeps post publication replay-safe and conflict-aware", async () => {
    const result = await runPostPublicationDemo();

    expect(result.before.ok).toBe(true);
    expect(result.first.ok).toBe(true);
    expect(result.replay.ok).toBe(true);
    expect(result.replay.ok && result.replay.meta.outcome).toBe("replayed");
    expect(result.conflict.ok).toBe(false);
    expect(result.conflict.ok === false && result.conflict.error.code).toBe(
      "IDEMPOTENCY_CONFLICT"
    );
    expect(result.state.deliveredEventIds).toHaveLength(1);
    expect(result.capabilities.mutations[0]?.emits).toEqual(["post.published.v1"]);
  });

  it("supports the HTTP example and capability inspection example", async () => {
    const http = await runHttpPostPublicationDemo();
    const capabilities = runCapabilitiesInspectionDemo();

    expect(http.query.ok).toBe(true);
    expect(http.mutation.ok).toBe(true);
    expect(http.capabilities.protocol).toBe("signal.v1");
    expect(capabilities.publication.mutations.map((entry) => entry.name)).toEqual([
      "post.publish.v1",
    ]);
  });

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
    const post = registerPostPublication();
    const payment = registerPaymentCapture();
    const escrow = registerEscrowRelease();
    const user = registerUserOnboarding();

    const existingPost = await post.runtime.query("post.get.v1", {
      postId: "post_1001",
    });
    const missingPost = await post.runtime.query("post.get.v1", {
      postId: "missing",
    });
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

    expect(existingPost.ok).toBe(true);
    expect(missingPost.ok).toBe(false);
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
