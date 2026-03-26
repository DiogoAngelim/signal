import { describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  createReferenceRuntime: vi.fn(() => ({
    runtime: {
      capabilities: () => ({
        queries: [],
        mutations: [],
        publishedEvents: [],
      }),
    },
  })),
  createReferenceServer: vi.fn(() => ({
    listen: vi.fn(async () => undefined),
  })),
  registerHealthRoute: vi.fn(),
}));

vi.mock("../src/lib/runtime", () => runtimeMock);
vi.mock("../src/routes/health", () => ({
  registerHealthRoute: runtimeMock.registerHealthRoute,
}));

import { startReferenceServer } from "../src/app";

describe("reference app bootstrap", () => {
  it("starts the reference server using the configured port", async () => {
    process.env.SIGNAL_HTTP_PORT = "4123";

    const result = await startReferenceServer();

    expect(runtimeMock.createReferenceRuntime).toHaveBeenCalled();
    expect(runtimeMock.createReferenceServer).toHaveBeenCalled();
    expect(runtimeMock.registerHealthRoute).toHaveBeenCalled();
    expect(result.port).toBe(4123);
    expect(result.capabilities).toEqual({
      queries: [],
      mutations: [],
      publishedEvents: [],
    });

    delete process.env.SIGNAL_HTTP_PORT;
  });
});
