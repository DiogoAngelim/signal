import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    "introduction",
    {
      type: "category",
      label: "Concepts",
      items: [
        "concepts/queries",
        "concepts/mutations",
        "concepts/events",
        "concepts/idempotency",
        "concepts/versioning",
        "concepts/order-and-replay",
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: [
        "reference/envelope",
        "reference/capabilities",
        "reference/errors",
        "reference/conformance",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/quickstart",
        "guides/define-your-first-query",
        "guides/define-your-first-mutation",
        "guides/emit-and-consume-events",
        "guides/http-binding",
        "guides/in-process-runtime",
      ],
    },
    {
      type: "category",
      label: "Examples",
      items: [
        "examples/payment-capture-flow",
        "examples/escrow-release-flow",
        "examples/user-onboarding-flow",
      ],
    },
  ],
};

export default sidebars;
