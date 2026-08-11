# Next session — start here

Rewritten 2026-08-11 (second session that day). **Everything is committed AND PUSHED.**
`develop` is level with `origin/develop` at `e865294b`. Still on `v1.0.0-beta.127` — no
release was cut this session.

Gate at handoff, run in full immediately before writing this: **969 suites / 12297 tests**,
`tsc --noEmit` clean, whole-repo eslint 0 errors 0 warnings.

---

## ⚠️ Two things need a human, and one has a clock on it

### 1. A public-repo exposure was cleaned up. Two steps remain — neither is doable by an agent.

`8213b829` (originally `35b2b41d`) published details of an internal Adobe service in this
**public** repo. No credentials — no tokens, keys, emails or IPs — but four things went out:
a colleague named beside a defect in their own service, the stage Runtime endpoint including
its namespace id, two activation ids from live responses, and an internal env var name quoted
from an error body.

**Done:** file redacted, history rewritten across 9 commits, force-pushed (branch protection
lifted and restored — verified identical field-by-field), local backup refs deleted and
`gc --prune=now` run. `develop` and this machine no longer contain the unredacted text.
Verified: 0 forks, 0 network copies, 0 PRs referencing the commit.

**Still outstanding:**

- **GitHub Support GC.** `35b2b41d` still resolves through the GitHub API. A force-push does
  NOT garbage-collect; GitHub keeps unreferenced objects and cached views until Support runs
  it. Ask them to purge unreferenced commits and cached views for `skukla/demo-builder-vscode`.
- **Tell the colleague.** Their name was public for roughly an hour. No technical step reaches
  whatever crawled it in that window, and this was the highest-severity item.

**Prevention landed** (`e865294b`): a redaction rule in `.rptc/CLAUDE.md` beside the artifact
policy, and `.gitignore` entries for raw probe captures (`**/raw/`, `*.probe.json`,
`*.probe.txt`). The rule exists because `.rptc/` is tracked and this repo is public, so a
writeup that probes an internal service publishes whatever it quotes.

### 2. `AI_CONTEXT_VERSION` is now 7 — every existing project will prompt to regenerate

Intended (the new `diagnose-demo` skill only reaches projects that regenerate), but `.127` did
the same thing and it generated support questions. **Put it in the release notes** whenever
this ships.

---

## What shipped this session

Nine commits. SHAs below are post-rewrite — the pre-rewrite ones are gone.

| Commit | What |
|---|---|
| `8213b829` | Data Installer live-API probe writeup (now redacted) |
| `b768472f` | Backlog: `export_project_settings` ignores `includeSecrets` |
| `de41f9a3` | gitignore vendor doc exports |
| `a1d7bb4b` | Four off-scale font sizes → `font-size-75` token; scoped override deleted |
| `99ccfc6f` | Commerce store scope single-sourced (write narrowing + load migration) |
| `5d215fdd` | Backlog: project-level facts stored per-component |
| `00f689d6` | Test pins for `a1d7bb4b` (see "a commit that didn't stand alone") |
| `a069b792` | `diagnose-demo` skill + AGENTS.md pointer, `AI_CONTEXT_VERSION` 7 |
| `e865294b` | Redaction + prevention rules |

Earlier the same day (previous session, already in history): `get_store_structure` MCP tool,
`who_created` write removal, `pickSampleSku` served-config sampling, and the
generated-diagnosis-skill backlog item.

### Three findings worth keeping

**`who_created` was NOT dead weight, in the direction that mattered.** The handoff called it
cosmetic. Reading the consumers showed the READ side gates project deletion
(`projectOwnership.ts:104` compares it to the token's IMS user id), and there were **three**
write sites, not two. The write removal is safe — the gate only ever reads Adobe's response —
but the framing was wrong. Still unverified: whether Adobe actually overwrites the value.
One glance at `who_created` on a freshly created project settles it; it changes nothing either
way.

**The duplicated-scope item was unimplementable as written.** It said "a migration dropping the
duplicate copies would dissolve the bug class." A migration alone dissolves nothing — the
duplicates are re-created on every Configure save, because the config surfaces fan one field's
value to every component declaring it. The fix needed a write-side change first
(`resolveWriteTargets`), then the migration. Reads already preferred the backend.

**`citisignal-b2b` appearing twice is NOT a bug** — closed. Those are `codePatchSource.path`
entries pointing at the patch **ledger** directory in `eds-demo-patches`, kept deliberately
when the hybrid plan repointed CitiSignal onto the B2B base. `custom` uses the sibling `b2b`
ledger the same way. The old handoff's "ambiguous, so untouched" was the right call; this
resolves it.

### A commit that didn't stand alone

`a1d7bb4b` (the CSS change) removed rules that two tests in `destinationRowType.test.ts`
pinned, so it is red in isolation; `00f689d6` fixes it. Cause: the CSS change was checked with
lint and `tsc` but not jest, because CSS "usually has no tests" — this project tests CSS rules.
**Run jest for CSS changes.**

---

## Read this before trusting any claim in this file

**Three times this session a claim would have shipped wrong until the thing was RUN rather
than grepped for.** Different failure from the last handoff's "correct command, wrong tree" —
this one is greps confirming what you expect and missing what you didn't think to look for:

| Wrong claim | Why the grep missed it | Caught by |
|---|---|---|
| "no count pin on `edsHandlers`" | the pin keys on `types`, not `edsHandlers` | running the suite |
| "the CSS change is complete" | lint + tsc pass; the tests are in jest | running the suite |
| "a second writer causes the scope drift" | there is none; the mechanism is the fan-out **target set** | tracing all writers |

The rule that follows: **a grep can support a positive claim; only running the thing supports a
negative one.** "Nothing pins this" and "nothing else writes that" are the two shapes that keep
being wrong.

---

## Outstanding

**Needs a Dev Host or a live backend — cannot be done by an agent:**

- **`mesh-staleness-scope` step 05 — still never run.** Its own text says "cannot be done by
  tests." Flip `componentConfigs` key order in a manifest and confirm the staleness verdict is
  order-independent. `demo-builder-test` still carries the disagreement — do not clean it up
  before testing.
- **`hybrid-storefront-model` — unblocked, gated on live verification.** The `citisignal-b2b`
  ambiguity that parked it is resolved (above). What remains is the step-02 gate:
  individual-vs-company login against a real B2B backend. Tier 2 is otherwise functionally
  complete per its own overview.
- **Two visual checks nothing here can reach.** Whether the four font-size changes read
  correctly on the integrations surface, and whether an agent actually reaches for
  `diagnose-demo` when handed a vague symptom ("PDPs are empty") rather than editing first.

**Real work, not started:**

- **`appbuilder-deployable-model` D2–D6.** Only D1 is built.

**Unresolved, not reproducing:**

- **Four suites flake under parallel load** (`extension-context`, both `inExtensionMcpServer`
  suites, `mcpConfigWriter`). Did NOT recur in any run this session, including two full passes.

**New backlog items (both filed today, both ready, neither blocked):**

- **`2026-08-11-project-level-facts-stored-per-component.md`** — 17 of 25 declared env vars have
  more than one owner in `componentConfigs`; 6 are the scope keys now fixed, 11 unexamined.
  **Its first draft asked the wrong question and the file records that**: there is no second
  writer anywhere. The drift mechanism is that Configure's fan-out targets come from
  `selectedComponents`, so a component holding a copy but missing from the selection lists never
  updates. Key-agnostic. Step 1 is reproducing it before any code moves — if it does not
  reproduce, the premise needs rechecking.
- **`2026-08-11-generated-diagnosis-skill.md`** — SHIPPED as `a069b792`. Move to
  `.rptc/complete/` on the next pass.

**Carried forward, still true:**

- **`pickSampleSku` samples from the served config now**, and reports scope divergence as a
  finding only when the project reads `published` yet the CDN serves a different scope — the one
  case `edsStorefrontStatusSummary` structurally cannot detect, because it compares bookkeeping
  to intent and never reads the CDN.
- **`updateField`'s linked-field write** puts the DERIVED key's value on the SOURCE field's
  component list (`ADOBE_COMMERCE_URL` → `ADOBE_COMMERCE_GRAPHQL_ENDPOINT`). The sets are a
  superset today so every declarer is covered, but it also writes the key onto `headless`, which
  does not declare it. Harmless now; wrong by construction. Noted in the audit item.
