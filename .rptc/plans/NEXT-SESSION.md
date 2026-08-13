# Next session — start here

Rewritten 2026-08-12, refreshed three times on 2026-08-13. **Everything is committed AND
PUSHED**; `develop` was at `8c619a57` when this line was written. `v1.0.0-beta.128` is released.

Gate at handoff: **997 suites / 12,777 tests** at the DEFAULT `maxWorkers: '75%'`,
`tsc --noEmit` clean, whole-repo eslint 0 errors 0 warnings, `validate:jest-config` passing.

**The old caveat on that number is retired and replaced by a sharper one.** This line used to
read "at `--maxWorkers=25%` … a default-workers green is one sample of a noisy process." The
worker count was never the problem — see the jest section below. What IS still true: a
full-suite result is worth exactly what the `ps` sampling beside it is worth, because
contention comes from OTHER runs, not from this one's settings.

> A second session works `feature/data-installer` in a sibling worktree. It ceded control of
> `develop` and pushes only its own branch; if something of theirs needs landing they will
> name the branch and range. Its Stage 1 (14 commits) and two doc corrections are already on
> `develop`; `08d38c88` (detached-watch fix) and `1f01fb53` (a repo-wide guard test requiring
> every `core/ui/Modal` consumer to be hosted by a `DialogContainer`/`DialogTrigger`) are on
> their branch and will bind you once merged.

---

## Read this first: two checkouts, one Dev Host

`launch.json` passes `--extensionDevelopmentPath=${workspaceFolder}`, so **F5 binds the
Extension Dev Host to whichever WINDOW had focus.** With a main checkout and a worktree both
carrying a `dist/`, the Dev Host can be running code from the other tree, and nothing used to
say so. Two full reload-and-look cycles were spent on that today, and the first diagnosis
blamed a second watcher that did not exist — the only watcher was one this session had
started itself twenty minutes earlier.

`f02aae3f` fixes the visibility half: esbuild writes `dist/build-info.json` (checkout path,
branch, short SHA, dirty flag, build time) on every build and rebuild; the extension logs it
at activation and shows a status-bar badge (`branch@sha`) in Development mode only. Clicking
it walks `src/` and reports whether `dist/` is behind.

**So before reporting any UI result: confirm the badge names the checkout you edited.** If
there is no badge, the Dev Host is running something else.

Two probe habits from the same episode:

- `grep -c` counts LINES. On a 48,978-line bundle it under-counts; use `grep -o … | wc -l`.
- **Never probe a bundle with non-ASCII.** `grep 'MCP servers ·'` returns 0 on a bundle that
  contains it, because esbuild escapes the `·`. `data-testid` values are the reliable probe.

---

## What shipped this session (2026-08-13, jest/gate)

| Commit | What |
|---|---|
| `528c1b5d` | The full-suite flake: cause, concurrency guard, assertion + config repair |
| `83cbcc8e` | Per-run MCP socket tree |
| `8c619a57` | Repointed the references the item's move left dangling |

### The gate was lying, and not for the reason it was filed under

A full run failed ~3 random suites on timeouts. The backlog item blamed `maxWorkers: '75%'`
and `workerIdleMemoryLimit` and planned a worker-count bisect. Both are innocent:

| Condition | Runs | Runs with failures |
|---|---|---|
| One suite at a time | 10 | **0** |
| Two suites concurrently | 6 | **6** (4–6 suites each) |

The cause is a second jest run sharing the machine — two sessions work this repo and the
sibling worktree symlinks `node_modules` back here, so overlapping runs were routine and
nothing announced them. The planned bisect would have "fixed" it by making runs slower and
the collision window narrower, leaving the cause untouched. **Read the diagnosis in a backlog
item as a hypothesis, not a finding** — this one had been read as settled for a day.

Shipped with it: `15-jest-concurrent.rule` blocks a second run; four machine-speed assertions
removed from `processCleanup.timeout` (each already proven with fake timers elsewhere);
`spawnedPids` there was declared and **never pushed to**, so its `afterEach` safety net
iterated an empty array and every failed test leaked a 60s node process; `cacheDirectory`
moved into `projects` where jest actually reads it (`.jest-cache/` had been gitignored since
the day it was configured and had never existed); `validate:jest-config` was failing on
`develop`, wired into no CI, pinning a tuning knob.

**Timings in the docs were wrong by an order of magnitude.** Full suite is **~20 seconds**,
not the "3–5 minutes" that was in `.rptc/CLAUDE.md`, the testing SOP and the cheatsheet.
`test:unit` ~12s, `test:ui` ~5s. If you budget minutes for a gate you will walk away from a
run that finished.

### Three limits on all of that, stated because they are easy to miss

- **The guard is a PreToolUse hook, so it only sees Claude's tool calls.** Terminal-launched
  runs, script-launched runs (including the measurement harness used here) and sessions whose
  checkout predates the rule all still contend. It narrows the window; it does not close it.
  Demonstrated during its own verification: the first final-gate run came back with the exact
  contention set, and the next one — sampled to confirm it was alone — was clean.
- **`ps` sampling is the check, and the naive version is broken.** A peer sampled with
  `ps … | grep -cE 'jest…'` and counted its own grep, because the pattern is in its own argv.
  Anchor on something that cannot appear in the sampler's argv (`node_modules/.bin/jest`
  works) or filter its pid, and confirm some samples read 0 — a self-matching sampler never can.
- **The socket-tree fix is verified by construction, not by a failure going away.** It does
  NOT reduce contention failures (measured before/after: same counts), and the `ENOTEMPTY`
  that motivated it was never reproduced locally — 0 across 20 runs.

---

## What shipped the session before (2026-08-12/13, AI surface + build stamp)

| Commit | What |
|---|---|
| `1a5b59a4` | Four cross-cutting webview/Spectrum traps recorded in skills + hooks index |
| `fa6efb5c` | Scoped the Picker key claim to what was measured |
| `1defa281` | Skill grouping by provenance — the AI Capabilities modal fix |
| `f02aae3f` | Build stamp (see above) |
| `ac59dd8e` | AI modal readability + capabilities-link relocation |
| `c64cfef8` | Response-envelope citations by symbol, not line number |
| `95dfdaa1` | AI-surface audit: research + seven-step plan |

### The modal fix, and why it happened

`skillInspector` inferred provenance from disk layout: a top-level file in its own hardcoded
list was first-party, anything in a subdirectory was `'adobe'`, everything else was "Custom".
Two lists described the same filenames — the writer's and the inspector's — and they drifted,
so `diagnose-demo` shipped in the writer and showed up under **Custom** as though a user had
written it. Separately, every Adobe bundle rendered under one hardcoded **"Adobe AEM"**
heading, so seven `appbuilder-*` skills were labelled AEM.

Both now read `DEMO_BUILDER_ALWAYS_ON_SKILLS` in `@/types/ai` — one home — and the writer
builds its list from it through a keyed content map, so a filename without content is a
compile error. Nested skills carry the `bundle` prefix their directory was named with.

**Generated projects were unaffected** (same 13 filenames, same content, same order), so no
`AI_CONTEXT_VERSION` bump was needed. Only the extension's reading of what is on disk changed.

### Line numbers have a half-life of about a day

Two sessions independently reached this and committed within minutes of each other
(`c64cfef8` here, `5ad9813b` in the worktree). A citation written as
`DatapackActivityView.tsx:132` pointed at `:145` the same afternoon. Cite symbols.

---

## The record now checks itself

Three things landed 2026-08-13 that change how this repo keeps itself honest. Read them before
adding another "remember to…" note anywhere.

- **`rptc-hygiene-scan`** (`.claude/skills/rptc-hygiene-scan/`) — the first scan aimed at the
  RECORD rather than the code: backlog links, items with no index entry, plans that shipped and
  never moved, and `file:line` citations pointing at deleted files. Every section prints a
  CONTROL line, because `(none)` from a check that did not run reads exactly like a clean
  result.
- **`rptc-record-drift.sh`** (Stop hook) — fires when a turn ADDS, DELETES or MOVES anything
  under `.rptc/{plans,backlog,complete}/`, or edits the index. Silent otherwise. It exists
  because both problems the scan found were created by moving things, and "check afterwards" is
  the instruction that gets skipped.
- **One PreToolUse dispatcher** (`.claude/hooks/router.sh` + `rules/*.rule`) replaced five
  near-identical hook scripts. **Adding a guard is now dropping a file in `rules/`** — no
  `settings.json` edit, no extra process. 21 tests, the first any hook here has had.

**What that pass found, and what is still true:** five shipped plans were sitting in `plans/`
(one saying so in its own overview), and `appbuilder-deployable-model`'s D1–D3 had shipped four
weeks earlier — ADR-011 predicted that exact rot in its own text and the update never came.
`.rptc/plans/` now holds `data-installer` (the peer's, active) and this file. Everything else is
in `backlog/` or `complete/`.

**A caveat this file cannot fix by itself:** the hook watches the index, not this handoff. This
header went five commits stale within an hour of being written. Check `git log` against it.

**A blind spot found 2026-08-13, worth knowing before you trust a clean scan.** §4 matches
`file:line` citations. References written as a **bare path with no line number** are invisible
to it, and so is any reference living outside the scanned directories. Moving the flake item
to `complete/` left three such references behind — two of them inside
`15-jest-concurrent.rule`, including the **user-facing block message**, which for a while told
whoever it stopped to go read a file that no longer existed. The scan reported §1 and §2 clean
and correct throughout; a `grep` for the old path found all three in one command.

So after moving anything under `.rptc/`, run the scan AND grep the repo for the old path. The
scan checks that the index points at real files; it does not check that the rest of the repo
stopped pointing at the old one.

Related, from the same pass: when you kill a dead citation, remove the `file:line` form rather
than annotating it in place. Leaving the literal path keeps §4 reporting a hit forever, and a
scan with a permanent known-false entry is one people stop reading.

## Open bug: GitHub blocked a storefront write — CLOSED BY ATTRITION, not solved

Reported 2026-08-11 by a colleague (`jogosset`): Storefront Setup died on the `fstab.yaml`
Contents PUT with "Repository rule violations found / Secret detected in content", naming no
file. Reproduced on two of their repos.

**2026-08-12 — it does not reproduce.** On `v1.0.0-beta.128`, two fresh repos created from
the same `boilerplate-b2b-template`, same account, two separate attempts. `fstab.yaml pushed
to GitHub` both times; zero rejection markers in 893 log lines; finished
`Complete: … /test-128-2`.

**What that rules out:**

- **The account.** "Push protection for yourself" applies to every repo that user writes to.
  Fresh repos would have blocked too.
- **The template.** Already excluded by a fork experiment; re-confirmed — the working repos
  came from the same template.
- **The extension version.** `.128`'s whole write-path diff is error text, logging and
  reformatting. Same bytes, same endpoints.

**What is left, and why it cannot be tested:** something about the two original repos. Repo
visibility was the next discriminator — public repos get push protection by default — but
both the blocked repo and the working one now return 404 unauthenticated, so they cannot be
told apart from here.

> **Correction to an earlier version of this file:** it recorded `jogosset/test` as public,
> from a tip scan. That is now contradicted by a 404. Either it was made private since or the
> claim was wrong; treat it as unverifiable rather than as evidence.

**Why this is acceptable to leave:** `.128` is in every beta user's hands, and its write paths
now name the blocked file and log GitHub's full response body — where the useful fields live
in `metadata.secret_scanning.bypass_placeholders[]` (`token_type` names the secret,
`placeholder_id` is what a bypass needs). A recurrence arrives diagnosable instead of
anonymous. That was what the release was for.

**Known gap, deliberately not fixed:** every Contents write after `fstab.yaml` is wrapped in a
catch and only warns. Making `fstab.yaml` non-fatal would report success while shipping a
storefront with no smart-404 handler, no Quick Edit and no code patches. **Do not "fix" it
that way.**

---

## Read this before trusting any claim in this file

The recurring failure is **verifying a list you authored instead of scanning for what you did
not think of**, and its sibling: **recording an error instead of fixing it.**

| Wrong claim | Why the check missed it | Caught by |
|---|---|---|
| "no count pin on `edsHandlers`" | the pin keys on `types` | running the suite |
| "the CSS change is complete" | lint + tsc pass; the tests are in jest | running the suite |
| "the redaction is clean" | scanned 6 known strings, not identifier SHAPES | a peer re-reading it |
| "two watchers are fighting" | inferred from a timestamp; one existed, and it was mine | `lsof` on the pid |
| "the modal shows no change" | `dist/` was 10 hours old and from another checkout | comparing mtimes |
| **"dashboard exposes 9 handlers"** | a 400-char regex window silently dropped a row | diffing against all `tool:` literals |
| "the per-TMPDIR trial isolates socket collision" | it moved paths for suites reading `os.tmpdir()` directly, so it changed several variables | reading the actual error text, not the counts |
| "the concurrency guard is safe to ship" | it made `router.test.ts` itself contention-sensitive — 6/6 failures | running the contention harness against it |
| "the shared socket root is the leading explanation" | a mechanism plus a timestamp correlation, never reproduced | asking what would falsify it |
| "the record is cleaned up" | the hygiene scan cannot see bare-path references | the user asking, then one `grep` |

Four of those five are from 2026-08-13 and three were caught by somebody else asking a plain
question. The instrument you build to check your work is part of what needs checking: the
sampler that counted itself, the guard that broke the suite guarding it, and the scan that
could not see the rot are all the same mistake.

The `router.test.ts` one generalises: **a test that asserts on ambient machine state will
pass alone and fail exactly when the condition it guards against occurs.** It now runs against
a synthetic `ps` snapshot for that reason.

That "dashboard exposes 9 handlers" one has a second lesson. The first response was to patch the count by hand and
write a note — but every LIST behind the number still came from the broken parse. **A derived
number corrected without regenerating its data is a coincidence you have not checked.** The
re-run happened to agree; that could not have been known in advance.

Rule: a grep can support a positive claim; only running or exhaustively tracing supports a
negative one. And pair every "nothing found" with a positive control at the same scope.

---

## 2026-08-13, later: the backlog was validated and a third of it was dead

Prompted by the user reading a ranked pick-list and saying *"it looks like every backlog item
needs to be re-validated."* They were right. The 14 actionable items were checked against
`src/`:

| Verdict | Count | Items |
|---|---|---|
| **Shipped, never archived** | 5 | export-settings/includeSecrets · the PDP pair (2 files) · reset-consent · generated-diagnosis-skill · integrations-host-contract |
| Premise stale, re-scoped in place | 1 | legacy-soft-deprecation (~2.5 months out of date) |
| Partly overtaken | 1 | third-party-tooling-visible-and-optional |
| Confirmed accurate | 6 | ai-surface-coverage · project-level-facts · tier-ai-bundle · eds-drift-checker · block-type-scale · prereqs-reframe |
| Spot-checked only — treat as unverified | 1 | appbuilder-deployable-model |

**The item ranked #1 on the pick-list had been fixed weeks earlier** (`12f4b802`). So had the
#2 pair (`3843b6be`), #3, #5 (`0b9f0f6d`) and #10. All five are now in `complete/` with
outcome banners carrying the verifying evidence.

**Age predicts truth; topic does not.** Everything filed 2026-08-13 measured true. Everything
filed 2026-07-29 → 2026-08-11 was a coin flip. The mechanism will recur: a fixing commit
touches `src/` and `tests/`, never `.rptc/`, so nothing makes an item's death visible. The
hygiene scan cannot see it either — **a shipped item's links resolve perfectly.** Structure
and truth are different properties, and only the first one has a scanner.

Two traps worth carrying forward:

- **"Verified <today's date>" in an index entry may be a re-assertion, not a re-measurement.**
  `integrations-host-contract` said "19 references, verified 2026-08-13". The number came from
  the item's own text. Measured the same day: 0.
- **A count is the cheapest claim to check and the most convincing one to get wrong.** Both
  numeric claims that were checked ("19 references", "zero of 13 skills cover diagnosis") fell
  to one command each.

So: **before picking any item up, run one command against `src/` that would falsify its central
claim.** Do that before reading the execution plan, not after.

The unquoted-glob trap bit again during this pass (`pdp404*.test.ts` → "no matches found"), and
was caught only because a fallback printed nothing where it should have printed something.

---

## Outstanding

**Shipped since this file was written:**

- **The full-suite flake** — done, `528c1b5d` + `83cbcc8e`, archived to
  `.rptc/complete/2026-08-13-jest-full-suite-timeout-flake.md`. Cause was concurrent runs,
  not config. Read the "Three limits" note above before quoting any gate number.
- **`global-mcp-version-pin`** — done, `d90b4f3f`, archived to
  `.rptc/complete/global-mcp-version-pin/` with its outcome and the three review
  findings. One thing NOT verified: that Claude Code stops reporting conflicting scopes
  once both entries name the same file. The observable signal is a
  `[MCP] refreshed the global ~/.claude.json entry` line in Debug Logs, which appears
  only when the repair fired.

**Nothing is active. Pick from the backlog.**

**Paused, ready to resume:**

- **`.rptc/backlog/ai-surface-coverage/`** — research done, seven steps written, deferred
  2026-08-13 so the live defect above could go first. Step 01 is mechanical and the worklist
  of all 41 unexposed handlers is in `.rptc/research/ai-surface-coverage/research.md`.

**Needs a Dev Host or a live backend — cannot be done by an agent:**

Moved to `.rptc/backlog/` on 2026-08-13. `plans/` is for ACTIVE work and none of these is
being worked; five shipped plans were sitting there too, one of which said so in its own text.

- **`mesh-staleness-scope` — DROPPED 2026-08-13, not archived.** Steps 01–04 shipped as
  code; step 05 was a manual Dev Host confirmation that never happened, and the user chose to
  stop carrying it. Two consequences worth knowing: the staleness fix was never eyeballed on a
  live window, and **`demo-builder-test` no longer needs preserving** — it was being kept
  intact purely as the fixture for that test. Its build-first advice ("a `0` means another
  tree or an older build won") is superseded by the build stamp, which answers that in the
  status bar. Deleted rather than stubbed, per no-soft-deprecation; `git log` holds it.
- **`backlog/hybrid-storefront-model`** — unblocked, gated on individual-vs-company login
  against a real B2B backend.
- **`backlog/per-integration-api-attribution`** — steps 01–05 shipped, 06 withdrawn, 07 is
  RELEASE-gated: retiring the flat write loses picks for anyone still on `v1.0.0-beta.123`.
- **One visual check outstanding:** the AI modal was confirmed readable 2026-08-13, but the
  two-column skill groups and the persistent scrollbar specifically were never eyeballed.

**Real work, not started:**

- **`backlog/appbuilder-deployable-model` D2–D6.** Only D1 is built. Track A pre-positions
  `getWorkspaceCredential` — `dead-code-scan` will call it unused; it is not.
- **The integrations host contract item — SHIPPED, archived 2026-08-13.** This entry claimed
  "19 references, verified still true 2026-08-13"; the measurement was 0. Fixed in `0b9f0f6d`
  — `showIntegrations.ts` enumerates both handler maps with `getRegisteredTypes()`. Kept here
  as the worked example of a "verified" claim that was never measured. (Named in prose, not as
  a path, so it stops registering as a live reference — per the rule below about killing dead
  citations rather than annotating them in place.)

**Latent, measured but not fixed:**

- **Ten wall-clock upper-bound assertions remain** across `cacheManager-operations`
  (`duration < 10` — the most fragile in the repo), `retryStrategyManager`,
  `csp-nonce-security`, `commandSequencer`, `adobeEntityService-organizations-edgeCases` and
  `processCleanup.test.ts`. None failed solo; `processCleanup.test.ts` failed once under a
  concurrency trial. Same starvation story as the four already removed. The inventory is in
  the completed flake record so nobody re-derives it.
- **Force-exit warnings appear in ~44% of full runs** (7 of 16 measured), not the "3/3 at 75%,
  reproducible on demand" its backlog entry claimed — corrected there 2026-08-13. It never
  co-occurred with the peer's `ENOTEMPTY` (0/16). If you plan an experiment around that item,
  design it for 44%.
- **Five `file:line` citations in other people's backlog items do not resolve** (§4 of the
  hygiene scan). Pre-existing, left for their owners: `appbuilder-deployable-model` d3 steps,
  `legacy-soft-deprecation`, and one curated research doc.

**Known gap, no gate:**

- **`SECRET_ENV_KEYS` is a list with a doc comment, not an enforced contract** — though a
  catalog-shaped guard test now exists (`d82aea62`). Re-check whether it closes the hole
  before rebuilding it.

**Backlog filed, still open:**

- `2026-08-11-project-level-facts-stored-per-component.md` — 11 multi-owner keys unexamined.
  Key-agnostic; step 1 is reproducing the drift before any code moves.
