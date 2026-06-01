import { createProtocolError } from "@signal/protocol";
import { defineEvent, defineMutation, defineQuery } from "@signal/sdk-node";
import {
  createExampleRuntime,
  createReplaySafeSubscriber,
  ensureExampleSelfTraining,
  instrumentExampleEvent,
  instrumentExampleMutation,
  instrumentExampleQuery,
  instrumentExampleSubscriber,
  type ExampleStateWithSelfTraining,
} from "../support";
import {
  userOnboardInputSchema,
  userOnboardedEventSchema,
  userProfileInputSchema,
  userProfileResultSchema,
} from "./schemas";

export interface UserRecord {
  userId: string;
  email: string;
  plan: "free" | "pro";
  status: "draft" | "onboarded";
  onboardedAt: string | null;
  onboardAttempts: number;
}

export interface UserOnboardingState extends ExampleStateWithSelfTraining {
  users: Map<string, UserRecord>;
  welcomeMessages: string[];
}

export function createUserOnboardingState(): UserOnboardingState {
  return {
    users: new Map([
      [
        "user_3001",
        {
          userId: "user_3001",
          email: "ada@example.com",
          plan: "pro",
          status: "draft",
          onboardedAt: null,
          onboardAttempts: 0,
        },
      ],
    ]),
    welcomeMessages: [],
  };
}

export function registerUserOnboarding(
  runtime = createExampleRuntime(),
  state = createUserOnboardingState()
) {
  const selfTraining = ensureExampleSelfTraining(state, "user-onboarding");

  runtime.registerQuery(
    defineQuery({
      name: "user.profile.v1",
      kind: "query",
      inputSchema: userProfileInputSchema,
      resultSchema: userProfileResultSchema,
      handler: instrumentExampleQuery(selfTraining, "user.profile.v1", (input) => {
        const user = state.users.get(input.userId);
        if (!user) {
          throw createProtocolError("NOT_FOUND", `Unknown user ${input.userId}`);
        }
        return user;
      }),
    })
  );

  runtime.registerEvent(
    defineEvent({
      name: "user.onboarded.v1",
      kind: "event",
      inputSchema: userOnboardedEventSchema,
      resultSchema: userOnboardedEventSchema,
      /* c8 ignore next */
      handler: instrumentExampleEvent(selfTraining, "user.onboarded.v1", (payload) => payload),
    })
  );

  runtime.registerMutation(
    defineMutation({
      name: "user.onboard.v1",
      kind: "mutation",
      idempotency: "required",
      inputSchema: userOnboardInputSchema,
      resultSchema: userProfileResultSchema,
      handler: instrumentExampleMutation(selfTraining, "user.onboard.v1", async (input, context) => {
        const user = state.users.get(input.userId);
        if (!user) {
          state.users.set(input.userId, {
            userId: input.userId,
            email: input.email,
            plan: input.plan,
            status: "draft",
            onboardedAt: null,
            onboardAttempts: 0,
          });
        }

        const record = state.users.get(input.userId)!;

        if (record.status === "onboarded") {
          return record;
        }

        record.email = input.email;
        record.plan = input.plan;
        record.status = "onboarded";
        record.onboardedAt = new Date().toISOString();
        record.onboardAttempts += 1;

        await context.emit("user.onboarded.v1", {
          userId: record.userId,
          email: record.email,
          plan: record.plan,
          onboardedAt: record.onboardedAt,
        });

        return record;
      }),
    })
  );

  runtime.subscribe(
    "user.onboarded.v1",
    createReplaySafeSubscriber(instrumentExampleSubscriber(selfTraining, "user.onboarded.v1", async (event) => {
      state.welcomeMessages.push(event.messageId);
    }))
  );

  return { runtime, state };
}

export async function runUserOnboardingDemo() {
  const { runtime, state } = registerUserOnboarding();
  const first = await runtime.mutation(
    "user.onboard.v1",
    { userId: "user_3001", email: "ada@example.com", plan: "pro" },
    { idempotencyKey: "onboard-user_3001-001" }
  );
  const replay = await runtime.mutation(
    "user.onboard.v1",
    { userId: "user_3001", email: "ada@example.com", plan: "pro" },
    { idempotencyKey: "onboard-user_3001-001" }
  );

  return { first, replay, state };
}

/* c8 ignore start */
if (require.main === module) {
  runUserOnboardingDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */
