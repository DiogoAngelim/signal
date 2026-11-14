/**
 * Narrow regression guard for the obfuscated payload signatures found in the
 * 2026-11-11 repository review. This is not a general malware scanner and does
 * not establish that the repository is free of other threats.
 *
 * A Git checkout scans all tracked files. Exported/Vercel source trees omit
 * .git; in that case scan all regular files actually present in the source
 * tree, excluding generated/dependency directories. Never silently succeed
 * with an empty scan, and never treat the source-tree fallback as a scan of
 * files excluded from the deployment archive.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const markers = [
  ["KAUi", "TqPiXdWs"].join(""),
  ["HjHs", "Hac$ObTDDGcJ"].join(""),
  ["ZNiyx", "RmnWHXYIQsqaASbzm"].join(""),
].map((value) => Buffer.from(value, "utf8"));

const excludedDirectories = new Set([
  ".git",
  ".vercel",
  ".pnpm",
  ".next",
  ".cache",
  ".turbo",
  "node_modules",
  "dist",
  "coverage",
]);

function availableSourceFiles(directory = ".", relative = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = relative ? join(relative, entry.name) : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...availableSourceFiles(absolutePath, relativePath));
      }
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function enumerateFiles() {
  try {
    return {
      files: execFileSync("git", ["ls-files", "-z"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).split("\0").filter(Boolean),
      scope: "tracked",
    };
  } catch (error) {
    // Only recover from a source archive without repository metadata.
    // Real Git failures and missing Git executables must still fail closed.
    if (!String(error.stderr ?? "").includes("not a git repository")) throw error;
    const files = availableSourceFiles();
    if (files.length === 0) throw new Error("Detached source scan has no files");
    return { files, scope: "available checkout" };
  }
}

const { files, scope } = enumerateFiles();
if (files.length === 0) throw new Error("Source scan has no files");
const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file);
  } catch (error) {
    // A tracked Git submodule or removed file can be absent in a checkout;
    // detached source entries are local regular files and must be readable.
    if (scope === "available checkout") throw error;
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
  console.error(`Unexpected obfuscated executable markers found in ${scope} files:`);
  for (const file of findings) console.error(` - ${file}`);
  process.exitCode = 1;
} else {
  console.log(`Obfuscated-payload scan passed (${files.length} ${scope} files checked).`);
}
