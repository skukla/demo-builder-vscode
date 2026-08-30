# Where code goes — the placement rules

The codified answer to "when you want to do X, use structure Y, in this way."
Ratified by the owner 2026-08-28 (ADR-015 carries the dependency ruling and
its sources); enforced by `tests/sop/architecture-rules.test.ts`. If a rule
here and the test disagree, that is a bug in one of them — fix the drift, do
not route around it.

| # | When you want to… | Use | How | Enforced by |
|---|---|---|---|---|
| 1 | Add a user-facing action (button, menu, palette) | A **command** in a `commands/` dir | Extend `BaseCommand`/`BaseWebviewCommand`; fetch services at the top; delegate to services; no business logic here | architecture-rules: command-base |
| 2 | Respond to a webview message | A **handler** in the feature's `handlers/` map | Typed `MessageHandler`; may fetch; RETURN the result (Pattern B) — `sendMessage` is for progress pushes only | handler-shape (existing) + architecture-rules: pattern-B ratchet |
| 3 | Give agents a capability | An **MCP tool** (descriptor row if a handler exists; else a registrar) | `asText`/`asRawText` envelope; narration + ceiling + coverage entry; destructive ⇒ `confirm` + consent copy | responseEnvelope, toolNarration, responseSize, toolPromptCoverage, realSdkRegistration |
| 4 | Implement business logic / talk to an external system | A **service** in the feature's `services/` | Needs arrive as parameters; never fetches, never `vscode.window.*` | architecture-rules: fetch-boundary + ui-in-services |
| 5 | Hand logic a bundle of services | The feature's **`create...Deps`** file | The only construction site outside `extension.ts`; lives beside its consumer | architecture-rules: construction-boundary |
| 6 | Answer a question from existing data | An **accessor** | Reads only. NEVER creates/writes on a miss | mechanical for tools; review rule elsewhere |
| 7 | Build screen UI | A **component** in the feature's `ui/` | Feature: `ui/components/`. A wizard/step body: `ui/steps/`. Promote to `core/ui/components/{category}/` (feedback, forms, layout, navigation, selection, ui) only at the SECOND consumer | import-boundary lint + `tests/sop/component-extraction.test.ts` |
| 8 | Reuse screen behavior | A **hook** | Feature: `ui/hooks/`. Shared: `core/ui/hooks/`, again only at the second consumer. Stable references for array/object args (module-level `EMPTY`) — inline literals re-render forever | architecture-rules: hook-stable-refs |
| 9 | Add feature configuration | JSON in the feature's `config/` | Loaded through `ConfigurationLoader` | architecture-rules: config-loader |
| 10 | Declare shared shapes | A types file (`src/types/` or `*.types.ts`) | No runtime code | architecture-rules: types-purity |
| 11 | Build something two features need | `core/` | Only at the second consumer — never speculatively | import rules + review |

## Exemptions

Real exceptions exist (a function-style command that predates the base class,
runtime type guards colocated in `src/types/` by long convention). They are
never silent: each is a named row in the enforcement test's ledger with a
written reason. An exemption without a reason fails the build — an IOU is not
a verdict.
