# Next session — start here

Written 2026-08-10, end of a very long session. **Everything is committed and pushed; both
repos clean.** Gate at handoff: 947 suites / 12111 tests, whole-repo eslint, tsc.

The previous NEXT-SESSION (2026-08-03) is discharged and has been replaced by this file.

---

## There are three independent work streams. Pick one — do not interleave.

They live in **different working directories**. Getting that wrong is the most likely way
to waste the first ten minutes.

| # | Stream | Working directory | Branch |
|---|---|---|---|
| A | Socket TOCTOU (**shipped defect**) | main checkout | `develop` |
| B | Configure step rail (**planned, not started**) | worktree `…​.worktrees/feature/configure-step-rail` | `feature/configure-step-rail` |
| C | Release `.127` | main checkout | `develop` → `master` |

---

## A. Socket TOCTOU — highest priority, it is live

A defect **introduced on 2026-08-10 and shipped**. Recovers on reload, so it presents as
intermittent.

`removeIfStillOurs` in `src/features/ai/server/inExtensionMcpServer.ts` stats the socket
path, compares dev/ino, then unlinks. On a window reload the outgoing server's `dispose()`
races the incoming server's `bindSocket()`; if the new server's `rename()` lands between
that stat and that rm, **the old server deletes the new server's socket**. Observed live:
`lsof` showed the extension host listening while `ls` showed the directory empty.

Full analysis, both candidate fixes, and why neither should be attempted without
re-reading the discovery contract:
**`.rptc/plans/pdp-prerender-validation/HANDOFF.md` §1.**

Related, separate: a **jest worker alive 4 days** was holding the real per-workspace
socket path. Some test binds the production path instead of an isolated one.

**Launch:**
```
cd /Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode
/rptc:fix MCP socket TOCTOU — on reload the outgoing server's dispose can delete the
incoming server's socket between its stat and its rm. Read
.rptc/plans/pdp-prerender-validation/HANDOFF.md §1 first; both candidate fixes and the
constraint on each are recorded there.
```

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

Two traps, both recorded in the PDP handoff §5:

- **It is `.127`, not `.128`.** `package.json` already reads `1.0.0-beta.127` and no
  `v1.0.0-beta.127` tag or release exists — the bump came from the `.126` hotfix merge-back
  and was never cut. Do not apply the usual +1.
- **430 non-merge commits** since `v1.0.0-beta.126`, because `.126` was a hotfix off `.125`
  and develop diverged. Expect add-then-remove arcs; describe net shipped behaviour. This
  needs fresh attention, not the tail of a session.

Follow the `cut-release` skill, which also says to offer `codebase-sweep` and `dream` first.

**`dream` has unusually good material.** The 2026-08-10 session produced five instances of
one disease — *state recording intent rather than reality*: a probe reporting a prerender
that never happened, a dashboard badge reading a persisted string, published-state
recording what we meant to publish, a republish reporting success while publishing the
wrong content, and a verdict asserting a cause it could not distinguish. That is a pattern
worth naming in a skill or in CLAUDE.md.

**Launch:**
```
cd /Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode
/cut-release
```

---

## Also outstanding, smaller

- **`demo-builder-test` mesh still runs on `base`.** Its `.env` is stale and `deploy_mesh`
  does **not** regenerate it — only a Configure save does. Order: Configure save → then
  deploy mesh. A `deploy_mesh` timed out at 10 min in this session; check
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
