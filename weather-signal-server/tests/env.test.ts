import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("env validation", () => {
  it("loads defaults and parses booleans", () => {
    const env = loadEnv({
      PORT: "8081",
      ENABLE_PROVIDER_OPENMETEO: "true",
      ENABLE_PROVIDER_NWS: "0",
      DEMO_MODE: "yes"
    });
    expect(env.PORT).toBe(8081);
    expect(env.ENABLE_PROVIDER_OPENMETEO).toBe(true);
    expect(env.ENABLE_PROVIDER_NWS).toBe(false);
    expect(env.DEMO_MODE).toBe(true);
  });

  it("throws on invalid port", () => {
    expect(() => loadEnv({ PORT: "0" })).toThrow();
  });
});
