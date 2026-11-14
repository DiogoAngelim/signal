# Detached host reconciliation candidate — no deployment

**Prepared:** 2026-11-14. **Status:** UNREFERENCED merge commit (not on any branch), NOT tested as a combined tree, NOT deployed or approved. Unreferenced commits are not durable release artifacts unless attached to a reviewed ref later.

## Sources and exact content rules
- First parent: [Signal PR #84](https://github.com/DiogoAngelim/signal/pull/84) `13b578e24cea50c74d219b203cdef9e1ed012d1d`. Preserve all scanner regression fixes, security assurance and evidence documents.
- Second parent: [Signal PR #56](https://github.com/DiogoAngelim/signal/pull/56) `1b352ba58c5f3b319e20af7b942abcfb559fc719`. Contribute only `server/workbench-host/**`, the host-only GitHub workflow, the Vercel include allowlist and the lockfile host importer.
- Explicitly DO NOT copy PR #56's older, broad error-catching `scripts/check-obfuscated-payloads.mjs` over the fail-closed PR #84 implementation.
- Before creating this tree, verified PR #56's entire lockfile differs from PR #84's **only** by the `server/workbench-host` importer. Verified the entire Vercel ignore file differs **only** by the host and workspace dependency allowlist.
- This commit is assembled from *exact Git blob object hashes*, not speculative content synthesis.

## Acceptance before attaching to a branch or merging
1. Review combined diff, fail-closed scanner, frozen lockfile and host egress/ingress error paths.
2. Attach to an approved feature ref **only when Vercel automatic-preview triggering is acceptable or reliably disabled**. A branch update can itself request a preview deployment; none is made in this step.
3. Run exact-commit host tests plus core, quality and security CI *on this combined tree*. Separate PR checks do not certify integration.
4. Rehearse least-privilege connector runtime grants (events SELECT/INSERT, cursors SELECT/INSERT/UPDATE), tenant isolation and rollback; do not modify a live database without separate authorization.
5. Complete an explicitly authorized isolated preview: owner-scoped token provisioning, signed E2E delivery, replay/idempotency, outcome cursor crash/retry, monitoring, restore and rollback.
6. Keep auto-scheduler, production migrations, production release, partner contact and causal efficacy claims disabled until separately evidenced and approved.

**No branch refs, Vercel settings, production database, or customer records were changed in generating this detached Git object.**
