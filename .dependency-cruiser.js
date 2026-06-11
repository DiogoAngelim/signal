/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ─── PORTS LAYER: must not import from any other layer ───
    // ports is pure interfaces — no implementations, no runtime/domain/interface imports
    {
      name: "ports-no-runtime",
      comment: "Ports layer must not import from Runtime layer",
      severity: "error",
      from: { path: "^api/ports" },
      to: { path: "^(api/runtime|api/sdk-node|api/binding-http|server/db)" },
    },
    {
      name: "ports-no-optimizer",
      comment: "Ports layer must not import from Optimizer layer",
      severity: "error",
      from: { path: "^api/ports" },
      to: { path: "^(packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state)" },
    },
    {
      name: "ports-no-kernel",
      comment: "Ports layer must not import from kernel (use @signal/protocol for shared types)",
      severity: "error",
      from: { path: "^api/ports" },
      to: { path: "^packages/kernel" },
    },
    {
      name: "ports-no-posttrade",
      comment: "Ports layer must not import from Post-Trade layer",
      severity: "error",
      from: { path: "^api/ports" },
      to: { path: "^(signal-cli)" },
    },

    // ─── SIGNAL LAYER: must not import from downstream layers ───
    // packages/kernel and api/protocol are Signal layer — no downstream imports
    {
      name: "signal-no-optimizer",
      comment: "Signal layer must not import from Optimizer layer",
      severity: "error",
      from: { path: "^(packages/kernel|api/protocol)" },
      to: { path: "^(packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state)" },
    },
    {
      name: "signal-no-execution",
      comment: "Signal layer must not import from Execution layer",
      severity: "error",
      from: { path: "^(packages/kernel|api/protocol)" },
      to: { path: "^(api/runtime|api/sdk-node|api/binding-http|server/db)" },
    },
    {
      name: "signal-no-posttrade",
      comment: "Signal layer must not import from Post-Trade layer",
      severity: "error",
      from: { path: "^(packages/kernel|api/protocol)" },
      to: { path: "^(signal-cli)" },
    },

    // ─── OPTIMIZER LAYER: must not import from kernel or downstream layers ───
    // NOTE: Optimizer → api/protocol (type-only) is ALLOWED (shared contracts)
    {
      name: "optimizer-no-kernel",
      comment: "Optimizer layer must not import from kernel (use @signal/protocol for shared types)",
      severity: "error",
      from: { path: "^(packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state)" },
      to: { path: "^packages/kernel" },
    },
    {
      name: "optimizer-no-execution",
      comment: "Optimizer layer must not import from Execution layer",
      severity: "error",
      from: { path: "^(packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state)" },
      to: { path: "^(api/runtime|api/sdk-node|api/binding-http|server/db)" },
    },
    {
      name: "optimizer-no-posttrade",
      comment: "Optimizer layer must not import from Post-Trade layer",
      severity: "error",
      from: { path: "^(packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state)" },
      to: { path: "^(signal-cli)" },
    },

    // ─── EXECUTION LAYER: must not import from kernel or optimizer ───
    // NOTE: Execution → api/protocol is ALLOWED (shared contracts)
    // NOTE: Execution → api/runtime is ALLOWED (sdk-node → runtime)
    {
      name: "execution-no-kernel",
      comment: "Execution layer must not import from kernel (use @signal/protocol for shared types)",
      severity: "error",
      from: { path: "^(api/runtime|api/sdk-node|api/binding-http|server/db)" },
      to: { path: "^packages/kernel" },
    },
    {
      name: "execution-no-optimizer",
      comment: "Execution layer must not import from Optimizer layer",
      severity: "error",
      from: { path: "^(api/runtime|api/sdk-node|api/binding-http|server/db)" },
      to: { path: "^(packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state)" },
    },

    // ─── POST-TRADE LAYER: must not import from any upstream layer ───
    {
      name: "posttrade-no-upstream",
      comment: "Post-Trade layer must not import from any upstream layer",
      severity: "error",
      from: { path: "^(signal-cli)" },
      to: { path: "^(packages/kernel|api/protocol|packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state|api/runtime|api/sdk-node|api/binding-http|server/db)" },
    },

    // ─── CIRCULAR DEPENDENCIES ───
    {
      name: "no-circular",
      comment: "Circular dependencies are forbidden",
      severity: "error",
      from: {},
      to: { circular: true },
    },

    // ─── RUNTIME PURITY: runtime must not import transport or domain ───
    {
      name: "runtime-no-transport",
      comment: "Runtime must not import HTTP or SDK transport layers",
      severity: "error",
      from: { path: "^api/runtime/src" },
      to: { path: "^(api/sdk-node|api/binding-http)" },
    },
    {
      name: "runtime-no-domain",
      comment: "Runtime must not import domain logic directly (use DecisionPort)",
      severity: "error",
      from: { path: "^api/runtime/src" },
      to: { path: "^(packages/agency|packages/commitment|packages/decision|packages/decision-memory|packages/semantic-state)" },
    },
    {
      name: "runtime-no-server",
      comment: "Runtime must not import server/db (infrastructure coupling)",
      severity: "error",
      from: { path: "^api/runtime/src" },
      to: { path: "^server/db" },
    },
  ],

  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: ["node_modules"],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "./tsconfig.base.json",
    },
  },
};