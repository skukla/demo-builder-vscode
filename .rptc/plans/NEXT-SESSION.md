# Next session — start here

Rewritten 2026-08-10 (second pass, same day). **Everything is committed and pushed;
`develop` is clean and level with `origin/develop` at `0309abb8`.**
Gate at handoff: 948 suites / 12118 tests, whole-repo eslint, tsc.

This replaces the earlier 2026-08-10 file. **Stream A is discharged** — see below for
what shipped and the two facts it turned up that were not in any previous handoff.

---

## Two streams remain. Pick one — do not interleave.

They live in **different working directories**. Getting that wrong is the most likely
way to waste the first ten minutes.

| # | Stream | Working directory | Branch |
|---|---|---|---|
| B | Configure step rail (**planned, not started**) | worktree `…​.worktrees/feature/configure-step-rail` | `feature/configure-step-rail` |
| C | Release `.127` | main checkout | `develop` → `master` |

---

## B. Configure step rail — planned, ready to implement

Refactor the Configure screen to the wizard's UI/UX: horizontal top rail, each configure
section a tab, one section's fields visible at a time.

**Plan:** `.rptc/plans/configure-step-rail/` (`overview.md` + `step-01..05.md`) — **in the
worktree, not the main checkout.** Committed as `dbcee1c2`.

Five steps: promote the rail to `core` as `StepRail`; unify three section sources into one
model; swap the sidebar for the rail; delete what that makes dead; verify in the Dev Host.
Steps 01 and 02 are independent.

Three decisions already taken (do not re-litigate): switch sections rather than jump-nav;
mark all sections reachable so the rail component needs no change; move and rename it.

Worth knowing before you start:

- **The rail already exists and is already horizontal.** `VerticalStepList` renders
  `<ol aria-orientation="horizontal">`. Its name and docstring claim the opposite and
  misled a research agent during planning. Step 01 corrects that.
- **The substance is the section model, not the rail.** Sections come from three unrelated
  sources and only one feeds the current sidebar.
- **`--wizard-content-pad` is scoped to `.wizard-main-content`** — outside the wizard the
  declaration is dropped, the rail still renders, and no test can see it. Step 05 exists
  for that.

The worktree is already created and configured per the `worktree-setup` skill: own `dist/`,
shared `node_modules`, `settings.local.json` copied, hooks and skills present via git.
Note the main checkout's `dist/` was rebuilt from `develop` at the end of this session, and
`npm run watch:all` is NOT running anywhere.

**Launch:**
```
cd /Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode.worktrees/feature/configure-step-rail
/rptc:feat Plan is approved, continue to implementation — configure step rail
```

The "Plan is approved" phrasing is load-bearing: it makes `/rptc:feat` skip discovery and
planning and go straight to implementation from the plan file.

---

## C. Release `.127`

**Blocked on the user wanting one more feature in first** (that feature is stream B).

- **It is `.127`, not `.128`.** `package.json` reads `1.0.0-beta.127` and no
  `v1.0.0-beta.127` tag exists — re-verified 2026-08-10. The bump came from the `.126`
  hotfix merge-back and was never cut. Do not apply the usual +1.
- **438 non-merge commits** since `v1.0.0-beta.126` (counted 2026-08-10; the earlier
  figure of 430 predated this session). `.126` was a hotfix off `.125` and develop
  diverged, so expect add-then-remove arcs — describe net shipped behaviour. This needs
  fresh attention, not the tail of a session.
- **Three MCP reliability fixes from this session belong in the notes** (`409de593`,
  `31ce91dc`, `0309abb8`). The first two are user-visible; the third is developer-facing
  only but explains why a test run no longer kills a live MCP session.

Follow the `cut-release` skill, which also says to offer `codebase-sweep` and `dream` first.

**`dream` has unusually good material.** The 2026-08-10 session produced five instances of
one disease — *state recording intent rather than reality*: a probe reporting a prerender
that never happened, a dashboard badge reading a persisted string, published-state
recording what we meant to publish, a republish reporting success while publishing the
wrong content, and a verdict asserting a cause it could not distinguish. That is a pattern
worth naming in a skill or in CLAUDE.md.

A **second** pattern earned its place during stream A: *a check whose failure is invisible
from the side that fails*. The test suite bound the live MCP socket and killed it, and no
test could ever have noticed — the suite passes either way. Same shape as the "nothing
found" verifications CLAUDE.md already warns about.

**Launch:**
```
cd /Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode
/cut-release
```

---

## A. Socket TOCTOU — SHIPPED 2026-08-10, verified live

Three commits, pushed:

| Commit | What |
|---|---|
| `409de593` | `removeIfStillOurs` deleted entirely — no check makes unlinking a shared pathname safe |
| `31ce91dc` | `resolveProxyTarget` resolves by liveness first, existence only as a fallback |
| `0309abb8` | Test suites can no longer bind the live MCP socket |

**Two things turned up that no previous handoff recorded.** Both matter more than the
original bug report did.

1. **The test suite was hijacking the live socket.** `tests/extension-context.test.ts` and
   `tests/extension-activation-navigation.test.ts` call the real `activate()`, and the
   default projects dir hashes to the **exact** socket a running Dev Host binds — verified
   by computing both, `135b859e0a31db31.sock` either way. So every full `npx jest` with a
   window open renamed its own socket over yours. Same symptom as the TOCTOU, far more
   frequent, and the previous fix did nothing against it. Now isolated via
   `DEMO_BUILDER_MCP_SOCKET_DIR` in `tests/setup/node.ts` — **do not remove that**; the
   failure is silent from the test's side.
2. **The "jest worker alive 4 days" was not a live leak.** The orphan (pid 82596) started
   Aug 5 23:15:20; commit `4a99d861`, which fixed that hang, landed 23:20:29 — five minutes
   later. It was residue from the `--detectOpenHandles` run that produced the fix. Killed.
   The real defect underneath it was (1).

Verified in the running app, not just in tests: two Dev Host reloads left the socket
present and reachable (51 tools) with a negative control returning ENOENT; a full 948-suite
run with the Dev Host live left the socket's inode and mtime unchanged; and against the
built proxy, a dead pin with nothing live now emits guidance in **0.11s** instead of ~23s,
while a live pin still connects `via env`.

Design record: `.rptc/complete/2026-08-10-mcp-socket-existence-is-not-liveness.md`, which
also records one claim from its own filing that turned out to be wrong.

**Hard constraint for anyone who touches this next:** do not reintroduce unlinking the
shared socket name — no inode check, no lock, no sweep-at-start. Every one of those
re-creates the same race. `InExtensionMcpServer.dispose`'s docstring explains why.

---

## Also outstanding, smaller

- **`demo-builder-test` mesh still runs on `base`.** Its `.env` is stale and `deploy_mesh`
  does **not** regenerate it — only a Configure save does. Order: Configure save → then
  deploy mesh. A `deploy_mesh` timed out at 10 min on 2026-08-10; check
  `appBuilderComponents['eds-accs-mesh']` before re-running.
- **Missing `get_store_structure` MCP tool** — PDP handoff §3, flagged as the
  highest-value gap. An agent debugging PDP failures cannot see that a project points at a
  Commerce website with no products. That cost most of an afternoon.
- **Duplicated Commerce scope still in existing manifests.** Nothing reads it as
  authoritative any more (both resolvers now consult `BACKEND_OWNED_SCOPE_KEYS`), but it
  will drift again. Needs a migration. PDP handoff §2.
- **`pickSampleSku` reads the project manifest**, not the storefront's served
  `config.json`. `check-sku-exists` reads the served config, which is the right source.
  Recorded as intended and never made.

---

## Read before trusting the 2026-08-10 narrative

`.rptc/plans/pdp-prerender-validation/HANDOFF.md` **§3 lists five things stated confidently
during that session that were wrong**, and §6 lists where to recheck the work. Error rate
was high; every mistake was caught by a test or a control rather than by reading output.

Stream A held to that standard deliberately: every "nothing found" result was paired with a
positive control, and two of this session's own intermediate conclusions were wrong and
caught that way — an `iso-dir-appeared=0` whose poll window was too short to be meaningful,
and a claim that `mcpInspector` was misreporting when it was in fact honest.
