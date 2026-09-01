# The frontend

Everything rendered in a VS Code webview. This is the **front door** for that half of
the codebase: what is here, and where each kind of answer lives. It routes and does not
restate — a rule stated twice is a rule that drifts.

**This extension is two programs**, and that is the first thing to know. The extension
host runs in Node with the `vscode` API; these files run in a browser bundle with
neither. They have different composition roots, different dependency rules and
different enforcers. [`../../CLAUDE.md`](../../CLAUDE.md) is the other program's front
door; [ADR-015](../../../docs/architecture/adr/015-dependency-architecture.md) governs
it and does **not** govern this.

```
core/ui/
├── components/   the shared visual vocabulary   (→ components/CLAUDE.md)
├── hooks/        the shared behaviour           (→ hooks/CLAUDE.md)
├── styles/       reset, tokens, custom-spectrum, vscode-theme, wizard, index
└── utils/        cn(), spectrum tokens, WebviewClient
```

Feature UI lives with its feature (`src/features/*/ui/`), not here. Something moves
into `core/ui/` at its **second** consumer, never speculatively.

## Where each kind of answer lives

| You want | Read |
|---|---|
| The rules, each naming its enforcer | [handbook §7](../../../docs/development/handbook.md) — 16 conventions, 14 enforced |
| Why the webview side is ruled separately at all | [ADR-017](../../../docs/architecture/adr/017-webview-architecture.md) |
| Why CSS works the way it does here | [ADR-018](../../../docs/architecture/adr/018-css-architecture.md) |
| An existing component, before you write one | [`components/CLAUDE.md`](components/CLAUDE.md) — pick by JOB |
| An existing hook | [`hooks/CLAUDE.md`](hooks/CLAUDE.md) |
| How to style a Spectrum component | [styling-guide.md](../../../docs/development/styling-guide.md) |
| The Spectrum traps that keep biting | `spectrum-webview-ui` skill |
| To wire an extension↔webview message | `webview-command-handler` skill |
| To write or fix a webview test | `webview-test-authoring` skill |
| To prove a CSS change moved only what it meant to | `webview-visual-baseline` skill |
| To add a wizard step or a Build-Your-Project area | `wizard-step-authoring` skill |

## The four facts that explain most surprises here

**There are eight bundles, not one.** `WEBVIEW_ENTRIES` in `esbuild.config.js` lists
them, and each is its own composition root. A feature stylesheet reaches only the
bundles whose entry imports it — so a class can be styled on one surface and simply
absent on the next, **with no error anywhere**. This is the single most common styling
surprise, and ADR-017 §6 is the rule that now checks it.

**Hooks are the service layer.** A component renders and handles interaction; the state
machine, the host calls and the derived data live in a hook. That is what makes a
component testable without a running extension.

**The message channel is a ratified singleton.** `acquireVsCodeApi()` can be called
only once per webview, so there is nothing to vary and nothing to inject. One channel
per bundle — the sidebar is the last one still hand-rolling its own, which is a latent
crash rather than a style difference (PL-19).

**You cannot see this UI, and neither can any tool here.** It renders inside a VS Code
webview: no Playwright, no screenshot, no reachable devtools. The global "verify in the
browser" instinct does not apply, and nothing automatic replaces it — ask for a
screenshot rather than reporting a visual result you did not see.

## React's own rules, and the one that took a type checker to enforce

Three of React's conventions fail the build here: `rules-of-hooks` (a hook called
conditionally or below a return), `jsx-key`, and the a11y checks on `alt-text` and
`aria-props`. `exhaustive-deps` is a WARNING, and CI allows warnings — the zero-warning
bar in the `gate` skill is what actually catches it.

**A value passed INTO a hook must be stable across renders.** This was listed here as
"the one no tool catches" until 2026-09-01, when it turned out to be catchable and the
corpus was emptied.

```tsx
const EMPTY: never[] = [];              // module level — one reference, forever
useThing({ items: EMPTY });             // safe

useThing({ items: [] });                // a NEW array every render
```

An inline `[]`, `{}` or arrow literal is a new reference on every render. An effect
depending on it runs every render; one that sets state loops forever.

`exhaustive-deps` reads the dependency array *inside* the hook and cannot see across the
prop boundary to the caller that made the value, and the types are identical so the
compiler sees nothing either. **Both halves of that stay true — the mistake was
concluding from them that nothing could check it.** A LINT RULE cannot cross the
boundary; the TYPE CHECKER can, by resolving the call to the hook's declaration and
reading the dependency arrays there. `tests/sop/stable-hook-arguments.test.ts` does
exactly that and now bans it.

Emptying it found twelve, none of them theoretical: `useSelectionStep` defaulted
`messagePayload = {}` and `searchFields = []` *inside its destructure*, so both were
rebuilt every render for every caller that omitted them, and it named three
caller-written callbacks in dependency arrays, re-subscribing its message listener on
every render of three wizard surfaces. `useActivateOnKey` handed all five tile call
sites a new keydown handler every render.

Three things are NOT violations: a **destructured** parameter (the object is torn apart
in the signature, so nothing depends on it), a **spread** dependency (`[...conditions,
setX]` depends on the elements), and React's own hooks — `useState([])` reads its
argument once, and the `[]` in `useMemo(fn, [])` IS the dependency array.

## Before writing a new component

Check the vocabulary first. On one day in July a single new surface shipped six
rebuilds of things the wizard already had — the loading view, the error view, the
sign-in affordance, the kebab menu, the icon set and the catalog feedback trio — and
every one was caught by the owner rather than by review. The `reuse-first` skill is
that check, and a hook rule fires it when you create a file under a `ui/` directory.
