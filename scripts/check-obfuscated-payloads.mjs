/**
 * Narrow regression guard for the obfuscated payload signatures found in the
 * 2026-11-11 repository review. This is not a general malware scanner and does not establish that the repository is free of other threats.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const markers = [
  ["KAUi", "TqPiXdWs"].join(""),
  ["HjHs", "Hac$ObTDDGcJ"].join(""),
  ["ZNiyx", "RmnWHXYIQsqaASbzm"].join(""),
].map((value) => Buffer.from(value, "utf8"));

function listFilesWithoutGit(root) {
  const output = [];
  const ignored = new Set([".git", ".vercel", "node_modules", "dist", "coverage"]);
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignored.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) output.push(relative(root, absolute));
    }
  }
  visit(root);
  return output;
}

let files;
try {
  files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
} catch {
  // Vercel's source archive omits .git. Scan the deployed source tree instead
  // of failing before dependency installation.
  files = listFilesWithoutGit(process.cwd());
}

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
  console.log(`Obfuscated-payload scan passed (${files.length} ${process.env.CI ? "source" : "tracked"} files checked).`);
}
