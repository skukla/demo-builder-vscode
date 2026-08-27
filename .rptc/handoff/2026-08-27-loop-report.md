# Loop report — 2026-08-27 (afternoon window, owner at the gym)

Everything below happened unattended, on branches, with the full gate green
before every commit. Nothing touched develop, no cloud resources were changed,
and the two DA.live/skill-coverage runs used only read-only tools.

## The short version

Three pieces of work shipped, each on a pushed branch:

1. **App Management support reached its planned wall.** Steps 1–3 of the plan
   are done: the catalog can describe the new generation of Commerce App
   Builder apps, the deploy path accepts them, and the client for their
   install/associate REST API exists and is fully tested. What remains needs
   you (two decisions and a ~30-minute supervised probe).
2. **A real product defect found and fixed:** the fourteen Demo Builder
   "skills" we generate into every project were written in a file layout
   Claude Code never registers as skills — so no agent, in any session, has
   ever been able to invoke them as skills; they were only readable as plain
   files. Fixed, migrated safely, and the battery can now measure skill usage.
3. **The manifest-migration cleanup (phase 2) is written and waiting.** The
   old singular mesh/app state is gone from the code on a branch that stays
   unmerged until you confirm the beta group is on ≥ beta.141 — confirming and
   shipping are now one merge apart.

## Per item, in plain English

### App Management support (the starter-kit item) — branch `loop/2026-08-27-starter-kit`

Adobe's new generation of Commerce App Builder apps declare themselves
differently (an `extensions:` section instead of packages at the root) and
must be *installed into Commerce* after deploy, through a REST API each app
hosts itself.

- **Step 1 (earlier):** catalog entries can declare the new layout and
  lifecycle (`74ec1c35e`).
- **Step 2:** the extension now detects which layout a cloned app uses and
  matches it against what the catalog entry expects, with a clear error
  either way. The package-renaming step our deploys do turned out to already
  skip itself correctly for the new layout — documented and pinned with tests,
  including the real starter-kit config file fetched from Adobe's repo
  (`600362d15`).
- **Step 3:** `appManagementClient` — the four REST calls we'll need (read
  install state, install/upgrade, pre-validate, record the Commerce
  association), built from Adobe's published OpenAPI spec, 14 tests
  (`19c8f28d6`). Deliberately not wired into any flow yet.
- **Found while checking credentials (step 2a):** the workspace download we
  already fetch does NOT reliably carry the six sign-in values these apps
  need — it only lists credentials that already exist on that workspace
  (verified against a real workspace). So the values must be fetched
  deliberately after ensuring the credential exists; that seam is designed
  but its live half is part of your spike. Recorded in the plan file.

### The skills that were never skills (AI-surface coverage item) — same branch

Working on skill-coverage measurement, the first live probe showed the agent
answering a "use your diagnose-demo skill" prompt by *reading the file* rather
than invoking a skill. Digging in (with a positive control in the same
session): Claude Code only registers skills in the `<name>/SKILL.md` folder
layout, and our fourteen generated skills were flat `<name>.md` files —
invisible to the skill system everywhere, always. The modal has been promising
skills that were really just documents.

**The fix (`32d62e8ad`):** every generated skill now lands as
`<name>/SKILL.md`; the old flat files are cleaned up with the usual
edited-file protection (a file you've modified is reported, never deleted);
the inspector, the health check, and the home surface all understand both
layouts; and the version stamp was bumped so existing projects migrate
automatically at the next activation. 22 files, full gate green.

**The measurement (`2c4d3837f`, `e75260c62`):** battery prompts can now
declare an expected *skill*, run from inside the project, and get one of three
verdicts: invoked / reached-as-prose / unused. Run live twice: the Adobe
bundle skill (already folder-layout) **invoked correctly headlessly** — which
also settles the item's open question — and the flat-layout skill scored
reached-as-prose, confirming the defect through the scorer. After you press
F5, the same prompt is the fix's acceptance test.

Also verified en route: bodea's seven empty `appbuilder-*` skill folders are
the documented leftovers of an earlier correct removal, not a new bug.

### Manifest migration phase 2 — branch `loop/2026-08-27-manifest-phase2`

The item's own gate says phase 2 ships only after you confirm every beta user
is on ≥ beta.141. That gates *shipping*, not *writing* — so it's written, on
its own branch, cut from develop, one merge from done.

What it does: the legacy singular mesh/app state fields are removed from the
in-memory project model entirely. Old manifests still load forever — their
legacy fields are read by exactly one quarantined function, which is also the
startup sweep's path, so even a machine that skipped phase 1 still migrates
safely (the safeguard you asked for on 2026-08-24). All the accessor-level
fallback code is deleted; the guard test that used to allowlist 7 files with
15 legacy accesses now allowlists one file with 5.

Two things worth naming from the work (`797194416`):

- The guard could never see one access: a dashboard check passed
  `'meshState'` as a plain string key. The compiler caught it once the field
  was gone. It now marks the field that actually changes.
- The strongest proof came free: the storefront config-file snapshot that was
  recorded from the OLD legacy shape reproduces **byte-for-byte** from the
  new keyed shape. I compared the bytes directly before removing the old
  snapshot entry — the identity is real, not re-recorded.

Kept deliberately (decision logged on the item): the two other load-time
conversions (Console-API picks, the DA.live site-name cleanup) stay — they
are the same kind of load-path tolerance the quarantine exists to preserve.

### Claude Code disk-footprint report — SHIPPED (`4ba0d1305`)

The "storage grows ~4 GB a year and nothing reports it" item, done as
specified: "Demo Builder: Diagnostics" now measures `~/.claude` when it runs —
total size, the three largest subdirectories, transcript count/size/oldest —
and says plainly that it is Claude Code's data, that nothing deletes it, and
that deleting transcripts resets chat resume. No cleanup button, by the item's
own rule. Eight tests against a real temp tree, including one that pins "the
output never offers deletion". Item marked shipped.

### Directory-regroup item closed (`a4f54c911`)

Its one open thread — re-measure `authentication/services` after the facade
split — came back 31 files with working name families, under the item's own
38-file leave bar. Verdict: leave; item shipped.

### Maintenance triage (your default fallback lane) — now exhausted

- **The two-EDS-cards duplication** (low): its own write-up says to fix it
  the next time someone edits those files, not cold. Left as filed.
- **Bodea's identical shared catalogs** (med): all its unattended work was
  already done on 2026-08-23 (re-measure + differentiation proposal). What
  remains is a data-ownership decision — see the queue.
- **God-file candidates** (low): adjudicated 2026-08-24 — every candidate
  deliberately left alone; the item says the next input is the structural
  baseline, not another size pass. Respected.
- Everything else open is blocked on a dependency, gated on you, or an epic
  needing your direction. **The loop is standing down with nothing
  unattended left to do.**

## Walkthrough queue — one decision each

1. **App Management install: automate or hand back?** DECIDED (automate,
   hands-back fallback) and the spike is DONE: the kit deployed end-to-end
   through the extension on 2026-08-27 evening and the install API answers at
   the predicted per-app base URL (401 auth-required = exists and routes).
   What remains for you: which Commerce instance to associate it with.
2. **One-app-per-workspace:** does App Management strengthen the case for the
   per-solution-center Adobe I/O project move (its own epic)? Affects step 4's
   shape.
3. **ACCS `ACCS-REST-API`:** not CLI-subscribable — accept a guided manual
   handoff in the add flow (same pattern as the settings hand-back)?
4. **Press F5, let the sweep migrate, then run the acceptance test:**
   `node .rptc/plans/evaluation-mode/battery/run.mjs --only skill-diagnose` —
   it should flip from reached-as-prose to invoked. (Regenerate AI Files on
   bodea does the same for that project immediately.)
5. **Merge `loop/2026-08-27-starter-kit`** (6 commits: App Management steps
   1–3, the skill-layout fix, the skill-coverage rig, this report).
6. **Merge `loop/2026-08-27-manifest-phase2`** — after you confirm the beta
   group is on ≥ beta.141. One commit, net −210 lines.
7. **Bodea catalogs:** try the 5-minute Admin-UI differentiation on one
   instance (proves the story), and/or ask the pack's owner for the durable
   change. The exact category edit is written in the item.
8. **Tier-2 battery design question:** write-safe coverage needs a disposable
   scratch project — where should it live so a crashed run doesn't strand a
   fake project in your dashboard? (This is the design gate holding tier 2.)

## Housekeeping facts

- Backlog logs were reconciled (`unlogged --write`: 5 entries added, the
  refusals were items already marked shipped); index re-synced, 49 items, all
  references valid. Note: those log edits rode the phase-2 branch.
- The battery's two skill runs used the read-only allowlist; the run records
  are committed with the rig.
- `caffeinate` is still running from the overnight window.
