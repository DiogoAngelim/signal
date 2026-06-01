# Commitment

Commitment is the step after decision generation and before execution.

Decision generation answers: should this be considered?

Commitment answers: how much resource should be committed now?

Execution answers: what exact action should be taken?

The commitment module is generic. It does not know stocks, portfolios, brokers, prices, shares, or currencies. It knows decisions, trust, constraints, resources, policies, strategies, invalidation, and monitoring.

Use `@signal/commitment` when a caller needs a deterministic recommendation for abstract resource commitment.
