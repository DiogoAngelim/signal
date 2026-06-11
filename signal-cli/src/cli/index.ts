#!/usr/bin/env node
/**
 * SIGNAL Local Verification System — CLI Entrypoint (v19)
 *
 * Command routing via process.argv.
 * Commands: verify, replay, test, build, init, audit, install-hooks
 */

import { executeInit } from "../commands/init.js";
import { executeVerify } from "../commands/verify.js";
import { executeReplay } from "../commands/replay.js";
import { executeTest } from "../commands/test.js";
import { executeBuild } from "../commands/build.js";
import { executeAudit } from "../commands/audit.js";
import { executeInstallHooks } from "../commands/installHooks.js";

// ─── Argument Parsing ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  command: string;
  args: string[];
  flags: Record<string, string>;
} {
  // argv[0] = node, argv[1] = script, argv[2] = command
  const rawCommand = argv[2] ?? "";

  // Handle --help at any position
  if (rawCommand === "--help" || rawCommand === "-h") {
    return { command: "help", args: [], flags: {} };
  }

  const command = rawCommand;
  const rest = argv.slice(3);

  const args: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++; // skip value
      } else {
        flags[key] = "true";
      }
    } else if (arg === "--") {
      // Everything after -- is the subcommand
      args.push(...rest.slice(i + 1));
      break;
    } else {
      args.push(arg);
    }
  }

  return { command, args, flags };
}

// ─── Help ───────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
SIGNAL — Local Deterministic Verification CLI

Usage:
  signal <command> [options]

Commands:
  init              Initialize .signal/ directory and import hardening checkpoints
  verify            Validate phase chain integrity, artifact hashes, and replay consistency
  replay            Recompute phase hashes and compare with stored state
  test              Wrap test execution with pre/post verification
  build             Wrap build execution with verification and output hashing
  audit             Full verification suite: verify + replay + invariants + proof generation
  install-hooks     Inject signal scripts into package.json

Options:
  --from <n>        Starting phase for replay (default: 0)
  --to <n>          Ending phase for replay (default: last phase)
  --command <cmd>   Override test/build command
  --output <dir>    Build output directory (default: dist)
  --help            Show this help message

Examples:
  signal init
  signal verify
  signal replay --from 0 --to 15
  signal test
  signal test -- echo "custom test"
  signal build
  signal build --command "pnpm build:library" --output lib
  signal audit
  signal install-hooks

Exit Codes:
  0 = success / valid
  1 = failure / invalid
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const { command, args, flags } = parseArgs(process.argv);

  if (flags["help"] || command === "" || command === "help") {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case "init": {
      executeInit();
      process.exit(0);
    }

    case "verify": {
      const valid = executeVerify();
      process.exit(valid ? 0 : 1);
    }

    case "replay": {
      const from = Number(flags["from"] ?? 0);
      const to = Number(flags["to"] ?? -1); // -1 means "last phase"
      const valid = executeReplay({
        from: isNaN(from) ? 0 : from,
        to: isNaN(to) ? -1 : to,
      });
      process.exit(valid ? 0 : 1);
    }

    case "test": {
      // Allow custom test command via --command or after --
      const testCommand = flags["command"]
        ?? (args.length > 0 ? args.join(" ") : undefined);
      const valid = executeTest(testCommand);
      process.exit(valid ? 0 : 1);
    }

    case "build": {
      const buildCommand = flags["command"]
        ?? (args.length > 0 ? args.join(" ") : undefined);
      const outputDir = flags["output"] ?? "dist";
      const valid = executeBuild(buildCommand, outputDir);
      process.exit(valid ? 0 : 1);
    }

    case "audit": {
      const valid = executeAudit();
      process.exit(valid ? 0 : 1);
    }

    case "install-hooks": {
      const success = executeInstallHooks();
      process.exit(success ? 0 : 1);
    }

    default:
      console.error(`SIGNAL: Unknown command '${command}'`);
      console.error("Run 'signal --help' for usage information.");
      process.exit(1);
  }
}

main();