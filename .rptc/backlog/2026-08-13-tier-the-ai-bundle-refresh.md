# Watch both staleness axes, then refresh proportionately

> ## ⏳ PARTIAL — steps 0, 1 and the check's share of 7 SHIPPED 2026-08-14
>
> **Step 0 (reproduce)**: done as a RED test, not a Dev Host session — with the real
> check, a project with a FRESH version stamp and a qualifying component whose package
> was never installed returned `ok` and logged nothing (the exact silent under-fire).
> `tests/features/dashboard/services/onOpenChecks/aiContextFreshnessCheck.test.ts`,
> "composition axis" describe, holds the reproduction; it now passes against the fix.
>
> **Step 1 (second axis)**: `aiContextFreshnessCheck` now compares
> `applicableMcpPackages(project)` (new, in `aiDefaultsInstaller.ts`, built on
> `aiDefaultsEntryApplies`) against `readInstalledMcpPackages(projectPath)` (new,
> reads the `.demo-builder-mcp/package.json` manifest; absent/unparseable reads as
> "nothing installed" — can only cause a warning, never mask one). Either axis stale →
> the existing badge + "Regenerate AI files" surface. A parity test pins that
> `applicableMcpPackages` and the installer's own dependency set cannot drift.
> No `AI_CONTEXT_VERSION` bump — generated content is unchanged; only the check grew.
>
> **Step 7 (partial — the check only)**: every run now logs its decision, both axes,
> including the healthy verdict (`debug`); either stale branch logs the WHY at `info`,
> naming the missing packages. A test pins that the healthy path logs.
>
> **REMAINING STEPS SHIPPED 2026-08-14 on `feature/tiered-ai-refresh`** (policy =
> option 1 hash-and-skip, [ADR-013](../../docs/architecture/adr/013-generated-file-edit-survival.md),
> now Implemented): step 3 → `aiBundleService.ts` tier split; step 4 →
> `aiBundleActivationRefresh.ts` silent tier-1 repair every activation; step 5 →
> `generatedFileWriter.ts` seam, hashes in the manifest's `aiFileHashes`, edited
> files kept + reported in the AI Capabilities modal; step 6 → the Regenerate step
> names the packages it downloads; step 8 → the update paths flow through the same
> tiered+hashed function (barrel). Step 2 (per-tier version detail) was dropped as
> YAGNI — with tier 2 silent, a single stamp + the composition axis covers every
> case. Version staleness no longer prompts; only a needed download does.
> Move this item to `.rptc/complete/` when the branch merges to develop.

*(Filed as "tier the AI-bundle refresh". Renamed after research widened it — see
"The check is also under-firing".)*

## Provenance

Asked 2026-08-13, while fixing the global MCP entry that pins the extension version:
"If they need to be regenerated, why wouldn't we do that as part of an update?" Then, on
being asked whether any of it connects to the per-project upgrade flow, researched — and
the answer reversed half the item.

The prompt has a cost history: `.127` and `.128` each bumped `AI_CONTEXT_VERSION`, each
re-prompted every existing project, and each generated support questions. Both times the
change was small.

## The check is also UNDER-firing, which is the more serious half

The first framing was "it prompts too much." Half right. It also stays silent when it
should speak, because it watches the wrong thing.

**Which packages and skills a project needs is a function of its COMPONENTS.**
`projectNeedsAppBuilderTooling` returns true when the project has an EDS storefront, a mesh,
or any App Builder component.

**The freshness check never looks at components.** `aiContextFreshnessCheck` compares the
project's `aiContextVersion` stamp against `AI_CONTEXT_VERSION` and nothing else. One axis
where there are two:

| Axis | Question | Watched? |
|---|---|---|
| Bundle version | did WE change what we ship? | yes |
| Project composition | did YOU change what you have? | **no** |

**So a project that gains a qualifying component silently goes under-equipped.**
`addAppBuilderComponent` calls `componentManager.installComponent` and never reaches
`installAiDefaultsMcpTools` or `generateAIContextFiles`. The project now qualifies for
`@adobe-commerce/commerce-extensibility-tools` and the seven `appbuilder-*` skills and
receives neither. Nothing prompts, because the version did not move. Storefront setup has
the same shape — no `generateAIContextFiles` anywhere under `src/features/eds/`.

`ai-context-authoring` already states the rule — "anything creation writes, Regenerate must
reproduce for a project that gains the qualifying component LATER (dashboard add)."
Regenerate *would* fix it. Nothing tells anyone to run it.

**The upgrade flow itself is mostly innocent.** Six update kinds exist; only
`performAdobeMcpUpdates` regenerates, and the others do not change component membership so
they do not need to. The gap is in ADD, not UPDATE.

## The finding that makes the other half worth doing

**The extension already regenerates silently — on a different path.**
`updateExecutor.ts` (the Adobe MCP package update) runs `npm update`, then calls
`generateAIContextFiles(project.path, project, ctx.extensionPath)` and persists the freshness
stamp. No prompt. No question asked.

Meanwhile `aiContextFreshnessCheck` compares the project's `aiContextVersion` against
`AI_CONTEXT_VERSION` and puts a prompt in front of the identical operation.

So two routes perform the same regeneration and disagree about whether it needs consent.
That is an inconsistency, not a policy — and it means "regeneration must be consented to" is
already false in this codebase.

## What "Regenerate AI files" actually does

Three jobs behind one button, with very different costs:

| Job | Cost | Touches |
|---|---|---|
| Rewrite config paths | instant, offline, deterministic | `.mcp.json`, `.claude/mcp.json`, `.claude/settings.json` |
| Rewrite skills + AGENTS.md | fast, offline | `.claude/skills/*.md`, `AGENTS.md`, the `CLAUDE.md` pointers |
| Install MCP tool packages | slow, needs network, can fail | `.demo-builder-mcp/` via `installAiDefaultsMcpTools` |

The prompt asks permission for the third every time, even when only the first or second
changed. `AI_CONTEXT_VERSION` is a single integer, so the check cannot tell which happened —
only that *something* did.

Verified: regeneration is **not destructive to user content**. `skillsWriter` only writes the
files it owns; a user-authored skill in `.claude/skills/` survives. That removes the main
objection to doing it silently.

## Goal

**Watch both axes, then act proportionately to what is actually stale.** Repair what we own
without asking; ask only before spending someone's time or network; and stop being silent
when a project has genuinely outgrown its bundle.

| What is stale | Response |
|---|---|
| Config paths point at a dead build | silent repair on activation |
| Skills / AGENTS.md text changed | silent, or a passive notice — see the risk below |
| A package must be downloaded | prompt, as today |
| **The project gained a component** | **prompt** — it needs a package it does not have |

That last row is the case that currently produces nothing at all, and it is the one most
worth a prompt: a real download, caused by something the user just did, at a moment when
they are already thinking about that component.

Most releases would then prompt nobody, while the people who need a prompt would start
getting one.

## The risk to settle first

Nothing stops a user editing `AGENTS.md` or a generated skill, and **today the prompt is the
only thing standing between those edits and being overwritten.** Going silent removes that
without replacing it.

Options, in order of preference:

1. Record a hash of each generated file when written; on refresh, overwrite only what still
   matches. A modified file gets left alone and reported.
2. Accept the loss deliberately and say so where users can see it — `AGENTS.md` already
   declares itself generated.
3. Keep the prompt for the skills tier only.

Do not go silent by simply not noticing.

## Logging — silence must stop being ambiguous

Every failure chased on 2026-08-12/13 was invisible for want of a line: a `dist/` from
another checkout, a global MCP entry frozen at an old version, a project qualifying for
packages it never received. **This plan proposes to make MORE things silent**, so it has to
say what replaces the prompt as the trace.

**Today silence means two different things.** `aiContextFreshnessCheck` returns
`{ status: 'ok' }` and logs nothing when the stamp is current; it logs only on the stale
branch. So "we checked and the bundle is fine" and "the check never ran" are
indistinguishable in Debug Logs — the same ambiguity this repo's CLAUDE.md flags for
`|| echo "none"`, where the output reads the same whether the command found nothing or never
executed. It is also exactly why the under-firing case is invisible: a project that has
outgrown its bundle logs the same nothing as a healthy one.

Requirements, in priority order:

1. **Log the DECISION, not just the exception.** One line per check with what was compared
   and the verdict — version axis, composition axis, result. A check that only speaks when
   unhappy cannot be distinguished from a check that is broken.
2. **Anything done silently leaves a record of what changed.** The precedent is already set
   by `global-mcp-version-pin` (`d90b4f3f`): `info` naming the repair when it fires, `warn`
   when the repair itself fails, because a failed silent repair reopens the dead end with
   nobody watching. Tier 1 and tier 2 need the same treatment.
3. **Say WHY, not just WHAT.** "regenerated AI files" is not useful six weeks later.
   "regenerated: project gained app-builder component, installed
   @adobe-commerce/commerce-extensibility-tools@^3.4.0" is what a support question is
   answered from — and support questions are exactly what `.127`/`.128` produced.
4. **Channel discipline.** Debug Logs for the routine per-open verdict; User Logs for
   anything the user must act on or would be surprised by (a package download, a file left
   alone because they had edited it). `debug()` is excluded from the export buffer, so
   anything support may need to see must not be `debug`-only.
5. **A skipped file is an event.** If tier 2 lands hash-and-skip, "left AGENTS.md alone
   because it was modified" must be logged. A silent skip is how someone's edit survives
   for months and then vanishes on the one release that changes policy.

**Test the ambiguity, not just the happy path.** The suite should pin that a healthy check
logs something, not merely that a stale one does — otherwise the regression that reintroduces
silence passes.

## Execution plan

0. **Reproduce the under-firing case first**, because it is the half nobody has seen fail:
   take a project with no App Builder component, add one from the dashboard, and confirm that
   `.demo-builder-mcp/` gains no package, `.claude/skills/` gains no `appbuilder-*` directory,
   and nothing prompts. That is the bug; everything else is proportionality.

1. **Give the freshness check its second axis.** It needs to answer "does this project's
   bundle match its CURRENT composition?" — i.e. evaluate `aiDefaultsEntryApplies` against
   the project now and compare with what is installed. Cheap and offline: the entries are in
   `ai-defaults.json` and the evidence is a directory listing of `.demo-builder-mcp/`.

2. **Make the check say WHAT is stale, not just THAT something is.** Either compare
   per-artifact, or have `AI_CONTEXT_VERSION` carry which tiers each bump touched. The
   constant's comment already records what each version added by convention — formalise it.
3. **Split `generateAIContextFiles` by tier** so callers can request one without the others.
   The three writers already exist as separate services; the orchestrator is what fuses them.
4. **Repair tier 1 on activation**, silently, for every known project. Offline and
   deterministic, so it cannot hang a window.
5. **Decide the tier-2 policy** using the risk section above, and implement whichever wins.
6. **Leave tier 3 behind a prompt**, and make that prompt say what it will download — the
   current wording covers all three jobs and so explains none of them.
7. **Give every check and silent action its log line**, per the logging section above —
   including the healthy verdict, so silence stops being ambiguous.
8. **Reconcile the two paths.** Whatever policy lands, `updateExecutor`'s silent regeneration
   and the freshness check must follow the same one.

## Constraints

- `ai-context-authoring` governs: the four gate seams (`mcpConfigWriter.buildMcpConfig`,
  `aiDefaultsInstaller.installAiDefaultsMcpTools`, `componentInstallationOrchestrator`,
  `aiHandlers.handleRegenerateAiFiles`) change all or none, and any change to generated
  content still needs an `AI_CONTEXT_VERSION` bump.
- **Regenerate parity**: whatever creation writes, the refresh must reproduce for a project
  that gains the qualifying component later.
- Silent work must never be able to hang activation. Tier 1 is offline by definition; keep
  it that way.
- Do not fold this into `global-mcp-version-pin`. That is a small repair; this is a redesign
  of the update path, and the repair should not wait for it.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-13-tier-the-ai-bundle-refresh.md`. Start with step 0 —
> reproduce the under-firing case, where adding an App Builder component to a live project
> leaves it without the packages and skills it now qualifies for and prompts nobody. That is
> the actual bug; the prompting-too-much half is proportionality on top of it. Then decide
> whether a user's edits to a generated file should survive a refresh, because the rest
> follows from that answer.
