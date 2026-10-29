# Loop report: backlog bug fixes, 2026-10-19

## The short version

I rechecked all 23 open bug-fix items against the release candidate.
- **8 were already fixed** on the branch. Their records now say so, with the commits.
- **9 are fixed in this loop.** Each has a test, and each test was shown to fail on the old code.
- **5 need you:** a decision, an approval, or a look in the browser.
- **1 I left:** PL-42, a long mutation-testing session that needs watching.

All the work is on `loop/2026-10-19-backlog-fixes`. It is 11 commits ahead of the release
candidate and 0 behind, so merging it is a fast-forward (no conflicts possible). Every
commit passed the full gate.

## Shipped (on the branch, waiting for the merge)

What changes for the SC, item by item:

- **Changing a setting back clears "redeploy needed" (AB-79).** Put a mesh setting back to
  what was deployed, and the stale flag now clears. It used to stay forever.
- **No new-category offers before a republish (EDS-52).** Switch a project to another
  store, and the extension no longer offers pages for every new category before you
  republish. The site still shows the old store until then, so the offer was wrong.
- **An agent sees an expired DA.live sign-in (EDS-30).** When asked for sign-in status,
  the agent now asks DA.live once whether the stored sign-in still works, and reports the
  minutes left. Before, it said "signed in" for a sign-in DA.live had already refused.
  A network failure does not count as "signed out". The sidebar's indicator still checks
  only the local token (not changed).
- **An expired sign-in no longer says "no pages" (EDS-29).** Republish with an expired
  DA.live sign-in used to say "No publishable pages found. Check your content." It now
  gives the sign-in message.
- **A fresh site gets the pages its code needs (EDS-40, part).** When project creation has
  to copy content itself, it now reads the storefront's code for the pages that code loads,
  the same way a reset does. Before, it used only the fixed lists. Not yet proven on a live
  create, so the item stays open.

Developer tooling (no SC-visible change):

- **PL-74:** a hook's self-test could pass when the hook never ran. Now it can't.
- **PL-83:** the editing hooks now check the right file when a shell command starts with
  `cd` into another folder. Before, they measured the main checkout's copy. That is why
  a 293-line file was reported as 426 lines on 2026-10-18.
- **PL-71:** mutation-test "widen" now refuses a module with more than 40 importing test
  files, or with importers that run in a different test environment, and says why. Both
  had crashed or timed out measurements.
- **PL-68:** the handbook said "features don't import other features" was enforced by
  eslint. Nothing enforces it, and 857 imports already cross features. The handbook now
  says it is not enforced. See your decisions below.

Scans after the code changes: no import cycles, copy-paste at its pinned level, and no new
dead code. No new user paths or UI, so the path-audit and component scans didn't apply.

## Already fixed before this loop (records corrected, status "built")

AI-72 (`9a9627fb6`), AI-73 (`15df43067`), PL-82 (`13cf5a4f2`, `6958aff36`, `9b2746e82`),
AB-80 (`98f525c4b`), EDS-50 (`1b2e4f1aa`), EDS-51 (`1556e4104`). AB-69 and EDS-48 are built
too, but each still needs one check by you (below).

## Handed off (done up to the point that needs you)

- **EDS-40:** proven by tests, not live. Do one create or reset of an EDS project and
  check that `/cart` and `/checkout` load. The item lists what else to look for.

## Filed

- **EDS-54 (new, split from EDS-29):** the DA.live access-grant step logs a 401 and
  carries on. Fixing it changes several project-creation callers, so I filed it rather
  than forcing it in. Since the EDS-29 fix, a run with an expired sign-in still stops,
  one step later.
- Logged on PL-71: a widen that times out still leaves the test selection widened for
  the next run. Not fixed.

## Retracted or corrected

- My first test for EDS-52 also passed on the old code, so it proved nothing. I rewrote it.
  The new one fails on the old code.
- In the PL-74 hook proof, I first placed the new trace line too late. It broke one case;
  fixed before commit.
- The first rewrite of a ledger file reformatted 1,425 lines. I redid it as a 4-line change.

## Environment

- Nothing cloud-side was touched: no deploys, publishes, sign-ins or deletes.
- Still open from before you left (not done, by design):
  - The bodea project needs a dashboard Reset.
  - Justrite's "Prepare this store" settings are still in place.
  - The live run of "removing the ERP integration undoes its setup" (row 4.31) is untested.
  - The ERP integration has to be re-added for the remaining plan rows.

## Your decisions

1. **Merge `loop/2026-10-19-backlog-fixes` into the release candidate?** It's a
   fast-forward. Recommended: yes.
2. **PL-68:** enforce "features don't import features", or restate it? Enforcing means a
   check plus a ledger of the 72 existing feature pairs, which can then only shrink.
   Recommended: restate it. Allow imports of another feature's services, and ban
   reaching into its UI or internals. That matches how the code is actually built.

## Walkthrough queue (in order, minutes each)

1. **Merge** (decision 1).
2. **AI-71:** should an agent's project delete follow the `deleteAll` setting? That means
   real, irreversible cloud deletes from an agent. Needs your approval before anything
   is built.
3. **AI-15:** product decision about scoping screens to one project.
4. **EDS-6:** a data decision. The item states the choice.
5. **EDS-41:** a visual side-by-side check.
6. **AB-69:** one browser check of the built scope.
7. **EDS-48:** watch for one occurrence on release v1.1.1.
8. **EDS-40:** one live create or reset (see Handed off).
9. **PL-76:** walk rows 3.1, 3.11 and 3.12 (local), then 3.13 and 3.14.
10. **PL-68** (decision 2).
