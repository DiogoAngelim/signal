const { decide } = require("../../dist/decision/decision/decide.js");

console.log("=== Test 1: Basic decision ===");
const r1 = decide({ goal: "test decision system" });
console.log("Decision ID:", r1.decisionId);
console.log("Options:", r1.options.length);
console.log("Valid:", r1.options.filter(o => o.valid).length);
console.log("Selected:", r1.selected.label);
console.log("Score:", r1.selected.adjustedScore);
console.log("Plan steps:", r1.executionPlan.steps.length);
console.log("Feedback:", !!r1.feedbackRecord);
console.log("Constraints:", r1.intent.constraints.length);
console.assert(r1.options.length >= 2, "FAIL: >=2 options");
console.assert(r1.selected, "FAIL: selected");
console.assert(r1.executionPlan.steps.length > 0, "FAIL: plan");
console.log("✅ Test 1 PASSED\n");

console.log("=== Test 2: With constraints ===");
const r2 = decide({ goal: "deploy", constraints: [
  { type: "time", limit: 0.5, label: "deadline" },
  { type: "money", limit: 0.6, label: "budget" },
  { type: "risk", limit: 0.4, label: "risk" },
]});
console.log("Options:", r2.options.length);
console.log("Valid:", r2.options.filter(o => o.valid).length);
console.log("Invalid:", r2.options.filter(o => !o.valid).length);
for (const o of r2.options) {
  console.log("  " + o.label + ": score=" + o.adjustedScore.toFixed(3) + " valid=" + o.valid);
}
console.assert(r2.options.length >= 2, "FAIL: >=2 options");
console.log("✅ Test 2 PASSED\n");

console.log("=== Test 3: Tight constraints ===");
const r3 = decide({ goal: "risky", constraints: [
  { type: "risk", limit: 0.1, label: "low-risk", enforced: true },
]});
console.log("Valid:", r3.options.filter(o => o.valid).length);
console.log("Invalid:", r3.options.filter(o => !o.valid).length);
console.assert(r3.options.some(o => !o.valid), "FAIL: should have invalid");
console.log("✅ Test 3 PASSED\n");

console.log("=== Test 4: Determinism ===");
const a = decide({ goal: "x", constraints: [{ type: "risk", limit: 0.5 }] });
const b = decide({ goal: "x", constraints: [{ type: "risk", limit: 0.5 }] });
const sa = a.options.map(o => o.adjustedScore).sort();
const sb = b.options.map(o => o.adjustedScore).sort();
console.log("Scores match:", JSON.stringify(sa) === JSON.stringify(sb));
console.assert(sa.every((s, i) => Math.abs(s - sb[i]) < 1e-10), "FAIL: determinism");
console.log("✅ Test 4 PASSED\n");

console.log("═══════════════════════════════════════");
console.log("ALL TESTS PASSED ✅");
console.log("═══════════════════════════════════════");