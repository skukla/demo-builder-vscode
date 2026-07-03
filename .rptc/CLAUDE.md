<!-- Last verified: 2026-07-03 -->
# RPTC Workflow — Project Configuration

Project-specific RPTC configuration for the Adobe Demo Builder VS Code
extension. The RPTC process itself (commands, agents, skills, templates) ships
with the `rptc` plugin — this file only records what is specific to this
project.

## Tech Stack

- **Language**: TypeScript
- **Platform**: VS Code Extension API
- **UI**: React + Adobe Spectrum
- **Build**: esbuild (`esbuild.config.js`) — NOT webpack
- **Testing**: Jest with ts-jest, @testing-library/react (~574 suites)
- **Database**: none

## Essential Commands

```bash
npm run watch:all        # Watch mode (extension + webviews) — run in background
npm run compile          # Full production build
npm run lint             # eslint over ALL of src/ + tests/ (matches CI)
npx tsc --noEmit         # Typecheck
npx jest --no-coverage 2>&1 > /tmp/jest-output.txt   # Full suite (3-5 min)
```

## Where RPTC Artifacts Live

`.rptc/` is **fully tracked in git** (only `.rptc/prompt.md` is gitignored).
Write working artifacts to these locations, never ad-hoc paths:

| Stage | Location | What goes there |
|---|---|---|
| Working research | `.rptc/research/<topic-slug>/research.md` | Exploratory, in-flight research generated during `/rptc:research` or equivalent |
| Working plans | `.rptc/plans/<feature-slug>/overview.md` + `step-NN.md` | Active implementation plans being executed via TDD |
| Completed work | `.rptc/complete/<feature-slug>/` | Plans whose implementation has shipped (move from `.rptc/plans/` when done) |
| Curated research | `docs/research/<date>-<topic>.md` | **Promoted only.** Landmark research cited by ADRs / CHANGELOG. Don't write here directly; promote from `.rptc/research/` once durable. |
| Backlog items | `.rptc/backlog/<slug>.md` or `.rptc/backlog/<feature>/` | Designed/proposed work that isn't active (index: `.rptc/backlog/README.md`) |

## Worktree Convention

- All worktrees live in the **visible sibling directory**
  `demo-builder-vscode.worktrees/<prefix>/` (prefixes: `claude/`, `feature/`,
  `fix/`) — NOT the hidden `.claude/worktrees/`.
- `.claude/` is gitignored and per-checkout: a fresh worktree starts with no
  settings, skills, or permissions. Copy them from the main checkout before
  working there.

## Project SOPs (`.rptc/sop/`)

Project-specific SOPs override the plugin defaults (resolution order:
`.rptc/sop/` → `~/.claude/global/sop/` → plugin).

| SOP | Covers |
|---|---|
| `code-patterns.md` | Mandatory code-clarity patterns: `TIMEOUTS.*` constants, no nested ternaries, helper extraction, etc. |
| `complexity-reduction.md` | Identifying and reducing code complexity (nesting, long functions, dense expressions) |
| `component-extraction.md` | When and how to extract React components (size, props, sub-components) |
| `consistency-patterns.md` | Detecting the same operation implemented differently across the codebase |
| `dead-code-removal.md` | Removing dead code, unused exports, and duplicate logic |
| `god-file-decomposition.md` | Detection criteria and decomposition workflows for oversized multi-responsibility files |
| `hooks-extraction.md` | Extracting React hooks and business logic out of components |
| `testing-guide.md` | Optimized Jest execution for 5-10s TDD feedback loops (`test:watch`, `test:file`, `test:changed`) |

## Test-Command Gotchas

- **Never pipe jest through `tail`/`head`/`grep`** — output buffering makes
  the run look hung. Redirect to a file and read it:
  `npx jest --no-coverage 2>&1 > /tmp/jest-output.txt`
- The full suite takes **3-5 minutes** — that is normal, don't kill it.
- **CI lints the whole repo** (`npm run lint` covers all of `src/` +
  `tests/`). A scoped/changed-files lint can pass locally while CI fails on a
  pre-existing error elsewhere. Before pushing: full `npm run lint` +
  `tsc --noEmit` + full jest.
- Fast iteration during TDD: `npm run test:watch -- <path>` or
  `npm run test:file -- <path>` (see `.rptc/sop/testing-guide.md` and
  `tests/README.md`).

## RPTC Configuration

- verification-agent-mode: **automatic**
