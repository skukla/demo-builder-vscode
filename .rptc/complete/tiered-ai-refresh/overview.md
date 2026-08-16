# Plan: Tiered AI-Bundle Refresh + Hash-and-Skip Edit Survival + Skill Gating

**Branch/worktree**: `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode.worktrees/feature/tiered-ai-refresh` (all paths below are relative to this root)
**Perspective**: Clean — one write seam, deep interfaces, no speculative abstraction.
**Governing artifacts**: ADR-013, `.claude/skills/ai-context-authoring/SKILL.md`, backlog `2026-08-13-tier-the-ai-bundle-refresh.md`.

---

## Component Design (module boundaries first)

### The one seam: `GeneratedFileWriter` (NEW)

`src/features/project-creation/services/generatedFileWriter.ts` — the ADR-013 hash-and-skip write path. **Every AI-bundle file write flows through an instance of this.** A writer that bypasses it reverts that file to overwrite behavior (ADR-013 consequence), so the review rule is: after this feature, `skillsWriter`, `aiContextWriter`, and `mcpConfigWriter` contain **zero direct `fsPromises.writeFile` calls for bundle files**.

```ts
export interface GeneratedFileWriteReport {
    written: string[];   // overwritten or created (project-relative posix paths)
    skipped: string[];   // user-edited → left alone (the ADR "event, not silence")
    removed: string[];   // gated skills removed
}

export interface GeneratedFileWriter {
    /** Hash-and-skip write (ADR-013 matrix below). */
    write(relPath: string, content: string): Promise<'written' | 'skipped' | 'unchanged'>;
    /** Unconditional write for content that ALREADY incorporates user edits
     *  (the settings.json merge). Records the hash; never skips. */
    writeMerged(relPath: string, content: string): Promise<void>;
    /** Remove only on positive proof of ownership (see removal matrix). */
    remove(relPath: string, currentTemplate?: string): Promise<'removed' | 'skipped' | 'absent'>;
    report(): GeneratedFileWriteReport;
    /** FULL updated relPath→sha256 map (seeded from recorded, entries updated/
     *  deleted as touched) — assign to project.aiFileHashes and persist. */
    hashes(): Record<string, string>;
}

export function createGeneratedFileWriter(
    projectPath: string,
    recordedHashes: Record<string, string>,
    logger: Logger,
): GeneratedFileWriter;
```

**Write matrix (ADR-013)** — `sha256` via node `crypto.createHash`; keys are posix-style project-relative paths (`AGENTS.md`, `.mcp.json`, `.claude/skills/add-component.md`):

| On disk | Recorded hash | Action |
|---|---|---|
| absent | any | write, record hash |
| present, == recorded | recorded | ours → overwrite (or `'unchanged'` if content identical — no disk touch, keeps the activation common path write-free), record new hash |
| present, != recorded | recorded | **skip**, log (`info`, user channel — a skipped file is an event), report |
| present | none (pre-ADR) | treat as unmodified ONCE → overwrite, record (per ADR-013) |

**Removal matrix** (stricter than write — deletion needs positive proof; the treat-as-unmodified-once rule does NOT extend to deletes):

| Condition | Action |
|---|---|
| recorded hash matches disk | remove, drop hash entry |
| no recorded hash, disk content == `currentTemplate` (byte-equal to what we'd write today) | remove (provably ours) |
| anything else | leave + report in `skipped` |
| absent | drop stale hash entry, `'absent'` |

**Design decisions folded in (state them at review, don't relitigate silently):**
- `.claude/settings.json` keeps `mergeClaudeSettings` (a strictly better edit-survival mechanism than skip — skipping would freeze our git-sync hook the moment a user adds any setting) and lands via `writeMerged` so it still flows through the seam and appears in `hashes()`/`report()`.
- A user-edited `.mcp.json` is skipped → they own it → they lose silent path repair after VSIX updates. Logged + surfaced (that's the ADR trade).
- Adobe skill-bundle copies (`copySkillFolder`) route through `write()` too — "ALL generated files".
- `ensureMcpFilesGitignored` (append-only, idempotent) and creation-time `.env` files are NOT bundle content — out of seam scope.

### Hash store: manifest field

`src/types/base.ts` — `Project.aiFileHashes?: Record<string, string>` (next to `aiContextVersion`, docblock citing ADR-013).
`src/core/state/projectConfigWriter.ts` — add to `addOptionalManifestFields` (omit-when-empty pattern, matching every sibling).

### Tiered orchestrator: `aiBundleService.ts` (NEW)

`src/features/project-creation/services/aiBundleService.ts` — `generateAIContextFiles` MOVES here from `projectFinalizationService.ts` (which stays a pure creation-phase module). Barrel re-export keeps the name, so **zero import churn** at all FIVE call sites (all import from `@/features/project-creation/services` — verified: executor.ts:26, aiHandlers.ts:24, updateApplyService.ts:25, updateExecutor.ts:27, and projectRenameService.ts:110 via dynamic barrel import — its suite joins the Step-3 verification set) and existing barrel-level jest mocks keep working.

```ts
export interface AiBundleRefreshResult {
    skills: string[];                       // existing contract (written demo-builder skills)
    report: GeneratedFileWriteReport;       // written / skipped / removed
}

/** Tier 1: .mcp.json + .claude/mcp.json + settings merge + gitignore. Offline. */
export async function refreshMcpConfigs(
    projectPath: string, project: Project, extensionPath: string,
    writer: GeneratedFileWriter, nodePath?: string,
): Promise<void>;

/** Tier 2: AGENTS.md + CLAUDE.md pointers + skills (incl. gating removal). Offline. */
export async function refreshContextAndSkills(
    projectPath: string, project: Project, extensionPath: string,
    writer: GeneratedFileWriter,
): Promise<{ skills: string[] }>;

/** Tier 1+2. Creates the writer from project.aiFileHashes, stamps
 *  project.aiContextVersion = AI_CONTEXT_VERSION, sets project.aiFileHashes =
 *  writer.hashes(). Caller persists (every call site already saves after —
 *  unchanged contract). Keeps onProgress + collect-errors-then-throw semantics. */
export async function generateAIContextFiles(
    projectPath: string, project: Project, extensionPath: string,
    onProgress?: ProgressTracker,
): Promise<AiBundleRefreshResult>;
```

Tier 3 (packages) stays `installAiDefaultsMcpTools` — already a separate call at every site.

### Activation sweep: `aiBundleActivationRefresh.ts` (NEW)

`src/features/project-creation/services/aiBundleActivationRefresh.ts` — requirements 3 + 4 in one deterministic pass, modeled on the `refreshGlobalMcpIfPresent` precedent (extension.ts:112).

```ts
/** Fire-and-forget from activate(). NEVER throws; never blocks activation. */
export async function refreshAiBundlesOnActivation(
    extensionPath: string,
    logger: Logger,
    deps?: Partial<ActivationRefreshDeps>,   // scanner/loader/configWriter — test seam
): Promise<void>;
```

Flow (sequential per project, per-project try/catch isolation):
1. `new ProjectDirectoryScanner(logger).getAllProjects()` — every known project.
2. Per project: load manifest **read-only** via `ProjectFileLoader` directly (NOT `StateManager.loadProjectFromPath` — that sets `state.currentProject` and persists; the sweep must not touch StateManager state).
3. Resolve `nodePath` ONCE (`resolveNodePath`) and reuse across all projects.
4. Always: tier 1 via `refreshMcpConfigs` (hash-and-skip; `'unchanged'` is the common path → no disk writes).
5. If `project.aiContextVersion ?? 0 < AI_CONTEXT_VERSION`: also tier 2 (`refreshContextAndSkills`) and stamp the version. This is the **fully silent version-stale refresh** — activation is the only driver, which is sufficient because `AI_CONTEXT_VERSION` can only change with new extension code, which requires an extension-host restart.
6. Persist via a locally-constructed `ProjectConfigWriter.saveProjectConfig(project)` **only when something moved** (writes/removes happened, hashes changed, or stamp advanced). Healthy path = zero writes.
7. Logging per house rule — decision on EVERY run: one `debug` line per healthy project (`tier1 ok, stamp current`), `info` naming files repaired/refreshed + WHY (`stamp 7 < 8`), `info` for every skipped file, `warn` on per-project failure, one summary line.

**Single-heal-driver analysis**: `mcpHealthCheck` heals via `handleRegenerateAiFiles` on dashboard open (EDS, once/session); the sweep runs at activation before any dashboard exists. The theoretical overlap window is benign: both compute identical desired content from identical inputs, and identical content → identical hashes, so a last-writer-wins manifest save cannot diverge. `aiContextFreshnessCheck` stays detect-only. Document this in both docblocks.

### Skill gating: extend `aiToolingGate.ts`

```ts
/** ai-defaults entry ids whose tool is usable by this project RIGHT NOW:
 *  entry applies (requires-gate) AND its package is declared in the isolated
 *  .demo-builder-mcp manifest. Offline. */
export function resolveAvailableMcpToolIds(
    project: Project, installedPackages: string[],
): Set<string>;
```

`writeSkillFiles` consumes it with `SKILL_MCP_TOOL_DEPENDENCIES` (`src/types/ai.ts:76`): a skill with a dependency not in the set is **not written**, and `writer.remove(relPath, currentTemplateContent)` reconciles a previously-written copy (removal matrix above). `DEMO_BUILDER_ALWAYS_ON_SKILLS` stays the classifier list (a gated-out skill found on disk still classifies as first-party); only the writer filters. `homeAiContextWriter` (projects-root surface) is untouched — no per-project tool install exists there; note it in its docblock.

### Freshness check policy: `aiContextFreshnessCheck.ts`

- **Version axis**: stops returning `warning` (badge no longer flips). Still **logged every run** (`info` when stale, noting the activation sweep owns the repair — the support trail if a sweep ever fails; `debug` when healthy). `currentVersion` dep stays injected for exactly this.
- **Composition axis**: unchanged — `warning`, badge, "Regenerate AI files" prompt (that's the real download).

### Reporting + wording

- `handleRegenerateAiFiles` response gains `skippedFiles: string[]` / `removedFiles: string[]`; the AI Capabilities modal renders "Kept (you edited them): …" in the regenerate result.
- Silent-path skips become durably visible via a derived list: `verifyAiSetup` gains an optional `recordedHashes` param; inventory gains `editedFiles: string[]` (bundle files whose disk content ≠ recorded hash). Stateless, always current — covers skips from activation/update paths without persisting a skip log.
- Tier-3 step wording: `emit('Installing AI tooling', 'This can take up to a minute')` → `emit('Downloading AI tool packages', 'Fetching <applicableMcpPackages(project).join(', ')> — can take up to a minute')`. Names what it downloads (requirement 5).

---

## Data Flow

```
creation (executor.ts:597) ──┐
regenerate (aiHandlers:197) ─┤→ generateAIContextFiles ──┬→ createGeneratedFileWriter(path, project.aiFileHashes)
updates (×2 call sites) ─────┘   (aiBundleService)       ├→ refreshMcpConfigs ──→ writer.write / writeMerged
                                                         ├→ refreshContextAndSkills ─→ writer.write / remove
activation sweep ──→ tier1 always;                       ├→ stamp aiContextVersion
  (all known projects)  tier2 iff stamp stale            └→ project.aiFileHashes = writer.hashes()
                                                              ↓ caller persists (saveProjectConfigOnly /
                                                                sweep-local ProjectConfigWriter)
manifest (.demo-builder.json): aiContextVersion + aiFileHashes  →  freshness check (composition badge only)
                                                                →  verifyAiSetup editedFiles (modal)
```

---

## Constraints (project-derived)

- **Files** <500 / functions <50 / repo lint 0 warnings. `mcpConfigWriter.ts` is already 540 lines → Step 3 includes a mechanical extraction of the git-sync hook builders to `claudeSettingsWriter.ts` (behavior-preserving; its tests move unchanged).
- **No new abstraction without 3 use cases**: `GeneratedFileWriter` has 4+ consumers (3 writers + sweep) — justified. No other abstractions.
- **Gate seams** (`ai-context-authoring`): the four seams change all-or-none; regenerate parity holds (creation and regenerate call the same `generateAIContextFiles`).
- **Tests typechecked** (`tsconfig.test.json`): `aiFileHashes` is optional → existing fixtures compile; new fixtures use real `Project` shape.
- **aiHandlers testUtils mocks the services barrel** — new barrel exports used by `aiHandlers` (`applicableMcpPackages`) must be added to that mock.
- **Never pipe jest** — redirect to file (hook-enforced).
- **ONE `AI_CONTEXT_VERSION` bump**, last step only.

---

## Steps

### Step 0: RPTC Re-initialization
- [ ] Re-invoke the originating `/rptc:feat` command context; load `.rptc/` plan directory (`.rptc/plans/tiered-ai-refresh/`), confirm branch/worktree.

### Step 1: Hash seam — `GeneratedFileWriter` + manifest field
**Files**: NEW `src/features/project-creation/services/generatedFileWriter.ts`; `src/types/base.ts`; `src/core/state/projectConfigWriter.ts`; NEW `tests/features/project-creation/services/generatedFileWriter.test.ts`; extend `tests/core/state/projectConfigWriter` manifest test.

- [ ] RED: write matrix tests — absent→written; hash-match→written (content changed) and `'unchanged'` (content identical, no fs write — assert via mock fs call counts); mismatch→`'skipped'` + report + `info` log; no-recorded-hash→overwrite-once + record.
- [ ] RED: removal matrix — match→removed + hash entry dropped; no-hash + byte-equal-template→removed; no-hash + differing→skipped; mismatch→skipped; absent→`'absent'` + stale entry dropped.
- [ ] RED: `hashes()` returns the FULL merged map (untouched recorded entries survive a partial tier-1-only run); `writeMerged` always writes + records; posix-relative keys on win32-style input.
- [ ] RED: manifest round-trip — `aiFileHashes` serialized when non-empty, omitted when empty/absent.
- [ ] GREEN: implement (`crypto.createHash('sha256')`, `fs/promises`, ~150 lines); add `Project.aiFileHashes`; extend `addOptionalManifestFields`.
- [ ] REFACTOR: docblock = the ADR-013 matrices + the "no bundle write outside this seam" rule.

### Step 2: Thread the seam through `aiContextWriter` + `skillsWriter` (no gating yet)
**Files**: `src/features/project-creation/services/aiContextWriter.ts`, `skillsWriter.ts`; their test suites.

- [ ] RED: `writeAgentsMd(projectPath, project, stacks, writer)` — routes AGENTS.md + both CLAUDE.md pointers through `writer.write`; edited AGENTS.md is skipped while pointers still refresh.
- [ ] RED: `writeSkillFiles(projectPath, project, writer)` — 13 always-on skills through the seam; an edited skill skipped, the other 12 written; Adobe bundle copies (`copySkillFolder`) route through `writer.write` with correct relative paths; `written` return contract unchanged.
- [ ] GREEN: add the `writer` param (no back-compat overloads — the only remaining callers are the orchestrator, updated in Step 3, and `homeAiContextWriter`, which keeps consuming `DEMO_BUILDER_SKILLS` data, not `writeSkillFiles`).
- [ ] Existing writer tests: adapt setup to construct a writer with `{}` recorded hashes (pre-ADR behavior = overwrite-once → assertions on content unchanged).

### Step 3: `aiBundleService` orchestrator + `mcpConfigWriter` seam + call-site reconciliation (req 1, 7)
**Files**: NEW `src/features/project-creation/services/aiBundleService.ts`; NEW `claudeSettingsWriter.ts` (extraction); `mcpConfigWriter.ts`; `projectFinalizationService.ts` (delete `generateAIContextFiles`); `services/index.ts`; `updateApplyService.ts` / `updateExecutor.ts` (log lines only); NEW `tests/.../aiBundleService.test.ts`.

- [ ] Mechanical first (no behavior change, existing tests green): move `generateClaudeSettings`/`mergeClaudeSettings`/`buildGitSyncCommand`/`buildHomeGitSyncCommand`/`buildToolFileExtraction`/`SHELL_METACHAR_RE` to `claudeSettingsWriter.ts`; move their tests; `mcpConfigWriter` drops under 500 lines.
- [ ] RED: `refreshMcpConfigs` — both mcp.json files via `writer.write`, settings via merge + `writer.writeMerged`, gitignore untouched by the seam; edited `.mcp.json` skipped + reported.
- [ ] RED: `generateAIContextFiles` — runs tier 1 + tier 2, stamps `aiContextVersion`, sets `project.aiFileHashes = writer.hashes()`, returns `{ skills, report }`; error-collection + `onProgress` parity with the old implementation (port the existing suite's pins).
- [ ] RED: tier-1-only / tier-2-only runs leave the other tier's recorded hashes intact.
- [ ] GREEN: implement; `writeMcpConfigs(projectPath, project, distPath, writer, nodePath?)`; barrel re-exports `generateAIContextFiles` (+ new tier fns, `applicableMcpPackages`) from `aiBundleService`.
- [ ] Update paths (req 7): call sites at `updateApplyService.ts:214` / `updateExecutor.ts:380` now flow through the tiered+hashed path with **zero import churn** (barrel); add the WHY log line (`regenerated after <pkg> npm update; skipped: […]`); their `saveProjectConfigOnly` now also persists hashes — assert in the updates suites (fixtures gain nothing; `aiFileHashes` optional).
- [ ] Verify: no `fsPromises.writeFile` remains in the three writers for bundle files (positive-control grep per house verification rules).

### Step 4: Skill gating on tool availability (req 6)
**Files**: `aiToolingGate.ts`; `skillsWriter.ts`; `src/types/ai.ts` (docblock only); their tests (count pins move).

- [ ] RED: `resolveAvailableMcpToolIds` — EDS + playwright installed → contains `'playwright'`; EDS + not installed → doesn't; headless → doesn't (entry `requires: 'eds-storefront'` fails).
- [ ] VERIFY FIRST: the real current count-pin values in skillsWriter.test.ts (architect estimates disagreed, 13 vs 14 — measure, do not trust either).
- [ ] RED: `writeSkillFiles` gating — EDS + available: all pins hold; EDS + unavailable: three fewer written AND the 3 playwright skills removed when hash-matched; user-edited playwright skill → left + in `skipped`; headless project: 10 (three fewer than today — the intended change); `extend-app-builder-app` conditional unaffected.
- [ ] RED: removal of a no-hash pre-ADR copy — removed only when byte-equal to the current template, else skipped (data-loss guard).
- [ ] GREEN: `writeSkillFiles` reads `readInstalledMcpPackages(projectPath)` (install precedes writers on both creation and regenerate paths — ordering already load-bearing, keep it), filters via the map, reconciles removals.
- [ ] Sync `skillInspector` expectations if any suite pins "13 on any project".

### Step 5: Activation sweep — tier-1 repair + silent version-stale tier-1+2 (req 3, 4)
**Files**: NEW `src/features/project-creation/services/aiBundleActivationRefresh.ts`; `src/extension.ts` (one `void refreshAiBundlesOnActivation(...)` call + try/catch, next to the `refreshGlobalMcpIfPresent` precedent at :112); NEW test suite.

- [ ] RED: healthy project (fresh stamp, configs current) → zero disk writes, one `debug` decision line (test the ambiguity: healthy MUST log).
- [ ] RED: stale `.mcp.json` (dead dist path) → tier 1 rewrites both mcp files, manifest saved with updated hashes, stamp NOT advanced (tier-1 alone must not mask a needed tier-2 refresh), `info` names files + WHY.
- [ ] RED: stamp 7 < current → tier 1 + tier 2 run, stamp advanced, saved once; skipped files logged per-file at `info` (not `debug` — export buffer).
- [ ] RED: per-project failure (loader throws) → `warn`, sweep continues to next project; top-level never rejects.
- [ ] RED: StateManager isolation — sweep uses injected loader/scanner/configWriter; assert `stateManager` is never touched (it isn't a dep at all).
- [ ] GREEN: implement per the flow above; `nodePath` resolved once; wire into `activate()` fire-and-forget AFTER `stateManager.initialize()` block (ordering irrelevant to it, but keeps activation-critical work first).
- [ ] Docblocks: single-heal-driver analysis; "offline + deterministic, must never hang activation".

### Step 6: Freshness-check policy + regenerate wording (req 4, 5)
**Files**: `aiContextFreshnessCheck.ts`; `aiHandlers.ts`; `dashboardHandlers.ts` (comment only); their tests; aiHandlers testUtils barrel mock.

- [ ] RED (moved pins): version-stale project → `{ status: 'ok' }` + `info` decision line naming the sweep as owner; composition-missing → still `warning` + badge message; healthy still logs `debug`.
- [ ] RED: `handleRegenerateAiFiles` — response carries `skippedFiles`/`removedFiles` from the refresh report; tier-3 step emits `'Downloading AI tool packages'` with the actual package names (`applicableMcpPackages(project)`); skill-count log line unchanged.
- [ ] GREEN: implement; add `applicableMcpPackages` to the services barrel AND the aiHandlers testUtils barrel mock (`jest.requireActual` fine — pure).
- [ ] Update both check docblocks (they document the detect-only/heal-race contract — keep them true).

### Step 7: Modal surface — skipped/edited files visible (req 4 tail)
**Files**: `src/features/ai/aiSetupVerifier.ts` + `src/types/ai.ts` (inventory `editedFiles`); `aiHandlers.handleVerifyAiSetup` (pass `project.aiFileHashes`); `src/features/dashboard/ui/components/AiCapabilitiesModal.tsx` (+ aiSurface if it renders regenerate results); webview tests per `webview-test-authoring`.

- [ ] RED: `verifyAiSetup(path, distPath, recordedHashes?)` → `inventory.editedFiles` lists bundle files whose disk hash ≠ recorded; empty when no hashes recorded (pre-ADR projects: no false "edited" flags).
- [ ] RED: modal renders "Kept — you've customized these:" from regenerate `skippedFiles` and shows `editedFiles` in the inventory view; absent section when empty.
- [ ] GREEN: implement; keep verifier pure fs (hashes passed in, not read from vscode state).
- [ ] Browser-verify per Visual Development rule (Dev Host, modal open, console clean).

### Step 8: Version bump + docs + full gate (req 8)
**Files**: `src/core/constants.ts`; `docs/architecture/adr/013-...md` (Status → Implemented); `src/features/ai/README.md`; `src/features/CLAUDE.md`; `docs/systems/mcp-server.md` §12; `.claude/skills/ai-context-authoring/SKILL.md` (new seam + tier API); backlog item marked shipped.

- [ ] `AI_CONTEXT_VERSION = 8` with the conventional comment: v8 = hash-and-skip (ADR-013), tiered refresh, playwright-skill gating. ONE bump for the whole batch. Note in the comment: this bump triggers the first silent tier-1+2 sweep on next activation; pre-ADR files get overwrite-once + hash recording (ADR §no-recorded-hash).
- [ ] Doc sync per `ai-context-authoring` "Related" list.
- [ ] Run `gate` (scoped jest + tsc + whole-repo lint). Full suite green; count pins land where Steps 4/6 moved them.

---

## Test Strategy Summary

- **Unit (bulk)**: seam matrices (Step 1) are the foundation — everything else asserts *routing through* the seam, not re-testing hash logic. Given-When-Then on the sweep (given a stale stamp / dead dist / edited file, when activation runs, then …).
- **Integration**: `generateAIContextFiles` end-to-end against a temp dir (real fs) — creation → edit AGENTS.md → refresh → edit survives + reported; regenerate parity (creation output == regenerate output for same project).
- **Logging pins**: every silent path pins its HEALTHY log line (the backlog's "test the ambiguity" requirement), not just the acting branch.
- **Coverage**: 100% of the seam matrices; 80%+ elsewhere.
- Mock preamble rules per `webview-test-authoring` for Step 7; jest output → file, never piped.

## Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| **Step 4 removal deletes a user's edited skill** (only step that deletes files) | Low | High | Removal demands positive proof (hash match or byte-equal to current template); treat-as-unmodified-once explicitly does NOT apply to removes; dedicated data-loss test |
| Step 5 sweep corrupts manifests at scale (writes every project) | Low | High | Write only-when-changed; atomic manifest write (existing `writeFileAtomic`); per-project isolation; read-only loader (no StateManager) |
| Sweep vs mcpHealthCheck heal overlap | Very low | Low | Identical deterministic outputs → identical hashes; documented in both docblocks |
| Barrel-move breaks jest module mocks | Low | Med | All 4 call sites import from the barrel (verified); barrel re-export preserves the name; run updates + aiHandlers suites first after Step 3 |
| `mcpConfigWriter` extraction regresses hook generation | Low | Med | Mechanical move with tests moved unchanged (behavior-preserving refactor proves itself by not moving them) |

**Riskiest step: Step 4** (skill gating removal) — the one place the feature deletes user-visible files; second: Step 5 (fan-out writes). Both front-load their guard tests.

## Self-critique
Steps ≤10 ✓ (8+Step 0) · new src files 4 ✓ · indirection ≤2 (call site → orchestrator → seam) ✓ · one new abstraction with 4 consumers ✓ · tests-before-code every step ✓. Score: Completeness 4.5, TDD 4.5, Actionability 4.5, Risk 4.5 → **4.5/5**.
