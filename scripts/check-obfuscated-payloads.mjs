import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const markers = [
  ["KAUi", "TqPiXdWs"].join(""),
  ["HjHs", "Hac$ObTDDGcJ"].join(""),
  ["ZNiyx", "RmnWHXYIQsqaASbzm"].join(""),
].map((value) => Buffer.from(value, "utf8"));

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file);
  } catch {
    continue;
  }
  for (const marker of markers) {
    if (content.indexOf(marker) !== -1) {
      findings.push(file);
      break;
    }
  }
}

if (findings.length > 0) {
  console.error("Unexpected obfuscated executable markers found in tracked files:");
  for (const file of findings) console.error(` - ${file}`);
  process.exitCode = 1;
} else {
  console.log(`Obfuscated-payload scan passed (${files.length} tracked files checked).`);
}
