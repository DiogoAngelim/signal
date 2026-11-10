# Example dependency remediation

The workspace dependency audit identified high/critical advisories reachable
through optional example applications. The root workspace overrides pin the
affected transitive packages to patched release lines so the examples and
Signal core resolve a single reviewed dependency graph.

Affected package families:

- `proxy-addr` 2.0.8 or newer
- `node-fetch` 2.7.0 or newer
- `form-data` 4.0.6 or newer
- `axios` 1.20.0 or newer
- `node-forge` 1.4.1 or newer
- `follow-redirects` 1.16.2 or newer
- `body-parser` 2.4.0 or newer
- `zod` 4.6.6 or newer
- `uuid` 11.1.1 or newer
- `qs` 6.16.1 or newer

The Aware example declares Zod 4 directly. Keep the pnpm lockfile synchronized
with root overrides and package manifests; frozen CI installs must remain
mandatory.

The structured pnpm audit artifact is retained with every security workflow
run so advisory IDs, severity, affected versions, and dependency paths remain
inspectable. These overrides remediate the advisories reported for the audited
dependency graph. They do not certify third-party financial integrations,
validate provider credentials, or remove the need to monitor future advisories. When
upgrading an overridden package, run the complete example build, typecheck,
test, and security-audit workflows before release.
