# Supply Chain — Phase 4

## Overview

Signal's supply chain security ensures that all dependencies are explicitly listed, vulnerability-checked, and pinned to exact versions. No floating ranges in production.

## Dependencies

### Runtime Dependencies

| Package | Version | Purpose | Pinned |
|---------|---------|---------|--------|
| zod | ^3.23.8 | Schema validation | Yes (lockfile) |
| fastify | ^4.28.0 | HTTP server framework | Yes (lockfile) |
| drizzle-orm | ^0.36.0 | Database ORM | Yes (lockfile) |
| postgres | ^3.4.0 | PostgreSQL client | Yes (lockfile) |

### Dev Dependencies

| Package | Version | Purpose | Pinned |
|---------|---------|---------|--------|
| @biomejs/biome | ^1.9.4 | Linting/formatting | Yes (lockfile) |
| typescript | ^5.7.3 | Type checking | Yes (lockfile) |
| vitest | ^2.1.9 | Testing | Yes (lockfile) |
| vite | ^8.0.10 | Build tooling | Yes (lockfile) |
| @vitest/coverage-v8 | ^2.1.9 | Coverage reporting | Yes (lockfile) |

### Override Policy

The root `package.json` includes overrides for known vulnerable transitive dependencies:
- `serialize-javascript` → `7.0.5` (CVE fix)
- `webpackbar` → `7.0.0` (compatibility fix)

## Vulnerability Check

Run `pnpm audit` to check for known vulnerabilities. Current status:
- No critical or high vulnerabilities in direct dependencies
- Overrides applied for known transitive issues
- Lockfile (`pnpm-lock.yaml`) ensures reproducible installs

## Pinning Strategy

1. **Production dependencies**: Use caret ranges (`^`) in `package.json` but exact versions resolved in `pnpm-lock.yaml`
2. **Dev dependencies**: Same strategy; lockfile ensures determinism
3. **Override policy**: Explicit overrides for transitive vulnerabilities
4. **Lockfile integrity**: `pnpm-lock.yaml` committed to repository; `pnpm install --frozen-lockfile` in CI
5. **No `latest` tags**: All version references are explicit semver ranges
6. **Review cadence**: Monthly dependency review; immediate patch for critical CVEs

## Build Reproducibility

- `pnpm install` with lockfile produces identical `node_modules` across environments
- `pnpm build` produces deterministic output given same source
- TypeScript compilation is deterministic given same compiler version
- `fingerprint()` uses SHA-256 for stable hashing across runs