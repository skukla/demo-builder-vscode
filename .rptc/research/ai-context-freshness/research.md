# Research: keep a project's generated AI context in sync with the extension

**Date:** 2026-07-08
**Type:** Codebase design-validation (RPTC research; 3 parallel research agents)
**Feeds:** `/rptc:feat` — AI-context freshness check
**Supersedes the plan approach in:** `.rptc/backlog/2026-06-01-ai-ready-skills-drift.md` (skills-only per-facet detector + amber badge)

## Problem

Every project gets a **copy** of the extension's AI context written in at creation time —
`.claude/skills/*.md` (instruction files), `.claude/mcp.json` + `.mcp.json` (tool-connection config),
`.claude/settings.json`, and `AGENTS.md` / `CLAUDE.md` / `.claude/CLAUDE.md` (project context). Nothing
reconciles those copies with the extension version afterward. They refresh only when the user manually
clicks **Regenerate AI Files**, and the user gets no signal that their project is stale.

Surfacing symptom: an AI Chat session failed because a project was missing `register-custom-block.md` —
the project predated that skill template, and nothing flagged the gap.

`.claude/mcp.json` staleness already got a reactive fix this session (the on-open self-heal orchestrator +
`mcpDriftDetector`/`mcpHealthCheck`). Skills, `AGENTS.md`, and settings have no equivalent. All facets share
ONE remediation: `handleRegenerateAiFiles` rewrites the whole bundle.

## Approaches compared

- **A — Per-facet drift detectors** (a skills detector, an mcp detector, an AGENTS detector…): precise, but
  N detectors + N signals all triggering the *same* Regenerate. Redundant; you keep discovering new facets.
- **B — One AI-context "freshness" check (the broad fix):** stamp a version into the generated bundle;
  on dashboard-open, if the project's stamp is older than the extension's, treat the whole bundle as stale
  and offer Regenerate. Subsumes skills + mcp + AGENTS drift in one check.
- **C — Auto-regenerate all projects on extension update:** eager, global; make projects fresh without an
  open-time check.

## Findings (verified against the code)

### 1. Regenerate is a blunt full-bundle OVERWRITE — pivotal for the design
`handleRegenerateAiFiles` (`aiHandlers.ts:172`) → `generateAIContextFiles`
(`projectFinalizationService.ts:172`) runs three writers, each doing UNCONDITIONAL `writeFile` (no merge,
no skip-if-exists):
- `AGENTS.md` regenerated from the manifest (hand edits LOST); both `CLAUDE.md` pointers reset.
- `.claude/mcp.json`, `.mcp.json`, **`.claude/settings.json`** fully replaced — `settings.json` becomes just
  the git-sync hook (or `{}`), wiping any user hooks/permissions. **Highest-impact clobber.**
- The 12 shipped `DEMO_BUILDER_SKILLS` overwritten by fixed filename.
- SURVIVES: user-authored EXTRA skills (dir is not deleted), saved AI prompts (globalState/manifest, never
  touched), `.gitignore` (append-only idempotent).

Implication: a broad freshness check that **silently** heals would silently destroy user customizations.

### 2. The MCP auto-heal precedent does NOT transfer to a broad trigger
`mcpHealthCheck` already auto-runs the full regenerate on open (`dashboardHandlers.ts:145-148`,
`heal: () => handleRegenerateAiFiles(context)`), WITHOUT a consent prompt. It is defensible only because it
fires on a narrow, machine-owned failure — `detectMcpDrift` is a pure `fs.access` probe for a missing MCP
binary path (`mcpDriftDetector.ts:57`), files the user never edits — and it announces itself
("Updating AI configuration…") first. A version-staleness trigger can fire while the user has legitimate
edits, so it cannot borrow that silence.

### 3. No AI-context version stamp exists
Grep found no `aiContextVersion`/`createdWithVersion`/`extensionVersion`/content hash in the AI or manifest
paths. The manifest's `version: '1.0.0'` (`projectConfigWriter.ts:81`) is a schema literal, not the
extension version; nothing records the version that produced the AI bundle.
- **Canonical extension-version read:** `context.extension.packageJSON.version` (used at `extension.ts:95`,
  `updateManager.ts:55`). A semver comparator exists: `isNewerVersion` (`updateManager.ts:299`).
- **Write point:** `generateAIContextFiles` is the single funnel hit by ALL creation/regen callers
  (creation `executor.ts:506`, regenerate `aiHandlers.ts:219`, rename `projectRenameService.ts:113`,
  update apply `updateApplyService.ts:212` + `updateExecutor.ts:379`). Stamp there → the stamp always
  reflects what's on disk.
- **Persistence:** mutate the in-memory `Project`, then `StateManager.saveProject`. Adding an
  `aiContextVersion` field is 4 mechanical touch points (Project type, manifest writer, manifest interface,
  loader) — matches how every other stamp (componentVersions, meshState.sourceHash) is written.
- **Read point:** the full `Project` is already in memory on open — a stamp compare is zero extra I/O.

### 4. Version stamp > content hash for THIS codebase
Two of three writers heavily interpolate per-project data — `mcpConfigWriter` (socket/tools/instance paths),
`aiContextWriter`/AGENTS.md (name, status, commerce URL, org/workspace, block libs). Consequences for a
content-hash signal: (a) you must regenerate the whole bundle in-memory to compute the "would-write" hash —
no savings; (b) a stored hash rots when mutable project fields change (status flip, URL edit) → false
"regenerate available." A version stamp avoids both.
- BUT raw `package.json` version is too noisy: beta bumps constantly (`beta.121 → 122…`) with no AI-bundle
  change → nags on nearly every update. **Fix: a dedicated, hand-bumped `aiContextVersion` (a bundle
  revision) bumped only when skills/templates actually change.** Discipline cost: bump it in the same commit
  that changes a skill/template.

### 5. Host = on-open orchestrator (B), not the update flow (C)
`OnOpenCheck` contract (`onOpenChecks/types.ts:76`): `{ id, mode:'background', edsOnly?, reRunnable?, run }`;
`run` gets the FULL loaded `Project`; returns `{status,message?,data?}`; orchestrator stamps `checkId`,
enforces a once-per-session-per-project guard and `edsOnly` gate; `handleRequestStatus` runs it on every
dashboard open (`dashboardHandlers.ts:169`). A `createAiContextFreshnessCheck` plugs in beside
`createMcpHealthCheck` in ~3 edits (add `CHECK_IDS.AI_CONTEXT_FRESHNESS`, new check file reusing the same
heal closure, register), surfacing via the existing `checkResult` → `useDashboardStatus` → AI badge path.
- Approach C can't be hosted cleanly: the extension-update path `return`s early into a VSIX reinstall +
  host restart (`checkUpdates.ts:164`), so no post-hook runs; a global reconciler would need a new
  activation-time loop and would eagerly clobber dormant projects. The update flow ALREADY regenerates the
  specific project whose Adobe-MCP package changed (`updateExecutor.ts:379`) — leave that as-is. B makes C
  unnecessary.
- Keep `mcpHealthCheck` alongside the freshness check — it catches a *different* failure (physically missing
  binaries, e.g. an aborted npm install) that a version stamp will not.

## Recommendation

Build the **broad fix (B)** as a single on-open AI-context freshness check, with two research-driven refinements:

1. **Signal:** a dedicated, manually-bumped `aiContextVersion` bundle revision (NOT raw `package.json`
   version, NOT a content hash). Stamped in `generateAIContextFiles`, compared in-memory on open via
   `isNewerVersion`.
2. **Remediation: prompt-then-heal, never silent.** The check surfaces "This project's AI files are out of
   date — Regenerate?" and overwrites only on confirm — honoring the existing "user opts in; regenerate
   overwrites" guardrail and avoiding the destructive-overwrite data loss.
3. **Host:** the on-open orchestrator, beside `mcpHealthCheck` (kept — different failure mode).

### Follow-up (separate, larger; medium confidence)
Make Regenerate **edit-preserving** — stop wiping `.claude/settings.json` (user hooks/permissions) and
`AGENTS.md` user notes. This removes the data-loss risk at the source and would also make the *existing*
MCP auto-heal safer (could then auto-heal without a prompt). File as its own item.

## Open decisions for the feature plan
- Accept the hand-bumped `aiContextVersion` discipline (bump on skill/template change) vs. wanting
  auto-detection (rejected here as expensive/fragile).
- Take the edit-preserving-Regenerate follow-up now or later (affects whether prompt-then-heal is permanent
  or an interim mitigation).
