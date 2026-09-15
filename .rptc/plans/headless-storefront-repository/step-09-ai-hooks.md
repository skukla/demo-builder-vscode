# Step 09 — The AI hooks and AGENTS.md follow the repository record

Item: [[EDS-13g]]. Decisions: 3, 5 (revised), 7 (owner, 2026-09-15); principle 5. Depends on
steps 01, 03 and 04 (04 for the wording that names `sync_storefront` for headless).

Line numbers in `claudeSettingsWriter.ts` and `homeAiContextWriter.ts` are `origin/develop`'s
(`9dbdfbaa7`); re-read them after step 01.

## Goal

An agent editing a headless project's storefront, from the project's own Chat or from the
home Chat, has its edits committed and pushed to the SC's repository, the same as for Edge
Delivery. A clone without a recorded repository (a repo-less headless project, a mesh, an App
Builder app) is never pushed. AGENTS.md and the `sync-changes` skill say so, and existing
projects learn it on the next activation.

## Facts

- Per-project hook: `generateClaudeSettings` adds the PostToolUse git-sync hook when
  `resolveStorefrontPath` finds `componentInstances['eds-storefront'].path`
  (`claudeSettingsWriter.ts:100-127, 253-255`); the command pushes the clone's `origin` when the
  edited file is under that path (`buildGitSyncCommand`, `:330-348`). Called from
  `mcpConfigWriter.ts:97`, which both creation and Regenerate AI Files reach (tier 1,
  `aiBundleService.ts`).
- Home hook, after step 01: `buildOwnStorefrontGuard` (`claudeSettingsWriter.ts:359-372`)
  prints the resolved path of `componentInstances["eds-storefront"].path` from the enclosing
  project's manifest, and `buildHomeGitSyncCommand` (`:412-434`, guard 6 at `:399-406`) pushes
  only when the repository top equals it (`b23b1760b`). Its script holds no single quotes and
  reads the manifest with Node.
- AGENTS.md: `buildStorefront` returns nothing unless `isEdsProject` (`agentsMdSections.ts:192-194`);
  its first lines (local path, GitHub repo) are kind-neutral, the rest is blocks, Helix and
  typography. `buildNotesForAgents` adds the EDS `sync_storefront` note (`:620-624`).
  `buildComponentRepositories` lists every instance with `metadata.githubRepo`
  (`:300-327`), so a headless repository appears there by itself once recorded.
- The `sync-changes` skill says headless projects do not use `sync_storefront`
  (`templates/skills/sync-changes.md:46-49`).
- `AI_CONTEXT_VERSION = 32` (`src/core/constants.ts:238`), pinned by
  `tests/core/constants.test.ts:128`. The four App Builder tooling gate seams
  (`ai-context-authoring` Discipline 2) are not touched by this step.

## The exact changes

- `claudeSettingsWriter.ts:253-255` `resolveStorefrontPath(project)` →
  `getStorefrontRepository(project)?.path`. Doc on `generateClaudeSettings` (`:91-99`): "a
  storefront with a repository of its own". EDS change, stated: an EDS project whose manifest
  has a storefront path but no `githubRepo` stops getting the hook (it could only push to an
  unrecorded `origin`).
- `buildOwnStorefrontGuard` (home): the Node one-liner picks
  `m.componentInstances[m.componentSelections.frontend]`, else `m.componentInstances["eds-storefront"]`,
  and prints its resolved `path` only when `metadata.githubRepo` is a string containing `/`.
  The same selection rule as `getStorefrontInstance` + `getStorefrontRepository` (step 02),
  written a second time because a shell hook cannot import TypeScript; a test pins the two
  against each other (below). No single quotes. The doc's guard 6 (`:399-406`) and
  `homeAiContextWriter.ts`'s header (`:20-26`), file list (`:62`) and write comment
  (`:98-101`) say "the project's own storefront repository" instead of "Edge Delivery
  storefront".
- `agentsMdSections.ts`:
  - `buildStorefront` (`:192-`): gated on `getStorefrontRepository(project)?.path`. Shared lines:
    heading, local path, GitHub repo. EDS lines (preview, live, blocks, Helix, typography) only
    for `kind === 'eds'`. Headless lines: "The dev server reads these files; restart it to see
    some changes." and "Write and Edit changes are committed and pushed to your repository
    automatically; call `sync_storefront` for anything else. Nothing is published."
  - `buildNotesForAgents` (`:620-624`): a headless note beside the EDS one.
  - Every interpolated value keeps `sanitizeTemplateValue` / `sanitizeGithubSlug` /
    `escapeMarkdown`, as the EDS lines do.
- `templates/skills/sync-changes.md:46-49`: the headless section rewritten to the two lines
  above, plus "A headless project created before headless projects had a repository has
  neither; a new project has both."
- `src/core/constants.ts:238`: `AI_CONTEXT_VERSION = 33`, with a `v33` comment: "headless
  storefronts with a repository of their own get the git-sync hook, the AGENTS.md storefront
  section and the sync-changes wording; the home hook pushes any project's own storefront
  repository, never a clone without one."

## Reuse

`generateClaudeSettings`, `buildGitSyncCommand`, `buildOwnStorefrontGuard`, `buildStorefront`,
the sanitizers, `getStorefrontRepository`, the activation sweep (`aiBundleActivationRefresh.ts`)
for existing projects, `GeneratedFileWriter` for AGENTS.md and the skill (hash-and-skip:
an SC-edited AGENTS.md or skill is skipped and reported, never overwritten — principle 2).
Nothing new.

## Tests (failing first)

- `claudeSettingsWriter.test.ts`: "a headless project with a repository gets the hook on its
  clone path"; "a headless project without one gets none"; "an EDS project without githubRepo
  gets none" (the stated change); EDS with a repository unchanged.
- `homeGitSyncHook.test.ts` (step 01's real-hook suite, bare origins, every `GIT_*` variable
  stripped): "pushes an edit in a
  headless storefront whose manifest records its repository"; "does not push a repo-less
  headless clone" (already true after step 01; kept as the control); "does not push the mesh".
- New case in `homeGitSyncHook.test.ts`: the guard and `getStorefrontRepository` agree on a
  table of manifest shapes (EDS, headless with and without repository, missing
  `componentSelections`), so the two copies of the rule cannot drift unseen.
- `aiContextWriter.writeAgentsMd.test.ts`: headless storefront section present with the two
  lines and without Helix; absent for repo-less; EDS section unchanged.
- `tests/core/constants.test.ts:128`: 33.
- `skillsWriter.hashAndSkip.test.ts` / `skillsWriter.toolGating.test.ts`: counts unchanged (no
  skill added or removed); rerun to confirm.
- Regenerate parity: `tests/features/dashboard/handlers/aiHandlers-setup.test.ts` cases — a
  headless project with a repository regenerates the same hook and section creation wrote; a
  repo-less one regenerates neither (the same bundle creation wrote for it).

## Docs that change

`src/features/ai/README.md`, `src/features/CLAUDE.md` (the ai and skillsWriter blurbs, if they
say EDS-only for the hook), `docs/systems/mcp-server.md` §12 (per `ai-context-authoring`
"Related"), CHANGELOG.

## Acceptance

| Predicate | Evidence |
|---|---|
| The hook path is read one way | `grep -n "function resolveStorefrontPath" src/features/project-creation/services/aiBundle/claudeSettingsWriter.ts` count captured equals 0; control: `grep -n "getStorefrontRepository"` on the same file counts 1 or more |
| The two rule copies agree | the agreement table test |
| Version bumped with a comment | `constants.test.ts` and a `v33` comment above the constant |
| Gate green | `gate`, pre-push |
| Live, per project (owner confirms the push) | step-03 project: open its Chat, ask the agent to change a string in a page; a `GIT_SYNC_SIGNATURE` commit lands on GitHub |
| Live, home (owner confirms) | the same from the home Chat; then an edit in `components/headless-commerce-mesh`: no commit |
| Live, existing projects | restart the dev host: the sweep refreshes a pre-step EDS project's AGENTS.md (stamp 33) with its storefront section unchanged |

## Reversal

Revert the commit. The sweep does not downgrade a bundle, so projects refreshed at 33 keep
the hook until regenerated by a build that writes 32; the hook only pushes to the recorded
repository, so leaving it is safe. Hash-and-skip means an SC-edited AGENTS.md was never
touched.
