# Webview initial payloads are typed, then cast away

**Filed:** 2026-08-20
**Origin:** The project-title feature. `getProjectDisplayName` existed and was still
missed four times; the display-name brand added in `95bdf0b0` could not cross this
boundary, which is what made the misses invisible to `tsc`.

## Progress 2026-08-20 (second session)

Premise re-measured and confirmed (the two `initialData` casts, the
`Promise<unknown>` abstract, the single-file `ConfigureInitialData` — plus two
newer `payload` casts at `baseWebviewCommand.ts:370`/`:389` for step 4 to close).

- **Findings 3 and 8 FIXED** — `e1221a66`. Regression tests written first, both
  confirmed failing against the unfixed code. `isWizardStepConfig` now requires
  a boolean `enabled` and gates `getInitialData`; both envVars producers inject
  the record key via `withEnvVarKeys` (componentTransforms.ts).
- **Step 0 DONE** — `3f74eabe`. One declaration each: wizard-step shape
  (in `@/types/wizard`, `StepCondition` moved with it), `EditProjectConfig`
  (wizardHelpers), env-var type (`EnvVarDefinition`; `ComponentEnvVar`
  deleted). Zero test edits; full gate green both commits.
- **Canonical step type renamed** to `WizardStepDefinition` — `91fa6c93`
  (pure rename, wizardHelpers re-export removed).

Remaining: steps 1–5 of the execution plan below (findings 4, 5, 7, 10 land
inside them as per-field decisions).

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

## ATTEMPTED 2026-08-20, ABANDONED AND REVERTED — read this before starting

The refactor was tried end to end and backed out. Nothing shipped; the tree was
returned to this commit. **It was abandoned for what it FOUND, not for anything
that went wrong**, and the finding changes the shape of the work:

> This is not mechanical. Every producer/consumer pair that had never been
> compared disagrees, and each disagreement needs a judgement call about which
> side is right.

Ten of them surfaced before the attempt stopped, and it was still finding new
ones rather than converging — the tenth was two type names for the same concept,
one layer below the ninth. That is the signal that this needs a scoped session of
its own, not a slot at the end of another one.

**The failures are all `tsc` errors, so the sequence reproduces exactly.** Wire
producer and consumer to one declaration and they appear in this order.

### What it found

| # | Finding | Severity |
|---|---|---|
| 1 | **Two `WizardStep` types.** `@/types/webview` exports a step-**id union** (`'welcome' \| 'prerequisites' \| ...`); `createProject.ts` declares a step-**definition object** (`{ id, name, [key]: unknown }`). Unrelated things, one name. Silent because neither file imported the other's. | naming |
| 2 | **The step-definition shape is declared FOUR times** — `createProject.ts`, `wizardHelpers.WizardStepConfig`, `stepLogger.WizardStepConfig`, and the wizard bundle's own `WizardInitData.wizardSteps`. Each subtly different: `enabled` optional in two, an index signature in two others. | duplication |
| 3 | **`isWizardStep` validates two of the four fields the consumer depends on** (`createProject.ts`). It checks `id` and `name`. `wizard-steps.json` carries `description` and `enabled` on all 6 steps, and `wizardHelpers` filters on `step.enabled` in three places (`:113`, `:424`, `:539`). So a config that lost `enabled` passes validation, is sent, and every step is silently dropped from the wizard — `undefined` is falsy. The guard is not lying about its declared type; the declared type (`{ id, name, [key]: unknown }`) is too loose to describe what the consumer needs, which is the same root as the rest of this item. | **latent bug** |
| 4 | Wizard payload `componentDefaults`: producer sends `ComponentDefaults` (`{frontend?, backend?, dependencies?}`), consumer declares `ComponentSelection` (a superset with `integrations`, `services`, `preset`). | divergence |
| 5 | Wizard payload `importedSettings`: `SettingsFile` on one side, `ImportedSettings` on the other. | divergence |
| 6 | **`EditProjectConfig` is declared twice** — `createProject.ts` and `wizardHelpers.ts` — once per side of the wire. | duplication |
| 7 | Configure payload `componentsData`: producer declares the arrays `unknown[]`, consumer needs `ComponentData[]`. | divergence |
| 8 | **`envVars` carries no `key`.** The producer sends `registry.envVars` straight through, and the registry's records have no `key` — it IS the record key. `ComponentEnvVar` requires it. Anything reading `envVars[x].key` off this payload reads `undefined`. `UniqueField` happens to rebuild the key by pairing record key with value, which is why nothing has broken yet. | **latent bug** |
| 9 | **`EnvVarDefinition` and `ComponentEnvVar` are two types for the same thing**, and they are not structurally equal. | duplication |
| 10 | Several `\| null` (producer) vs `?: undefined` (consumer) mismatches on the same fields. | divergence |

### What that means for the plan

- Items **3 and 8 are bugs today** and are worth fixing on their own, ahead of
  and independently of the typing work. Neither needs the refactor.
- Items **1, 2, 6, 9 are duplicate or colliding declarations.** Resolving them is
  most of the work and has to happen FIRST — the payload module cannot import a
  name that means two things.
- Items **4, 5, 7, 10 are per-field decisions**: which side is right. Cheap
  individually, and there is no way to know the count in advance. Ten surfaced
  before the attempt stopped; assume more.

### Revised sequencing

The original plan below is still correct in outline, with one step inserted
before all of it:

**Step 0 — resolve the duplicate and colliding declarations** (findings 1, 2, 6,
9). One shape, one name, one file each. Land it separately and verify it on its
own; nothing about the payload boundary changes yet, so it is safe to ship alone.

Then steps 1–5 become genuinely mechanical, because the types they move will
finally be unambiguous.

### One practical note

`src/types/webviewPayloads.ts` **must not import `vscode`** — it compiles into the
browser bundles. That rules out keeping any payload shape beside the command that
produces it, which is why they have to move rather than just be exported.

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

Filed first because no bug was attached to it; the one it caused is fixed
(`02cac443`), and the brand plus the local annotations stop that class recurring at
the three sites that matter.

**Then attempted, and abandoned for cause** — see the section above. Two bugs DID turn
out to be attached to it (findings 3 and 8); they were invisible until producer and
consumer shared a declaration. The reason to do this is no longer tidiness.

## Kickoff prompt (original — slices 1–2 are DONE, see Progress above)

> Webview initial payloads are declared and then cast away — see
> `.rptc/backlog/2026-08-20-webview-payloads-are-typed-then-cast-away.md`.
>
> Read the ATTEMPTED section first. This was tried once and reverted, and the ten
> findings there are the map — do not rediscover them.
>
> Re-measure the central claim before starting, it is three commands: confirm
> `baseWebviewCommand.ts` still casts to `MessagePayload`, confirm the abstract still
> returns `Promise<unknown>`, and confirm `grep -rln ConfigureInitialData src` still
> returns a single file. If any has changed, the premise has moved.
>
> Then start at **Step 0** (resolve the duplicate and colliding declarations), NOT at
> step 1. Findings 3 and 8 are bugs that need neither and can be fixed first, alone.
> Expect more than ten divergences — ten is where the first attempt stopped, not where
> they ran out.

## Kickoff prompt for the NEXT session (steps 1–5)

> Continue the webview payload typing — see the Progress section of
> `.rptc/backlog/2026-08-20-webview-payloads-are-typed-then-cast-away.md`.
> Bugs 3+8 are fixed (`e1221a66`) and Step 0 is done (`3f74eabe`, `91fa6c93`):
> the wizard-step shape is `WizardStepDefinition` (@/types/wizard), the env-var
> type is `EnvVarDefinition`, `EditProjectConfig` is declared once.
>
> Work **per webview command, one commit each, easiest first** — not in the
> numbered step order:
> 1. `showIntegrations` + `showDataInstaller` — write their missing shapes
>    (currently `Record<string, unknown>`); greenfield, no divergences.
> 2. `showDashboard` + `showProjectsList` — inline object types move to a
>    shared location.
> 3. `configure` — finding 7 (`unknown[]` vs `ComponentData[]`) lands here.
> 4. `createProject` (wizard) — LAST; findings 4, 5, 10 land here and this is
>    where the first attempt drowned. Per-field rule: the DATA decides
>    (config JSON, registry, a logged payload) — cite it.
> Then generify `BaseWebviewCommand<TInitialData>` — the cast now has FOUR
> sites (`:213`, `:302`, `:370`, `:389`), close all of them — and finish with
> the display-name brands (step 5), deleting the local annotated consts only
> after the branded type reaches the consumer.
>
> Payload types shared with the browser bundles must not import `vscode`.
> Each commit: full gate. Expect divergences beyond the ten recorded.
