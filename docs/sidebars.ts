import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "what-is-signal",
    {
      type: "category",
      label: "Level 1: Use Signal",
      items: ["start/quick-start"],
    },
    {
      type: "category",
      label: "Level 2: Build With Signal",
      items: ["build/first-app", "build/http-server", "examples/runnable-examples"],
    },
    {
      type: "category",
      label: "Level 3: Understand Signal",
      items: ["understand/core-ideas", "understand/architecture"],
    },
    {
      type: "category",
      label: "Level 4: Extend Signal",
      items: ["reference/api", "reference/protocol", "reference/errors"],
    },
    {
      type: "category",
      label: "Level 5: Contribute",
      items: ["contribute/repository-map", "contribute/infrastructure-grade-audit"],
    },
  ],
};

export default sidebars;
