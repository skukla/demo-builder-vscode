# Next session — start here

Rewritten 2026-08-11, after the `.127` cut. **Everything is committed AND PUSHED.**
`develop` is level with `origin/develop`; `master` carries the release merge.

**`v1.0.0-beta.127` SHIPPED** — https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.127
484 commits, pre-release, one `.vsix` asset. Beta users auto-update to it.

Gate at handoff: **965 suites / 12250 tests**, whole-repo eslint (0 errors, 0 warnings), tsc.

---

## There is no release stream any more. Pick from Outstanding.

The session ran `dream` → `codebase-sweep` → 3 fixes → cut `.127`. Nothing is
half-finished in the tree.

### What shipped in `.127` that changes existing projects

Only two things touch projects that already exist. Both are in the release notes and the
CHANGELOG; repeated here because they generate support questions:

1. **Every project flags its AI files stale and prompts a regenerate.** Intended. The
   generated `PostToolUse` git-sync hook never fired on any project since beta.109, and only
   a regenerate replaces it. Users who skip the prompt keep a dead hook.
2. **AI-authored storefront edits were never reaching GitHub.** Same defect — the hook read
   `$CLAUDE_TOOL_INPUT`, which Claude Code does not set (it uses stdin), and the generated
   `sync-changes` skill told agents the hook handled commit+push so they skipped
   `sync_storefront` too. Silent at both ends. (`df4156b2`)

A third, `777b81a3`, cleared the storefront "Republish needed" flag on disk — visible but
self-explanatory.

---

## Read this before trusting anything else in this file

**Five times this session I got a wrong answer from a correct command aimed at the wrong
place.** No positive control caught any of them, because each control inherited the same
wrong scope. A control proves the tool works; it does not prove you pointed it at the right
tree.

| What | The wrong aim | Caught by |
|---|---|---|
| "`appbuilder-shell-app` is unmerged" | grepped `features/components/config/`; catalog is in `project-creation/config/` | re-grepping wider |
| "12 of 13 facts are in no skill" | grepped `.claude/skills/`; the App Builder skills are GLOBAL (`~/.claude/skills/`) | noticing the count was implausible |
| "tsc and eslint pass" | `${PIPESTATUS[0]}` is bash; this is zsh, so both exit codes came back **empty** | the blank output looking wrong |
| eslint positive control | temp file outside the base path → eslint skipped it, exit 0 | reading the "File ignored" line |
| **A release-note setting name** | wrote `demoBuilder.eds.defaultDaLiveOrg` from memory; the real key is `demoBuilder.daLive.defaultOrg` | diffing `package.json` against the `.126` tag |

The last one would have shipped a wrong setting name to users. **Assume the same rate
applies to any claim in this file that is not marked verified.** This is the strongest
candidate for the next `dream` run — the evidence is already in `.rptc/dream/2026-08-11.md`.

**And one wrong claim I made about behaviour, corrected only after it reached a commit
message:** see "the edsConfig fix" below.

---

## What landed this session

### `dream` — 4 proposals, all applied (`.rptc/dream/2026-08-11.md`)

Theme: **nothing told the agent it cannot see this UI.** 16 user turns carried a screenshot
across 3 of 4 sessions; every visual defect was caught that way, none by the agent. Meanwhile
`spectrum-webview-ui` §Verify said *"Eyeball the actual surface"* — written to a human.

- `spectrum-webview-ui` §Verify rewritten: the agent cannot see the surface; never report an
  unseen visual result; **never assert parity from declarations** (identical rules render
  differently under different ancestors — `.integration-card` proved it); make parity
  structural via shared custom properties; check real cardinality before designing per-row
  anything.
- Root `CLAUDE.md` §Verifying: quote your globs (`--include='*.css'`).
- 10 plans moved to `.rptc/complete/`, each against a verified deliverable.
- `project_appbuilder_app_family` memory pruned ~45 lines → ~30. Its branch-state claims had
  all gone false.

**Two long-open items CLOSED with measurements.** The 2026-08-07 verifying rule stuck:
positive controls went 0.2–0.9% → 3.0–6.2% per 100 Bash calls, pipe-into-`||` fell 4.00% →
~1.2%. The skill-invocation gap opened 2026-07-31 is gone: 5.3/7.4/15.1% vs 2.1/4.0%.

### `codebase-sweep` — the codebase improved (`.rptc/research/codebase-sweep-2026-08-11/`)

Component-extraction groups **9 → 4** (the `step-view`/`step-nav` shell got extracted).
Cycles flat at 13. jscpd flat at 64 clones / 0.70%. Doc-drift 1 → 0.

**A finding was proposed, accepted, and then WITHDRAWN on implementation.** The
`page-container-padded page-header-section` trio looked like a shared shell; opening the CSS
showed `page-container-padded` composes with four different modifiers, so it is the
base-plus-modifier idiom. Lesson recorded in the sweep: check whether shared classes are a
base + modifier pair before calling a trio a shell.

### The edsConfig fix — and the claim I got wrong

`ab198c72` extracted `buildEdsConfigFromStorefront` so `WelcomeStep` and `useProjectBuilder`
stop deriving `edsConfig` separately. That part is right and gate-green.

**Its commit message names a scenario that cannot happen.** It says "changing the demo
package leaves the fields pinned to the previous package". A package change sets
`selectedStack: undefined` in the same update (`WelcomeStep.tsx:99`), so the effect's `eds-`
guard never passes. I asserted a failure mode having read only one of the two functions.

The **real** exposure is edit: `useWizardState` rehydrates package and stack together
(`useWizardState.ts:287`), and the effect refreshed 14 catalog-derived fields while skipping
`codePatches`/`codePatchSource`. A project created before its storefront gained a code patch
keeps the OLD ones — and `citisignal/eds-paas` carries nine, three of them the
`product-teaser-*` PDP link-encoding fixes. Now pinned by
`WelcomeStep-edsConfigRefresh.test.tsx` (`dcfd7de1`), control-verified. The sweep doc carries
the correction; the commit message cannot be rewritten (pushed, and in the release).

---

## Outstanding

Carried forward, still true:

- **`mesh-staleness-scope` step 05 — never run.** Flip `componentConfigs` key order in a
  manifest and confirm the staleness verdict is order-independent. The only check that
  exercises the original defect on real data; code is committed and unit-tested.
- **Missing `get_store_structure` MCP tool** — PDP handoff §3, still the highest-value gap.
  An agent debugging PDP failures cannot see that a project points at a Commerce website with
  no products.
- **Duplicated Commerce scope still in existing manifests.** All three resolvers consult
  `BACKEND_OWNED_SCOPE_KEYS`, so verdicts no longer turn on key order. **What remains is the
  DATA MODEL** — a migration dropping the duplicate copies would dissolve the bug class.
- **`pickSampleSku` reads the project manifest**, not the storefront's served `config.json`.
  Recorded as intended and never made.
- **`.dest-context` is 12.5px — off the type scale.** Verified still true this session
  (`custom-spectrum.css:4845`, scoped 12px override at `2107`). The add-integration modal
  renders the same component and still gets 12.5px.
- **`who_created: 'Demo Builder'` is dead weight** (`adobeEntityFetcher.ts:908`, verified).
  Adobe overwrites it with the authenticated user's IMS id — inferred, not confirmed against
  the API. Cosmetic; fold into the next edit of that file.
- **Four suites flake under parallel load** — `extension-context`, both `inExtensionMcpServer`
  suites, `mcpConfigWriter`. All passed in isolation; reads as socket contention. Did NOT
  recur in either full run this session.

New, from the sweep's rejected list — revisit triggers, not work:

- **`webviewCommunicationManager.ts:320-340` ≡ `WebviewClient.ts:107-127`.** The
  pending-request settle is logically identical, but they are the two ends of one protocol
  and the surrounding dispatch differs. Two sites, no drift, so it waits. **Revisit if** a
  third correlation-id consumer appears, or a fix lands on one end only — that second
  condition is exactly what promoted the edsConfig finding.
- **`ProgressUnifier.ts` has 4 internal clones.** Same-file, so fine per triage. If it grows
  again, run `decompose-god-file` rather than re-reading that line.
- **Two plans deliberately left in `.rptc/plans/`**: `appbuilder-deployable-model` (D2–D6
  pending per its own overview) and `hybrid-storefront-model` (it retires `citisignal-b2b`,
  which still appears twice as a `path` in `demo-packages.json` — ambiguous, so untouched).

---

## Verifying the `.127` release itself

Nothing is required — it is published and verified (`gh release view` shows pre-release,
not draft, one `.vsix`). If you want eyes on the shipped build, the highest-value manual
check is the one thing tests structurally cannot reach:

**Regenerate AI files on an existing EDS project, then have Claude edit a block.** The
`[CodePatch]` and git-sync paths both log to the Debug Logs channel, so the evidence is
`[Storefront Setup]` / `[CodePatch] Applied '<id>'` lines rather than anything visual.
That exercises the two behaviour changes that reach existing projects.
