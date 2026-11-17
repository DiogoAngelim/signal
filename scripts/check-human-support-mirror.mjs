import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canonical = new URL('../packages/decision/src/human-support.ts', import.meta.url);
const mirror = new URL('../examples/stocks-optimizer/src/artifacts/signal-decision/src/human-support.ts', import.meta.url);
assert.ok(readFileSync(canonical).equals(readFileSync(mirror)), 'Standalone Lumina human-support policy must be byte-identical to Signal canonical source.');
for (const path of ['../packages/decision/src/core.ts', '../examples/stocks-optimizer/src/artifacts/signal-decision/src/core.ts']) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const name of ['buildHumanSupportPlan', 'shouldUseSupportOnly', 'observeExplicitSupportCue', 'inspectSupportResponse', 'SupportPreferences']) {
    assert.ok(text.includes(name), path + ' must export ' + name);
  }
  for (const name of ['parsePracticeAllocation', 'describeMeaningfulMoment']) {
    assert.ok(!text.includes(name), path + ' must keep product-owned ' + name + ' outside core');
  }
}
console.log('Human-support canonical/mirror bytes and public exports match.');
