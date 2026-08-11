# ✅ SHIPPED (2026-07-08) — AI-context freshness check (broad fix)

> **Final design differs from the plan below on ONE point (changed during Phase-4 code review):** the
> remediation is **detect-only "badge click-to-heal"**, NOT the on-open prompt the plan describes. Code
> review flagged that prompting in an `OnOpenCheck.run` violates the framework's P1 contract ("don't prompt
> on open") and created a concurrent-heal race with `mcpHealthCheck`. So the check now returns a `warning`
> when stale → the AI badge flips to **"AI files out of date"** (which surfaces the existing "Regenerate AI
> files" action; `DashboardStatusHeader` gates it on a red/yellow badge). The check is **`reRunnable`** (a
> cheap read-only stamp compare) so the badge clears the moment the user regenerates. Everything else shipped
> as planned: `AI_CONTEXT_VERSION` constant in `core/constants.ts`, the `aiContextVersion` manifest stamp
> (persisted by ALL 5 `generateAIContextFiles` callers — a code-review fix; the plan's single-caller-persist
> was incomplete), and the check registered beside `createMcpHealthCheck`.
>
> Follow-up filed: `.rptc/backlog/2026-07-08-edit-preserving-regenerate-ai-files.md` (make Regenerate
> non-destructive so the check can later auto-heal). This feature subsumes the old
> `2026-06-01-ai-ready-skills-drift` backlog item.
>
> ---

# Plan: AI-context freshness check (broad fix)

## Step 0 — RPTC re-init (only if context is cleared)
Re-invoke `/rptc:feat` with "Plan is approved, continue to implementation". Work on `develop` (this
session ships features directly to develop). Then resume at Phase 3.

## Context
Every project gets a **copy** of the extension's AI context at creation — `.claude/skills/*.md`,
`.claude/mcp.json`/`.mcp.json`, `.claude/settings.json`, `AGENTS.md`/`CLAUDE.md`. Nothing reconciles those
copies with the extension afterward; they refresh only when the user manually clicks "Regenerate AI Files",
and the user gets no signal that a project is stale. Symptom: a project was missing `register-custom-block.md`
because it predated that skill. `.claude/mcp.json` staleness already got a reactive fix this session (the
on-open self-heal orchestrator); skills / AGENTS / settings have none. All facets share ONE remediation:
`handleRegenerateAiFiles` rewrites the whole bundle.

Full research: `.rptc/research/ai-context-freshness/research.md`. It validated the "broad fix" (one freshness
check subsuming all facets) over per-facet detectors and an update-flow global reconciler, with the two
locked refinements below.

## Approach (research-locked)
- **Signal:** a single hand-bumped module constant `AI_CONTEXT_VERSION` (integer), bumped when
  skills/templates/AGENTS content changes — NOT `package.json` version (nags on every beta bump), NOT a
  content hash (per-project interpolation in the writers makes it expensive + false-positive-prone). Stamp
  it into the project manifest whenever the AI bundle is generated; on dashboard-open, a project is stale
  when `(project.aiContextVersion ?? 0) < AI_CONTEXT_VERSION` (also catches every pre-feature project).
- **Remediation: prompt-then-heal, never silent.** Regenerate is a blunt full-bundle OVERWRITE that
  clobbers user edits to `.claude/settings.json` (hooks/permissions), `AGENTS.md`, and the 12 shipped
  skills. So the check must ASK ("This project's AI files are out of date — regenerate?") and only run
  `handleRegenerateAiFiles` on confirm. (The existing `mcpHealthCheck` auto-heals silently, but only because
  it fires on machine-owned missing-binary drift — that precedent does not transfer.)
- **Host:** a new on-open check `createAiContextFreshnessCheck` beside `createMcpHealthCheck`. Keep
  `mcpHealthCheck` (it catches a different failure — physically missing binaries — a version stamp won't).

## Implementation steps (TDD each)

### 1 — Version constant + manifest stamp field
- New `AI_CONTEXT_VERSION = 1` in `src/core/constants.ts` (shared home both features import; comment:
  "bump when any AI-context template/skill changes — see skillsWriter / aiContextWriter / mcpConfigWriter").
- Add `aiContextVersion?: number` to `Project` (`src/types/base.ts`) and the 3 manifest touch points:
  the `ProjectManifest` interface + the loader's project-construction block (`src/core/state/projectFileLoader.ts`),
  and the manifest write allowlist (`src/core/state/projectConfigWriter.ts`, beside `componentVersions`/`meshState`).
- **Tests:** manifest round-trip — a project written with `aiContextVersion` loads back with it intact.

### 2 — Stamp on generate + persist on regenerate
- `generateAIContextFiles` (`src/features/project-creation/services/projectFinalizationService.ts:172`) sets
  `project.aiContextVersion = AI_CONTEXT_VERSION` on the passed project (single point; all 5 callers share it).
- **Persistence:** `handleRegenerateAiFiles` (`src/features/dashboard/handlers/aiHandlers.ts`) currently does
  NOT save after generating — add `await <stateManager>.saveProjectConfigOnly(project)` so the stamp
  persists. This is the path both the dashboard button AND the on-open heal use, so it clears staleness for
  both. Creation persists via finalization already; confirm the manifest write happens AFTER the stamp is set
  (a creation test asserts the manifest carries `aiContextVersion`). Rename/update-apply also regenerate —
  ensure they persist the stamp (they already write the manifest; add a save only if missing).
- **Tests:** after `generateAIContextFiles`, `project.aiContextVersion === AI_CONTEXT_VERSION`;
  `handleRegenerateAiFiles` saves the stamped project (extend the aiHandlers test).

### 3 — The on-open freshness check
- New `src/features/dashboard/services/onOpenChecks/aiContextFreshnessCheck.ts` exporting
  `createAiContextFreshnessCheck({ currentVersion, heal })` — mirrors `createMcpHealthCheck`. Re-export from
  `onOpenChecks/index.ts`. `reRunnable: false` (once per session — no nagging). NOT `edsOnly` (AI context is
  generated for all projects).
  - `run(ctx)`: stale = `(ctx.project.aiContextVersion ?? 0) < currentVersion`. Fresh → `{ status: 'ok' }`
    (no prompt). Stale → `vscode.window.showInformationMessage("This project's AI files are out of date —
    regenerate to match the current extension?", "Regenerate", "Not now")`. On "Regenerate": `post` a warning
    ("Updating AI configuration…"), `await heal()` (= `handleRegenerateAiFiles(context)`), return ok/error. On
    "Not now"/dismiss: return `{ status: 'ok' }` (no write). Non-fatal (orchestrator catches).
- Add `AI_CONTEXT_FRESHNESS: 'ai-context-freshness'` to `CHECK_IDS` (`src/types/messages.ts:211`).
- Register in the `checks` array (`src/features/dashboard/handlers/dashboardHandlers.ts:143`) beside
  `createMcpHealthCheck`, passing `{ currentVersion: AI_CONTEXT_VERSION, heal: () => handleRegenerateAiFiles(context) }`.
- **Tests** `aiContextFreshnessCheck.test.ts`: fresh → ok, no prompt, no heal; stale (incl. undefined stamp)
  → prompt shown; "Regenerate" → heal called, ok; "Not now"/dismiss → heal NOT called; heal error → error.
  Mock `showInformationMessage` + the injected `heal`.

### 4 — Surface it on the AI badge
- In `useDashboardStatus.ts`, add a `checkResult` branch for `CHECK_IDS.AI_CONTEXT_FRESHNESS`, reusing the
  same AI-badge "updating/healing" pattern the `mcp-health` branch already uses (warning while the heal is in
  flight; back to Ready after). No new webview channel or component.
- **Tests:** extend the useDashboardStatus test — the freshness checkId drives the AI-badge state like mcp-health.

## Out of scope (separate follow-up — note, do not build now)
Making Regenerate **edit-preserving** (stop overwriting user-edited `.claude/settings.json` hooks/permissions
and `AGENTS.md` notes). Prompt-then-heal is the interim mitigation; the follow-up would remove the data-loss
risk at the source and let both this check and the existing MCP auto-heal run without a prompt. File as its
own backlog item.

## Files
- New: `src/features/dashboard/services/onOpenChecks/aiContextFreshnessCheck.ts` (+ index re-export) and its test.
- Modify: `src/core/constants.ts`, `src/types/base.ts`, `src/core/state/projectConfigWriter.ts`,
  `src/core/state/projectFileLoader.ts`, `src/features/project-creation/services/projectFinalizationService.ts`,
  `src/features/dashboard/handlers/aiHandlers.ts`, `src/types/messages.ts`,
  `src/features/dashboard/handlers/dashboardHandlers.ts`, `src/features/dashboard/ui/hooks/useDashboardStatus.ts`.

## Verification
- TDD per step (RED→GREEN). Then the gate: `npx tsc --noEmit`, `npm run lint`, full `jest`, and
  `madge --circular` on the touched dashboard/state modules.
- Manual (EDH): open a project whose manifest has an older/absent `aiContextVersion` → confirm the
  "out of date — regenerate?" prompt appears once; click Regenerate → AI badge shows updating → returns Ready
  and the manifest's `aiContextVersion` is now current (re-open → no prompt). Confirm a fresh project
  (stamp == current) shows no prompt.
