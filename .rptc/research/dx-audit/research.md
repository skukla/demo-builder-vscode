# DX Audit: Guidance Files, Context Hygiene, and Agentic-Workflow Best Practices

**Date**: 2026-07-03
**Method**: Three parallel research streams — (A) full inventory of this repo's AI-guidance files, (B) full inventory of the user-global `~/.claude` configuration, (C) web research on 2025–2026 best practices (official Anthropic docs + practitioner writeups) — plus a transcript analysis of Kun Chen, "L8 Principal's Agentic Engineering Workflow" (YouTube `iQyg-KypKAA`, 2026-06-20).
**Outcome**: Remediation plan approved 2026-07-03 (see "Decisions" at the end).

---

## 1. Headline findings

| # | Finding | Impact |
|---|---------|--------|
| 1 | **AGENTS.md leak**: `tech-case-engine@skukla` plugin (user-scope) has an unguarded SessionStart hook that injects its 36KB Workflow-Teacher AGENTS.md into *every* session in *every* project | ~9k tokens/session, everywhere; single largest injected item |
| 2 | **`~/.claude/global/` does not exist** — user CLAUDE.md references it 8+ times as authoritative; every pointer is dead. Equivalent content ships in the rptc plugin's `sop/` | Agents told to consult files that aren't there |
| 3 | **Root CLAUDE.md ~40% stale**: fictional v1.3–v1.7 changelog (~150 lines; real version `1.0.0-beta.121`), build listed as Webpack (it's esbuild), 5 of 12 "Key Files" deleted, refs to deleted `src/shared/` and `src/webviews/` | Always-loaded file actively misleads |
| 4 | **~9,000 lines of guidance overall, 30–35% stale.** Worst: `src/utils/CLAUDE.md` (1,007 lines, ~95% stale — documents 18 files; dir contains 1). `docs/CLAUDE.md` (813 ln) mostly changelog prose. `.rptc/CLAUDE.md` (787 ln) an unfilled plugin template with `[Your Language]` placeholders, declared mandatory reading by root | Fossils are lazy-loaded (no per-session cost) but poison agents that enter those directories |
| 5 | **Auto-loaded burden ~20–21k tokens/session**: user CLAUDE.md 274 ln (~2.9k) + project CLAUDE.md 353 ln (~5.2k) + MEMORY.md (~3.6k) + AGENTS.md leak (~9k) | vs official guidance of <200 lines per CLAUDE.md |
| 6 | **Hooks underused**: one advisory Stop hook (eslint-changed, well designed). Chronic advisory rules (jest-pipe gotcha, formatting) remain prose | Official rule: repeatedly-ignored CLAUDE.md rules → hooks |
| 7 | **MEMORY.md at 142/200 lines** toward the hard startup cap (200 lines / 25KB, whichever first) | Entries beyond the cap silently stop loading |
| 8 | **`.claude/settings.local.json` carries 371 accreted permission allows** (defaultMode is `auto`) | Noise, no function |
| 9 | **What's already right**: project skills (`gate`, `cut-release`), 9 domain App Builder user skills, two-tier research promotion, backlog index with "trust the code, not this file" banner, worktree conventions, feature-level CLAUDE.md files (sidebar, projects-dashboard, core, features — current and good) | Matches or exceeds best practice |

## 2. Project inventory (stream A)

Full table in the audit run; essentials:

| Path | Lines | State |
|---|---|---|
| `CLAUDE.md` (root) | 353 | ~40% stale (changelog, webpack, dead Key Files) |
| `src/CLAUDE.md` | 462 | Import rules good; `webview-ui/` section + webpack refs dead |
| `src/commands/CLAUDE.md` | 702 | navigate/openInClaude sections current; "Command Structure" list fictional |
| `src/features/CLAUDE.md` | 440 | Mostly current; dup `ai/` line, dead footer |
| `src/features/sidebar/CLAUDE.md` | 253 | Current (explicitly corrects the webpack myth) |
| `src/features/projects-dashboard/CLAUDE.md` | 233 | Current; minor webpack mention |
| `src/core/CLAUDE.md` | 692 | Good, but shared/-coexistence narrative describes deleted world |
| `src/core/ui/hooks/CLAUDE.md` | 680 | Documents 1 deleted hook; misses 6 real ones |
| `src/utils/CLAUDE.md` | 1,007 | **~95% stale** — dir contains only `autoUpdater.ts` |
| `docs/CLAUDE.md` | 813 | Mostly v1.4–v1.6 retrospective changelog |
| `docs/architecture/CLAUDE.md` | 275 | Indexes 6 of 17 docs; 11 ADRs unindexed; dead status table |
| `.rptc/CLAUDE.md` | 787 | Unfilled plugin template (`[Your Language]`…) |

Contradictions: three files tell three different stories about the shared/core layer; esbuild vs webpack contradicted across four files; command inventory in two files matches nothing on disk. Two freshness tiers coexist: feature-level files actively maintained; layer-level files fossilized around the early-2025 refactor.

`.claude/` (gitignored): `settings.local.json` (371 allows + Stop hook), `hooks/eslint-changed.sh` (advisory, well designed), `skills/gate`, `skills/cut-release`.

## 3. Global inventory (stream B)

- `~/.claude/CLAUDE.md`: 274 lines. References the nonexistent `~/.claude/global/` 8+ times; mandates Sequential Thinking MCP "for ALL tasks" (server not configured); Serena Docker-path instructions stale.
- `~/.claude/settings.json`: no hooks; permissive allow-all posture; 7 user-scope plugins — the leak vector is `tech-case-engine@skukla` enabled user-scope.
- **Leak root cause**: `inject-workflow-teacher.sh` (SessionStart) cats the plugin's 36KB AGENTS.md unconditionally. Its two siblings in the same hooks.json (`corpus-check.sh`, `audio-detected.sh`) are correctly guarded with `[[ ! -f opportunity.yaml ]] && exit 0`. SessionStart matchers can't scope per-project — the guard must live in the script (as siblings do) or via per-project plugin enablement.
- User skills (9): all App Builder / Adobe CLI domain — small, operational, experience-derived. Good.
- rptc plugin 3.16.6: 11 commands, 9 agents, 18 skills, 9 SOPs (11,341 lines — incl. a 4,434-line flexible-testing-guide). The SOPs are the real home of the content `~/.claude/global/` was supposed to hold.
- Overlap map: testing/architecture/security/frontend/git each defined in 2–4 places (user CLAUDE.md inline + rptc SOP + project docs + memory). Broadly consistent, not contradictory; the defect is dead references + duplication.
- Memory dir: 35 files / 180KB; MEMORY.md 142 lines / 14.3KB (cap: 200 lines / 25KB).

## 4. Web best practices (stream C — key citables)

- **CLAUDE.md size**: official target **<200 lines per file**; per-line bar: "would removing this cause Claude to make mistakes?" Bloated files cause instruction-ignoring. Changelogs / frequently-changing info / file-by-file codebase maps are named anti-patterns. (code.claude.com/docs/en/memory, /best-practices)
- **Nested CLAUDE.md loading**: ancestors (cwd and up) load **in full at launch**; subdirectory files below cwd are **lazy-loaded** when Claude reads files there. The layered hierarchy is the endorsed large-repo pattern; only root + user-global are the every-session tax. Nested files are NOT re-injected after `/compact` until touched again. `@`-imports do NOT save tokens (eager, depth 4). HTML comments are stripped before injection. Newer: `.claude/rules/` with `paths:` frontmatter for path-scoped rules.
- **Skills vs CLAUDE.md vs commands vs subagents**: facts-every-session → CLAUDE.md; procedures → skills (body loads on invocation); slash commands have merged into skills (`disable-model-invocation: true` = manual-only); context isolation/verification → subagents. Skill-description budget: 1% of context window, 1,536 chars/skill, least-used dropped first — `/doctor` shows truncation.
- **Hooks**: "CLAUDE.md is advisory; hooks are deterministic." Convert repeatedly-ignored rules into hooks. Most-cited production hooks: format-on-edit (PostToolUse), lint-feedback (exit 2), file protection (PreToolUse), Stop-hook test gate, dangerous-command blocking. ~30 events now; exit 2 = block with stderr fed to Claude.
- **MCP vs CLI**: official: "CLI tools are the most context-efficient way to interact with external services." GitHub MCP historically ~42–55K tokens of schema; CLI 4–35× cheaper per op. MCP Tool Search (default-on) auto-defers above ~10K tokens of descriptions (~85–95% reduction), softening but not eliminating the tax.
- **Verification ladder** (official): in-prompt pass/fail → `/goal` evaluator → Stop-hook deterministic gate → fresh-context adversarial subagent ("so the agent doing the work isn't the one grading it"). Evidence over assertion. Bundled `/code-review`, `/security-review`. Caution: scope reviewers to correctness or they'll drive over-engineering.
- **Memory**: MEMORY.md startup load = first 200 lines or 25KB. Keep index one line per memory; prune after ships/refactors; promote hardened learnings into CLAUDE.md/skills and delete the memory.

## 5. Video (Kun Chen, "L8 Principal's Agentic Engineering Workflow")

Recommendations, with our disposition:

| Video recommendation | Our status | Disposition |
|---|---|---|
| Global memory file minimal (~27 lines; his is preferences only) | User CLAUDE.md 274 ln | **Adopt**: trim to ≲150 (Step 5) |
| Project memory = accumulated corrections, prune periodically | Memory system healthy but index near cap | **Adopt**: prune + promote (Step 7) |
| Move conditional knowledge from memory files into skills | Already practiced (`gate`, `cut-release`, appbuilder-*) | Continue |
| Don't install unevaluated third-party skills (he benchmarked a 177k-star skill that *degraded* results) | We only run home-grown/plugin skills | Confirmed policy |
| CLI over MCP (GitHub MCP = 3× tokens, 2× latency in his benchmark) | gh CLI already primary; MCP set deferred via Tool Search | No change needed |
| Interactive HTML planning artifacts (lavish) over wall-of-text plans | Harness Artifact tool available on demand | Declined as tooling; use Artifact when useful |
| "No-mistakes" pipeline: isolated worktree → rebase → adversarial fresh-context review → E2E evidence → docs pass → lint → PR babysit | RPTC verify + code-review agents + gate skill cover most | Partial: backlog item for evidence capture + `/code-review` habit (Step 8) |
| Long-running loops with stop conditions | Harness `/loop` exists | Available; no setup needed |
| Frictionless worktrees (treehouse) | Sibling-dir convention + RPTC worktree flow | Adequate |
| Orchestrator "first mate" for parallel agents | Harness background agents + workflows | Available; no setup needed |
| Voice input (OpenSuperWhisper, 3× faster than typing) | — | Personal ergonomics; out of scope |
| Bias corrections in memory ("don't overweight development cost"; "bug fixes start with E2E repro") | Not present | Optional candidates for user CLAUDE.md during trim |

Cross-check: the video and official Anthropic guidance agree on every structural point (minimal always-loaded files, procedures→skills, CLI>MCP, adversarial fresh-context verification with evidence). The video's unique items are ergonomics/tooling choices, not repo configuration.

## 6. Gap analysis → what we change

1. **Deterministic leak fix** (tech-case-engine): guard `inject-workflow-teacher.sh` like its siblings. Saves ~9k tokens/session machine-wide.
2. **Root CLAUDE.md** 353→~150: delete changelog/version narrative, fix esbuild/Key Files/dead dirs.
3. **Fossils**: delete `src/utils/CLAUDE.md` + root `webpack.config.js`; gut `docs/CLAUDE.md`; trim `.rptc/CLAUDE.md` to project deltas; surgical fixes in `src/`, `src/commands/`, `src/core/`, hooks, `src/features/`, `docs/architecture/`, `docs/README.md`. Add `<!-- Last verified: date -->` markers.
4. **User CLAUDE.md** 274→≲150: remove dead global/ refs and stale MCP mandates.
5. **Hooks**: add jest-pipe guard (PreToolUse) + format-on-edit (PostToolUse); prune the 371-entry allow list.
6. **Memory**: prune index below the cap; promote hardened rules.
7. **Backlog**: secret-file guard, `/code-review`-with-evidence habit in gate, periodic re-verification of nested CLAUDE.md files.

## 7. Decisions (approved 2026-07-03)

- Leak fixed at the source (tech-case-engine guard), plugin stays user-enabled.
- Fossils: delete dead files outright (per no-soft-deprecation), rewrite living ones.
- New hooks: jest-pipe guard + format-on-edit now; secret-file guard deferred to backlog.
- Declined: voice input, terminal tooling, lavish/no-mistakes/first-mate adoption (harness + RPTC equivalents exist), MCP removal (Tool Search already contains the cost).

## Sources

- code.claude.com/docs/en/memory · /best-practices · /skills · /hooks · /agent-sdk/tool-search
- claude.com blog: "How Claude Code works in large codebases"
- anthropic.com/engineering/code-execution-with-mcp · anthropic.com/news/automate-security-reviews-with-claude-code
- humanlayer.dev/blog/writing-a-good-claude-md · claudefa.st (subdirectory-claude-md, hooks-guide, mcp-tool-search, auto-dream)
- firecrawl.dev/blog/mcp-vs-cli · getunblocked.com/blog/github-mcp-token-cost · scalekit.com/blog/mcp-vs-cli-use
- github.com/disler/claude-code-hooks-mastery · asdlc.io/patterns/adversarial-code-review
- Kun Chen, "L8 Principal's Agentic Engineering Workflow" (youtube.com/watch?v=iQyg-KypKAA), tools: axi.md, lavish-axi, no-mistakes, gnhf, treehouse, firstmate
