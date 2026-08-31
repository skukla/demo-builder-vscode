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

## Before writing a new component

Check the vocabulary first. On one day in July a single new surface shipped six
rebuilds of things the wizard already had — the loading view, the error view, the
sign-in affordance, the kebab menu, the icon set and the catalog feedback trio — and
every one was caught by the owner rather than by review. The `reuse-first` skill is
that check, and a hook rule fires it when you create a file under a `ui/` directory.
