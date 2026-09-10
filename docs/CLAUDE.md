# Development notes

Most of what used to be here now lives where it belongs: conventions and their
enforcers in [the handbook](development/handbook.md), releases in the `cut-release`
skill, contributing in [`../CONTRIBUTING.md`](../CONTRIBUTING.md), testing in
[`../tests/README.md`](../tests/README.md), and security in the handbook plus the
root [`../CLAUDE.md`](../CLAUDE.md)'s never-compromise list.

What is left is the handful of things none of those own.

## Naming

| Kind | Form | Example |
|---|---|---|
| React components | `PascalCase`, and the file exports that name | `WizardContainer.tsx` |
| Exported ALL-CAPS consts | `UPPER_SNAKE_CASE` | `MIN_DISPLAY_TIME` |
| Everything else | named for its SUBJECT | `loadingHTML.ts`, `commerceSections.ts` |

> **Ratified and enforced 2026-08-31** by `tests/sop/naming-conventions.test.ts`,
> and stated in [the handbook](development/handbook.md) §2.
>
> The four-row version that used to sit here — commands `camelCase`, components
> `PascalCase`, constants `UPPER_SNAKE_CASE`, "files match the export" — could not
> be enforced because the rows contradict each other: `ResetAllCommand.ts` exports a
> class of that name, and eleven `.tsx` files export functions rather than
> components. "Named for what it exports" held for 40% of `src/`. The handbook entry
> carries the full measurement.

## Webview loading states

Use `setLoadingState` from `@/core/utils/loadingHTML` rather than hand-rolling a
spinner:

```typescript
await setLoadingState(panel, getContent, message, logger);
```

It waits `TIMEOUTS.WEBVIEW_INIT_DELAY` after panel creation — which is what stops
VS Code painting its own "Initializing web view…" message — and holds the state for
at least `TIMEOUTS.UI.MIN_LOADING` so a fast load does not flash.

**Read those two constants rather than quoting their values.** This file previously
gave them as "100ms" and "1500ms"; both are `TIMEOUTS` entries, and a literal in
prose is the same defect as a literal in code.

The initial state is plain HTML and CSS, because it renders before React exists.

## Clearing dependent state

When a parent selection changes, clear everything downstream of it — pick a
different Adobe project and the workspace selection must go, not persist into a
mismatched pair.

> Also unratified, and the one rule here with real consequences: a stale child
> selection is how an operation targets the wrong resource. Registered.

## Smoke checks a webview change still needs by hand

Nothing automated covers these:

- the panel loads without VS Code's "Initializing" message, and the spinner shows
- step navigation, Cancel and Back all work
- both a light and a dark theme render correctly
- an error state displays, and messages still round-trip in both directions

The `webview-visual-baseline` skill is the automated counterpart for CSS changes —
it fingerprints computed styles across all eight surfaces — but it cannot tell you
a button stopped working.

## Related

- [`README.md`](README.md) — the documentation index
- [`development/handbook.md`](development/handbook.md) — every convention
- [`architecture/CLAUDE.md`](architecture/CLAUDE.md) — the architecture index
