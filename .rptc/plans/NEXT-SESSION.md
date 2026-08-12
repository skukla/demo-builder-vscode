# Next session — start here

Rewritten 2026-08-11 (second session that day, after a history rewrite). **Everything is
committed AND PUSHED.** `develop` is level with `origin/develop` at `466bf140`. Still on
`v1.0.0-beta.127` — no release was cut this session.

> A second session has also been pushing to `develop`. The tip moved between two of this
> session's own pushes, so treat any SHA below as "at time of writing" and check `git log`.

Gate at handoff: **971 suites / 12331 tests**, `tsc --noEmit` clean, whole-repo eslint
0 errors 0 warnings.

> **History was rewritten twice this session.** Every SHA from `dda7dd93` onward is new.
> If you are reading an older note, plan or commit message that cites `35b2b41d`,
> `8213b829`, `dd05499b`, `e865294b`, `72fe00e2`, `15baa6d2`, `a069b792`, `99ccfc6f`,
> `a1d7bb4b`, `00f689d6`, `5d215fdd`, `de41f9a3` or `b768472f` — those objects are gone.
> Match on the commit SUBJECT instead.

---

## ⚠️ One thing still needs a human

**Tell the service owner whose name was public.** A probe writeup published an internal
Adobe colleague's name beside a defect in their own service, in this **public** repo, for
roughly an hour. History has been rewritten and their name is gone from `develop` and from
every local clone — but no technical step reaches whatever fetched or crawled the repo in
that window. This is the only item with no remedy but a conversation.

**GitHub Support GC: not being filed.** Unreferenced objects still resolve by SHA until
GitHub collects them. The user's call (2026-08-11) is to let natural GC handle it, which the
conditions support: **0 forks, 0 network copies, 0 PRs** reference the commits, so nothing
holds them alive. A Support request would buy speed, not outcome.

### What the exposure was, and what was done

`dda7dd93` (originally `35b2b41d`) published details of an internal Adobe service. **No
credentials** — no tokens, keys, emails or IPs. What went out: a colleague's name, the stage
Runtime endpoint including its namespace id, **six ACCS tenant ids plus one more in prose**,
two activation ids, and two internal env var names.

Cleaned in two passes, because **the first pass was incomplete**: it caught the name,
endpoint and activation ids but missed a fenced code block of six tenant ids in §5. The
method failed in a specific way worth remembering — the verification scanned for the six
strings already identified and reported "all clear", never scanning for identifier SHAPES
not thought of in advance. The second pass scanned structurally (fenced blocks, alnum runs
≥12, hosts, UUIDs) and found the rest. **The redaction rule in `.rptc/CLAUDE.md` already
named tenant ids explicitly** — the rule was written and then its own clause not applied.

Prevention landed in `ea22ed5b`: the redaction rule in `.rptc/CLAUDE.md`, and `.gitignore`
entries for raw probe captures (`**/raw/`, `*.probe.json`, `*.probe.txt`).

---

## Coordination: a second session is active on this repo

`data-installer-integration` is building the Data Installer feature on the
`feature/data-installer` worktree, starting Stage 1 from `12f4b802`.

- Its branch was **reset onto the rewritten history** during the second rewrite. It had zero
  commits of its own, so nothing was lost — but that is why the rewrite happened when it did.
  Rewriting `develop` alone would have left the tenant ids on that branch, and a later merge
  would have reintroduced them. **If you rewrite history again, rebase or recreate every
  branch that descends from the rewritten range in the same operation.**
- Its Stage 1 adds ~6 rows to `readDescriptors.ts`. That file has **no count pin**; only the
  handler-map pins move.
- **Ping before wholesale edits to `.rptc/backlog/README.md`** — both sessions write it.
- **Do not delete `getWorkspaceCredential`.** `dead-code-scan` will surface it as an unused
  export with zero callers. It is pre-positioned, not cruft: the pending
  `appbuilder-deployable-model` D2 track A plan names it as the pattern to mirror for five new
  passthroughs, and that plan's Risks section says it stays cache-bound.

---

## What shipped this session

| Commit | What |
|---|---|
| `dda7dd93` | Data Installer live-API probe writeup (redacted; see above) |
| `21838aea` | Backlog: `export_project_settings` ignores `includeSecrets` |
| `8f3df26f` | gitignore vendor doc exports |
| `a4b4e414` | Four off-scale font sizes → `font-size-75` token; scoped override deleted |
| `e9275329` | Commerce store scope single-sourced (write narrowing + load migration) |
| `e2e49c58` | Backlog: project-level facts stored per-component |
| `8f43b206` | Test pins for `a4b4e414` — see "a commit that didn't stand alone" |
| `63b76b63` | `diagnose-demo` skill + AGENTS.md pointer, `AI_CONTEXT_VERSION` 7 |
| `ea22ed5b` | Redaction pass 1 + prevention rules |
| `5fe11b01` | Handoff rewrite (superseded by this one) |
| `ac86c45b` | Redaction pass 2 — the tenant ids (authored by the peer session) |
| `12f4b802` | `includeSecrets` actually removes secrets |

Earlier the same day, previous session: `get_store_structure` MCP tool, `who_created` write
removal, `pickSampleSku` served-config sampling (`7ab129a2`).

### `AI_CONTEXT_VERSION` is now 7 — every existing project will prompt to regenerate

Intended (the new `diagnose-demo` skill only reaches projects that regenerate), but `.127` did
the same thing and it generated support questions. **Put it in the release notes.**

### Four findings worth keeping

**`who_created` was NOT dead weight, in the direction that mattered.** The old handoff called
it cosmetic. The READ side gates project deletion (`projectOwnership.ts:104` compares it to the
token's IMS user id), and there were **three** write sites, not two. Removing the writes is
safe — the gate only reads Adobe's response. Still unverified: whether Adobe actually
overwrites the value. One glance at `who_created` on a freshly created project settles it.

**The duplicated-scope item was unimplementable as written.** "A migration dropping the
duplicate copies would dissolve the bug class" — a migration alone dissolves nothing, because
the duplicates are re-created on every Configure save. The fix needed a write-side change
first (`resolveWriteTargets`), then the migration.

**`citisignal-b2b` appearing twice is NOT a bug** — closed. Those are `codePatchSource.path`
entries pointing at the patch **ledger** in `eds-demo-patches`, kept deliberately when the
hybrid plan repointed CitiSignal onto the B2B base. `custom` uses the sibling `b2b` ledger the
same way.

**`type: 'password'` is not a secret definition in this codebase.** Of 28 catalog env vars,
exactly ONE is typed `password`; all three API keys are typed `text`, because `type` drives
field RENDERING, not sensitivity. A filter on it would have stripped the admin password and
still shipped three API keys in a file stamped `includesSecrets: false` — a bug that reads as
fixed. Hence the explicit `SECRET_ENV_KEYS` list in `envVarKeys.ts`.

### A commit that didn't stand alone

`a4b4e414` (the CSS change) removed rules that two tests in `destinationRowType.test.ts`
pinned, so it is red in isolation; `8f43b206` fixes it. Cause: the CSS change was checked with
lint and `tsc` but not jest, because CSS "usually has no tests" — this project tests CSS rules.
**Run jest for CSS changes.**

---

## Open bug: GitHub blocks a storefront write — MECHANISM known, TRIGGER not

> **2026-08-12 — the reporter is UNBLOCKED, and the trigger is still unknown.** On
> `v1.0.0-beta.128` they re-ran Storefront Setup against the same repo and it succeeded.
> **`.128` cannot be the reason.** The whole `.127..128` write-path diff
> (`githubFileOperations.ts`, `storefrontSyncService.ts`) is error text, debug logging and
> reformatting — same bytes, same endpoints — so nothing shipped changed what gets pushed.
> Something on their side changed between the failure and the success.
>
> **Leading hypothesis, unfalsifiable from here:** the CLI probe commands they were given
> pushed the storefront content by hand and succeeded, so the extension's later write had
> no new content for push protection to scan. Testing that needs their account, not this
> machine — do not present it as the cause.
>
> **The one experiment that would still close this** is a run against a **brand-new empty
> repo** on their account (wizard → Storefront → **New**, let the extension create it). A
> failure there is a live reproduction on the only account that has ever shown one, and
> `.128` now logs the file and `token_type`. A success means the original failure was tied
> to state on that one repo. Instructions were sent 2026-08-12; **result not yet in.**
>
> If they never run it, this closes by attrition: `.128` is in every beta user's hands, so
> the next occurrence arrives with the file name and secret type attached.

Reported 2026-08-11 by a colleague (`jogosset`). Storefront Setup dies with GitHub's raw
text — "Repository rule violations found / Secret detected in content" — naming no file.
Reproduced on two of their repos (`brookshires-bgc`, `test`); the reporter had to ask an AI
what the error meant.

**What was established** (traced through code + their full log):

- The rejected call is the **`fstab.yaml` Contents API PUT**. Phase 1 ends at the LKG pin;
  Phase 2's first action is that push; its success line is absent; it is the only post-reset
  Contents PUT **not** wrapped in a catch, which is why setup aborts there. `pushed_at` on
  their repo equals the tree push exactly — nothing after it landed.
- The 3345-file template push **succeeds** (Git Data API) moments earlier.
- `fstab.yaml` is two lines (`mountpoints:` + a `content.da.live/<org>/<site>/` URL). It
  contains nothing a scanner would flag. **That contradiction is still unexplained.**

**The mechanism is now REPRODUCED and understood. The trigger is not.**

Reproduced on a throwaway public repo 2026-08-11: writing content containing a detectable
secret (a synthetic Slack webhook URL) through the Contents API returns the reporter's error
byte for byte — `Repository rule violations found` / `Secret detected in content`. So this is
**secret scanning push protection**, surfaced through the repository-rules engine, which is
why it speaks in ruleset language. An earlier draft of this section called it a separate
repository ruleset; that was wrong.

**Experiments run — do not repeat them:**

| Experiment | Result |
|---|---|
| Innocent Contents write to `skukla/demo-builder-test` (public, same template content) | **Accepted** |
| Fake `ghp_` token via Contents API | **Accepted** — GitHub PATs carry a checksum; random strings fail it |
| Real generated RSA private key via Contents API | **Accepted** |
| Slack webhook / Slack bot token / `sk_live_` via Contents API | **BLOCKED** — these are reliably detectable |
| Same Slack webhook via `POST /git/blobs` AND `POST /git/trees` | **BLOCKED** on both |
| **Fork of the b2b template (all 3345 files), then write `fstab.yaml` exactly as the extension does** | **Accepted** |
| Scan of `jogosset/test` current tip (public) for every pattern GitHub actually blocks | **Nothing found** |
| Scans of `boilerplate-b2b-template@041462d` and `eds-demo-patches@main` | **Nothing found** |

**Two theories killed by those results.** The Git Data API does NOT escape push protection —
`/git/trees` rejects the same content with the same message, so the extension's template push
is scanned like any other write and nothing in this codebase routes around scanning. And the
template content is not the trigger: a full-template repo accepts the `fstab.yaml` write.

**What is left.** Every variable reachable from this machine produces success. The remaining
difference is the reporter's ACCOUNT. The most likely candidate is the per-user setting
**"Push protection for yourself"** (github.com/settings/security_analysis), which applies to
every repo that user writes to regardless of repo settings and is not exposed through the API
— not even for your own account. `jogosset` is a plain personal account, NOT an Enterprise
Managed User (no `_shortcode` suffix), so enterprise custom patterns should not apply; that
theory is also dead.

**What shipped** (`69047776`, `b0455aac`, `466bf140`): the write paths name the blocked file,
and the full response body is sanitized, capped and logged. `466bf140` matters most — the
first version read `data.errors[]`, which GitHub does NOT populate for push protection. The
useful fields live in `metadata.secret_scanning.bypass_placeholders[]`:

```
{ "placeholder_id": "...", "token_type": "SLACK_WEBHOOK" }
```

`token_type` names the secret; `placeholder_id` is what the "Create a push protection bypass"
endpoint requires. Both are logged now. Also fixed: the CLI-git path matched
`/non-fast-forward|rejected/i` against GitHub's `! [remote rejected] … (push declined due to
repository rule violations)` and advised "pull and rebase, then retry" — which can never
clear a ruleset rejection and loops the user.

**What was asked of the reporter, and what came back:**

| Asked | Result |
|---|---|
| Is **"Push protection for yourself"** enabled at github.com/settings/security_analysis? | **Never answered.** (The screenshot in that exchange was the maintainer's OWN account — enabled — not theirs. Do not read it as their setting.) |
| CLI push probe: `git clone … && echo x >> README.md && git commit -am probe && git push` | **Succeeded.** Verbose CLI output would have named the secret, file, line and unblock URL — but there was nothing to name. |
| Retry Storefront Setup on `.128` and send Debug Logs | **Retry succeeded; logs never sent.** No `[GitHub] GitHub rejection detail:` block exists, because nothing was rejected. |

So the two most informative probes both came back green, which is itself the finding: by
the time anyone measured, the block was gone. Nothing was captured from the failing state.

**Known gap, deliberately not fixed:** every Contents write after `fstab.yaml` —
`delayed.js`, `head.html`, `404.html`, `scripts.js`, `quick-edit.js`, block code patches —
is wrapped in a catch and only warns. If `fstab.yaml` were made non-fatal or moved to the
Git Data API, setup would report success while silently shipping a storefront with no
smart-404 handler, no Quick Edit and no code patches. **Do not "fix" it that way.**

---

## Read this before trusting any claim in this file

**The recurring failure this session was verifying a list you authored instead of scanning for
what you did not think of.** Four instances, all caught by running or tracing rather than
grepping:

| Wrong claim | Why the check missed it | Caught by |
|---|---|---|
| "no count pin on `edsHandlers`" | the pin keys on `types`, not `edsHandlers` | running the suite |
| "the CSS change is complete" | lint + tsc pass; the tests are in jest | running the suite |
| "a second writer causes the scope drift" | there is none; it's the fan-out TARGET SET | tracing all writers |
| **"the redaction is clean"** | scanned for 6 known strings, not for identifier shapes | a peer re-reading it |

The rule: **a grep can support a positive claim; only running or exhaustively tracing supports
a negative one.** "Nothing pins this", "nothing else writes that", "nothing sensitive remains"
are the three shapes that keep being wrong.

---

## Outstanding

**Needs a Dev Host or a live backend — cannot be done by an agent:**

- **`mesh-staleness-scope` step 05 — still never run.** Its own text says "cannot be done by
  tests." Flip `componentConfigs` key order in a manifest and confirm the staleness verdict is
  order-independent. `demo-builder-test` still carries the disagreement — do not clean it up
  before testing.
- **`hybrid-storefront-model` — unblocked, gated on live verification.** The `citisignal-b2b`
  ambiguity that parked it is resolved. What remains is the step-02 gate: individual-vs-company
  login against a real B2B backend.
- **Two visual checks nothing here can reach.** Whether the four font-size changes read
  correctly on the integrations surface, and whether an agent actually reaches for
  `diagnose-demo` when handed a vague symptom rather than editing first.

**Real work, not started:**

- **`appbuilder-deployable-model` D2–D6.** Only D1 is built. Track A is what pre-positions
  `getWorkspaceCredential` — see the coordination note above.

**Unresolved, not reproducing:**

- **Four suites flake under parallel load** (`extension-context`, both `inExtensionMcpServer`
  suites, `mcpConfigWriter`). Did NOT recur in any run this session, including three full passes.

**Known gap, no gate:**

- **`SECRET_ENV_KEYS` is a list with a doc comment, not an enforced contract.** A new Commerce
  credential added to `components.json` ships in a "secret-free" export unless someone
  remembers to list it. A test asserting that every credential-shaped catalog key
  (`/PASSWORD|SECRET|API_KEY|TOKEN|CREDENTIAL/`) appears in `SECRET_ENV_KEYS` would close it,
  and would have caught the three API keys before this session. Proposed by the peer session,
  not yet built. The Data Installer Stage 2 introduces Commerce `client_id`/`client_secret`,
  which makes it timely — though that plan routes both to SecretStorage, so they should never
  reach `componentConfigs`.

**Backlog items filed today (all ready, none blocked):**

- **`2026-08-11-project-level-facts-stored-per-component.md`** — 17 of 25 declared env vars have
  more than one owner in `componentConfigs`; 6 are the scope keys now fixed, 11 unexamined.
  **The file records that its own first draft asked the wrong question**: there is no second
  writer anywhere. The drift mechanism is that Configure's fan-out targets come from
  `selectedComponents`, so a component holding a copy but missing from the selection lists never
  updates. Key-agnostic. Step 1 is reproducing it before any code moves.
- **`2026-08-11-generated-diagnosis-skill.md`** — SHIPPED as `63b76b63`. Move to
  `.rptc/complete/` on the next pass.
- **`2026-08-11-export-settings-ignores-include-secrets.md`** — SHIPPED as `12f4b802`. Move to
  `.rptc/complete/` on the next pass.

**Carried forward, still true:**

- **`pickSampleSku` samples from the served config**, and reports scope divergence as a finding
  only when the project reads `published` yet the CDN serves a different scope — the one case
  `edsStorefrontStatusSummary` structurally cannot detect.
- **`updateField`'s linked-field write** puts the DERIVED key's value on the SOURCE field's
  component list. The sets are a superset today so every declarer is covered, but it also writes
  the key onto `headless`, which does not declare it. Harmless now; wrong by construction.
