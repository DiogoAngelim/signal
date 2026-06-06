# Signal Meaning

Meaning is the human-needs interpretation layer for Signal. It accepts plain
text and turns the literal desire into a safer positive goal before Purpose,
Wisdom, Pruning, or Agency can optimize around it.

Meaning asks: what positive human need is this desire trying to satisfy?

## Needs Taxonomy

The module uses a deterministic positive-needs taxonomy:

survival, safety, security, stability, relief, control, autonomy, freedom,
growth, mastery, achievement, esteem, belonging, identity, purpose, peace,
excitement, recovery, contribution, meaning.

Negative or impulsive desires still map to positive needs. For example,
"gamble everything" maps to excitement, control, freedom, and survival, then
transforms into capped exploration that protects survival.

## Gravity

`gravityScore` ranges from `-10` to `+10`.

- `-10`: destructive, urgent, dangerous, impulsive, or high-risk
- `-7`: strongly negative and likely harmful if followed literally
- `-5`: risky, reactive, fear-driven, regret-driven, or unrealistic
- `0`: neutral or unclear
- `+5`: constructive and moderately aligned
- `+10`: deeply constructive, sustainable, meaningful, and identity-aligned

Gravity does not judge the person. It scores whether the literal desire is
likely to create sustainable positive outcomes if followed directly.

## Output

`evaluateMeaning({ text })` returns:

- surface desire
- gravity score and label
- primary and secondary positive needs
- need confidence
- positive goal and transformed goal
- safety constraints and risk warnings
- Purpose-ready context
- alignment notes, explanation, and trace

The trace records input text, detected desire terms, emotional markers, mapped
needs, gravity factors, transformation rule, safety constraints, confidence,
missing context, and warnings.

## Integration

Meaning feeds Purpose through `meaning` on `PurposeInput`. Purpose uses the
transformed goal, not unsafe literal desire, when refining purpose statement,
confidence, survival priority, and warnings.

Wisdom uses Meaning to reduce confidence and escalate review when gravity is
negative, need confidence is low, or recommendations depend on unsafe literal
desire.

Pruning uses Meaning to add policy candidates that reduce, ignore, or
quarantine signals serving negative literal desires while preserving
survival-critical warnings.

Agency uses Meaning to block, reduce, or review unsafe literal desires before
execution.

Stocks Optimizer passes user goal text into Meaning, displays beginner-facing
fields, and uses the transformed goal to lower exposure, require stronger
confirmation, and explain why signals are ignored, reduced, or allowed.

## Privacy

Meaning does not infer sensitive personal attributes such as race, religion,
sexuality, medical diagnosis, mental health condition, political affiliation,
or criminal status. It focuses only on the supplied goal text and
decision-relevant needs.

## Examples

- Revenge trading: transform retaliation into disciplined recovery and review.
- Loss recovery: recover confidence and capital gradually without risk of ruin.
- Gambling impulse: create capped upside exposure while protecting survival.
- Financial freedom: build durable autonomy and security.
- Mastery: improve decision quality through practice and feedback.
- Safety: protect what matters before increasing pace.
- Excitement: channel novelty into bounded exploration.
- Feeling behind: replace comparison pressure with sustainable progress.
