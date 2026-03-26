import { z } from "zod";
import { createProtocolError } from "@signal/protocol";
import { defineQuery } from "@signal/sdk-node";
import { createExampleRuntime } from "../support";

const noteInputSchema = z.object({
  noteId: z.string().min(1),
});

const noteResultSchema = z.object({
  noteId: z.string().min(1),
  body: z.string().min(1),
  version: z.literal("v1"),
});

export interface MinimalRuntimeState {
  notes: Map<
    string,
    {
      noteId: string;
      body: string;
      version: "v1";
    }
  >;
}

export function createMinimalRuntimeState(): MinimalRuntimeState {
  return {
    notes: new Map([
      [
        "note_1001",
        {
          noteId: "note_1001",
          body: "Signal keeps protocol contracts explicit.",
          version: "v1",
        },
      ],
    ]),
  };
}

export function registerMinimalRuntime(
  runtime = createExampleRuntime(),
  state = createMinimalRuntimeState()
) {
  runtime.registerQuery(
    defineQuery({
      name: "note.get.v1",
      kind: "query",
      description: "Read a single note from the in-process example store.",
      inputSchema: noteInputSchema,
      resultSchema: noteResultSchema,
      handler: (input) => {
        const note = state.notes.get(input.noteId);
        if (!note) {
          throw createProtocolError("NOT_FOUND", `Unknown note ${input.noteId}`);
        }

        return note;
      },
    })
  );

  return { runtime, state };
}

export async function runMinimalRuntimeDemo() {
  const { runtime, state } = registerMinimalRuntime();
  const result = await runtime.query("note.get.v1", {
    noteId: "note_1001",
  });

  return {
    result,
    capabilities: runtime.capabilities(),
    state,
  };
}

/* c8 ignore start */
if (require.main === module) {
  runMinimalRuntimeDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */
