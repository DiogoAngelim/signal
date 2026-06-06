Adapters translate provider or application-shaped data into generic framework inputs. They are boundary code only; rendering and portfolio execution stay outside the framework.

The stocks optimizer adapter keeps trading interpretation at the boundary. It
maps trade signals, dashboard metrics, survival warnings, and backtest summaries
into generic pruning candidates, then exposes an optional pruning view model:

- `legacy`: no pruning data is available; existing screens continue to work.
- `enhanced`: pruning evaluated candidates and produced app-facing arrays.
- `degraded`: pruning ran with missing, stale, partial, or weak evidence.

The exposed view model includes `pruningScore`,
`ignoranceEffectivenessScore`, `recommendedAction`, `ignoredSignals`,
`reducedSignals`, `quarantinedSignals`, `preservedSignals`,
`survivalCriticalSignals`, `frontendHiddenSignals`, `explanation`, and
`warnings`.
