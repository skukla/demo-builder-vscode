# Webview initial payloads are typed, then cast away

**Filed:** 2026-08-20
**Origin:** The project-title feature. `getProjectDisplayName` existed and was still
missed four times; the display-name brand added in `95bdf0b0` could not cross this
boundary, which is what made the misses invisible to `tsc`.

## The claim

Producer and consumer of every webview's initial data agree by **convention only**.
Five of seven producers declare a payload type, and not one of those types reaches
the component that reads it.

## Measured 2026-08-20

`getInitialData` overrides and what each declares:

| Command | Declared return |
|---|---|
| `dashboard/commands/openAi.ts` | `AiOverviewInitialData` |
| `dashboard/commands/configure.ts` | `ConfigureInitialData` |
| `project-creation/commands/createProject.ts` | `InitialWizardData` |
| `dashboard/commands/showDashboard.ts` | inline object type |
| `projects-dashboard/commands/showProjectsList.ts` | inline object type |
| `dashboard/commands/showIntegrations.ts` | `Record<string, unknown>` |
| `data-installer/commands/showDataInstaller.ts` | `Record<string, unknown>` |

Three things, each one command to re-check:

1. **The base contract is `unknown`** — `core/base/baseWebviewCommand.ts:166`,
   `protected abstract getInitialData(): Promise<unknown>`.
2. **Each named type appears in exactly ONE file — its producer.**
   `grep -rln ConfigureInitialData src` returns `configure.ts` and nothing else.
   Same for the other two. No webview imports the type describing what it receives;
   each React component declares its own props independently.
3. **The cast erases whatever was declared**, one line after it is produced —
   `initialData as MessagePayload | undefined`. TWO sites, not one:
   `baseWebviewCommand.ts:213` (the ready-handshake path) and `:302` (the direct
   path). Step 4 has to close both, or the boundary is still open on one of them.

So the codebase does the work of describing the shape and then discards it.

## Why this is worse than `Record<string, unknown>`

`Record<string, unknown>` is honest: nothing is checked and it looks like nothing is
checked. A declared `ConfigureInitialData` looks like a checked boundary and is not
one, so a reader trusts it and a reviewer stops looking.

This is the same shape the repo has already paid for. From the project CLAUDE.md:

> **A cast at a call boundary is a silenced type error.** … Four times in this repo it
> hid a field the callee dispatches on — `stackBackend` … each time the result was a
> silent no-op in production that every test agreed with.

Milder here — `MessagePayload` is a widening, not `any` — but it is the gap the
display-name drift came through.

## Goal

Producer and consumer check against ONE shape, so a brand survives the boundary and
the two cannot drift.

## Execution plan

1. Move each payload interface to a location both bundles import (`@/types/` or a
   per-feature `types.ts`). They mostly exist already; they are in the wrong file.
2. Have each webview component declare the imported type instead of its own props.
3. Write the two missing shapes (`showIntegrations`, `showDataInstaller`) rather
   than leaving them `Record<string, unknown>`.
4. Narrow `baseWebviewCommand`'s cast: generify as `BaseWebviewCommand<TInitialData>`
   so the assertion happens once against a declared type, not per subclass.
5. Brand the display fields — `projectName` on the integrations, data-installer and
   dashboard payloads — now that a brand can survive. The local annotated `const`s in
   `showIntegrations` / `showDataInstaller` become unnecessary and should go.

## Constraints

- **No behaviour change.** This is types only; a payload whose runtime shape changes
  means step 1 was done wrong.
- Do NOT delete the local annotations in step 5 before the type reaches the consumer.
  They are the only check at those two sites today.
- `StatusPayload.name` is already branded (`95bdf0b0`) and already crosses a real
  typed boundary. Leave it; it is the worked example.

## Why it is filed rather than done

No bug is currently attached to it. The one it caused is fixed (`02cac443`), and the
brand plus the local annotations stop that specific class recurring at the three sites
that matter. This is the durable version, worth doing on its own terms rather than
folded into a feature.

## Kickoff prompt

> Webview initial payloads are declared and then cast away — see
> `.rptc/backlog/2026-08-20-webview-payloads-are-typed-then-cast-away.md`.
> Re-measure the central claim first, it is three commands: confirm
> `baseWebviewCommand.ts` still casts to `MessagePayload`, confirm the abstract still
> returns `Promise<unknown>`, and confirm `grep -rln ConfigureInitialData src` still
> returns a single file. If any has changed, the item's premise has moved and the plan
> needs re-scoping before step 1.
