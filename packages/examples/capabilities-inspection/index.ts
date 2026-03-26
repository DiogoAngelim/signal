import { registerMinimalRuntime } from "../minimal-runtime";
import { registerPostPublication } from "../post-publication";

export function runCapabilitiesInspectionDemo() {
  const minimal = registerMinimalRuntime();
  const publication = registerPostPublication();

  return {
    minimal: minimal.runtime.capabilities(),
    publication: publication.runtime.capabilities(),
  };
}

/* c8 ignore start */
if (require.main === module) {
  console.log(JSON.stringify(runCapabilitiesInspectionDemo(), null, 2));
}
/* c8 ignore end */
