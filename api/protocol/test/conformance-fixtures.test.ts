import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  signalCapabilitiesSchema,
  signalEnvelopeSchema,
  signalResultSchema,
} from "../src";

function readFixture(name: string) {
  return JSON.parse(
    readFileSync(
      join(__dirname, "../../../spec/fixtures", name),
      "utf8"
    )
  );
}

describe("conformance fixtures", () => {
  it("validates the reference envelope fixture", () => {
    expect(
      signalEnvelopeSchema.parse(readFixture("envelope.query.v1.json"))
    ).toMatchObject({
      name: "note.get.v1",
    });
  });

  it("validates the replayed result fixture", () => {
    expect(
      signalResultSchema.parse(readFixture("result.replayed.v1.json"))
    ).toMatchObject({
      ok: true,
      meta: {
        outcome: "replayed",
      },
    });
  });

  it("validates the capability fixture", () => {
    expect(
      signalCapabilitiesSchema.parse(
        readFixture("capabilities.reference.v1.json")
      )
    ).toMatchObject({
      features: {
        deadlines: true,
      },
    });
  });
});
