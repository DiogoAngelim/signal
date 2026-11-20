# Verified investing migration

The backend integration lives in `src/artifacts/verified-investing/README.md`. It is opt-in and default-paper. Start its persistent Node 22 worker and configure `VERIFIED_INVESTING_INTERNAL_URL` in the existing API. Existing account credentials are not copied, exposed or automatically enabled.

The new verified decision flow is `/api/investing/research` -> report/gates -> prospective signal observations -> `/api/investing/plan` -> permission-gated `/api/investing/execute`. Connect a frontend to these endpoints rather than executing old `/strategy` directions. The quote stream provides analysis; request a portfolio plan for exact risk/account-specific quantities.

Legacy research remains available with explicit unverified/production-ineligible metadata and zero executable suggested exposure. Legacy order creation is disabled; account reads/cancellations are preserved. Old strategy write paths with inconsistent backtest/job bookkeeping return 410 and a migration endpoint. This is an intentional safety change, not silent production compatibility.

Do not point the full old equity watchlist at the new free verified endpoint: the reviewed free automation contract currently covers Binance Spot only. Unsupported equity/data entitlements must remain unavailable until a permitted adapter is integrated and tested.

The singular `examples/stock-optimizer` path was an orphaned gitlink with no URL. Its former commit `6d5e08c18dea6b00a069a08ad5c74bec9a78284c` is preserved in a marker and Git history; the active example is the plural directory.

No statement that any real strategy has passed all gates, any live order was placed, or any deployment is healthy follows from passing this source test suite. Inspect CI, the bounded real-data probe, provider deployment/release identity, operator security review, prospective ledger, account reconciliation and exchange testnet evidence separately.
