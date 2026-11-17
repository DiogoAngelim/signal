/**
 * Narrow regression guard for suspicious obfuscated source signatures.
 *
 * In GitHub Actions the git index is authoritative. Vercel deliberately
 * excludes .git from its source bundle, so the install-time guard scans the
 * actual upload tree instead. Never skip security scanning merely because
 * Git metadata is absent.
 *
 * This is not a general malware scanner.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const markers = [
  ["KAUi", "TqPiXdWs"].join(""),
  ["HjHs", "Hac$ObTDDGcJ"].join(""),
  ["ZNiyx", "RmnWHXYIQsqaASbzm"].join(""),
].map((value) => Buffer.from(value, "utf8"));

const omittedDirectories = new Set([
  ".git", "node_modules", ".vercel", ".next", ".cache", ".vite",
  "dist", "coverage", ".coverage",
]);

function uploadTreeFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // Never follow potentially external or cyclic symlinked directories.
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!omittedDirectories.has(entry.name)) visit(fullPath);
        continue;
      }
      if (entry.isFile()) files.push(path.relative(root, fullPath));
    }
  }
  visit(root);
  return files;
}

let files;
let source;
const gitlinks = new Set();
const cwd = process.cwd();
if (existsSync(path.join(cwd, ".git"))) {
  try {
    files = execFileSync("git", ["ls-files", "-z"], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).split("\0").filter(Boolean);
    source = "git index";
    // Gitlinks have mode 160000 and represent submodule commits, not readable
    // files. An orphaned or unavailable submodule must not be mistaken for an
    // unreadable ordinary source file. Scan all checked-out source files.
    const entries = execFileSync("git", ["ls-files", "--stage", "-z"], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).split("\0").filter(Boolean);
    for (const entry of entries) {
      const separator = entry.indexOf("\t");
      if (separator < 0) throw new Error("Unexpected git index entry");
      if (entry.startsWith("160000 ")) gitlinks.add(entry.slice(separator + 1));
    }
  } catch (error) {
    // Vercel's .vercelignore removes the CONTENTS of .git, but can leave a
    // vestigial .git directory. Git then reports "not a git repository".
    // Fall back only for that exact missing-metadata case; all other errors
    // must still stop the install.
    const stderr = String(error?.stderr ?? "");
    if (!/not a git repository|Stopping at filesystem boundary/i.test(stderr)) throw error;
    files = uploadTreeFiles(cwd);
    source = "gitless deployment tree";
  }
} else {
  files = uploadTreeFiles(cwd);
  source = "gitless deployment tree";
}

if (files.length === 0) {
  console.error("Obfuscated-payload scan failed: no files found to inspect.");
  process.exitCode = 1;
} else {
  const findings = [];
  for (const file of files) {
    if (gitlinks.has(file)) continue;
    let content;
    try {
      content = readFileSync(path.join(cwd, file));
    } catch {
      // Do not silently treat an unreadable upload as safe.
      findings.push(file + " (unreadable)");
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
    console.error("Unexpected executable payload markers or unreadable files:");
    for (const file of findings) console.error(" - " + file);
    process.exitCode = 1;
  } else {
    console.log("Obfuscated-payload scan passed (" + files.length + " " + source + " files checked).");
  }
}
