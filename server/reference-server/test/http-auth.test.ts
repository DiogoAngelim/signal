import { describe, expect, it } from "vitest";
import { createReferenceAuthResolver } from "../src/lib/runtime";

describe("reference HTTP authentication resolver", () => {
  it("does not create an identity when the configured secret is absent", () => {
    const resolver = createReferenceAuthResolver(undefined);
    expect(resolver({ headers: { authorization: "Bearer anything" } } as never)).toBeUndefined();
  });

  it("rejects missing, malformed, and incorrect bearer credentials", () => {
    const resolver = createReferenceAuthResolver("correct-secret");
    expect(resolver({ headers: {} } as never)).toBeUndefined();
    expect(resolver({ headers: { authorization: "Basic correct-secret" } } as never)).toBeUndefined();
    expect(resolver({ headers: { authorization: "Bearer wrong-secret" } } as never)).toBeUndefined();
  });

  it("maps a verified bearer credential to the fixed reference tenant identity", () => {
    const resolver = createReferenceAuthResolver("correct-secret");
    expect(resolver({
      headers: { authorization: "Bearer correct-secret" },
    } as never)).toEqual({
      actor: { id: "ops_alice", type: "operator", roles: ["payments"] },
      subject: "tenant:tenant_acme",
      scopes: ["payment:capture", "payment:read", "tenant:tenant_acme"],
    });
  });
});
