# DX follow-through: verification pipeline + guidance freshness

**Source**: DX audit 2026-07-03 (`.rptc/research/dx-audit/research.md`). These are the
items deliberately deferred from the remediation pass.

## Items

### 1. Secret-file PreToolUse guard
Public repo (`skukla/demo-builder-vscode`) — add a PreToolUse hook blocking Write/Edit
to `.env*` files and warning on likely-secret string patterns in content headed for
tracked files. Defense-in-depth alongside GitGuardian (which only scans PR diffs and is
non-required on develop). Follow the `.claude/hooks/jest-pipe-guard.sh` pattern (exit 2
with an explanatory stderr message).

### 2. Evidence capture in the gate skill + adversarial review habit
Official Anthropic verification ladder: evidence over assertion, and a fresh-context
reviewer "so the agent doing the work isn't the one grading it."
- Extend `.claude/skills/gate/SKILL.md`: after the checks pass, capture the pass/fail
  evidence (jest summary line, tsc exit, eslint count) into the turn output rather than
  asserting "gate passed".
- Adopt the bundled `/code-review` (fresh-context diff review) as the standard
  pre-push step for non-trivial branches; scope the reviewer to correctness only
  (official caution: unscoped reviewers drive over-engineering).

### 3. Periodic guidance-freshness re-verification
Every rewritten CLAUDE.md now carries `<!-- Last verified: date -->`. Add a lightweight
recurring habit (or a script in `scripts/`) that, for each guidance file, extracts path
references and `ls`-checks them — the 2026-07 audit found ~30-35% of ~9,000 guidance
lines had gone stale silently, with `src/utils/CLAUDE.md` at ~95%. Candidate trigger:
run during `/rptc:commit` or as a monthly manual pass. Refresh the marker on re-verify.

### 4. Unused webpack devDependencies
`webpack.config.js` was deleted (nothing referenced it), but `webpack`, `webpack-cli`,
`webpack-bundle-analyzer`, and `html-webpack-plugin` remain in devDependencies. Remove
them + regenerate the lockfile in a standalone chore commit (touches package-lock.json;
verify CI + `npm run compile` after).

## Non-goals (evaluated and declined in the audit)
Voice input / terminal tooling (personal ergonomics); adopting third-party pipeline
tools (no-mistakes, first-mate, lavish) — the harness + RPTC provide equivalents;
removing Perplexity/Context7 MCP servers (deferred tool loading contains their cost).
