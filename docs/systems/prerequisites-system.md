# Prerequisites system

What the feature does is in
[`src/features/prerequisites/README.md`](../../src/features/prerequisites/README.md).
This is the one part with real depth: how a long install reports progress.

## The config shape is defined by its schema, not here

`prerequisites.schema.json` sits beside `prerequisites.json` and is validated against
it by `tests/templates/config-contracts.test.ts`. Read the schema for the field list —
it cannot be wrong, and a copy here could.

## Four ways to report progress

A prerequisite install can take minutes, and a progress bar that sits at zero reads
as a hang. Each install step declares how its progress is derived:

| `progressStrategy` | For | How |
|---|---|---|
| `exact` | tools that print a real percentage — fnm | a named `progressParser` reads `Downloading: 75%` from the output |
| `milestones` | tools with recognisable stages — Homebrew, npm | declared output patterns advance the bar a step at a time |
| `synthetic` | **the default** — tools that print nothing useful | `ProgressUnifier` runs a time-based curve from `estimatedDuration` |
| `immediate` | steps too fast to be worth animating | jumps straight to complete |

The values are `exact`, `milestones`, `synthetic`, `immediate` — the enum in
`prerequisites.schema.json`. A step that declares none gets `synthetic`.

**The synthetic curve stops at 95% on purpose.** It is an estimate, so it must never
show 100% while work continues — a bar that completes and then waits reads as a hang,
which is the exact problem the progress system exists to avoid. Completion comes from
the step finishing, not from the clock.

`estimatedDuration` feeds that curve and nothing else. It is not a timeout: the
timeout is `TIMEOUTS.PREREQUISITE_CHECK`. Confusing the two would abort an install at
the moment its bar looked full.

## Where the surprising behaviour lives

Two things are documented where they happen rather than here, because both are about
*when* code runs and a copy would drift:

- **`perNodeVersion`** and the plugin mechanism — see the feature README.
- **Why the check is not in the wizard step** — the step runs before integrations are
  chosen, so choice-dependent needs are resolved at the add door instead
  (`@/core/shell`'s `ensureNodeVersion`).

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Registries load through
`ConfigurationLoader`, and the manager is a session accessor — memoised, built once,
because its cache is the difference between a 10ms and a 3000ms check.
