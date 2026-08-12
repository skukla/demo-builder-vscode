# Next session — start here

Rewritten 2026-08-11 (second session that day, after a history rewrite). **Everything is
committed AND PUSHED.** `develop` is level with `origin/develop` at `b0455aac`. Still on
`v1.0.0-beta.127` — no release was cut this session.

> A second session has also been pushing to `develop`. The tip moved between two of this
> session's own pushes, so treat any SHA below as "at time of writing" and check `git log`.

Gate at handoff: **969 suites / 12301 tests**, `tsc --noEmit` clean, whole-repo eslint
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

## Open bug: GitHub blocks a storefront write — cause NOT identified

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

**Three reproduction attempts FAILED — do not repeat them:**

| Attempt | Result |
|---|---|
| Innocent Contents write to `skukla/demo-builder-test` (public, same template content, `secret_scanning_push_protection: enabled`) | **Accepted** |
| Contents write of a fake `ghp_` token to a throwaway public repo | **Accepted** (GitHub PATs carry a checksum; random strings fail it) |
| Contents write of a real generated RSA private key to the same repo | **Accepted** |

Scans of `adobe-commerce/boilerplate-b2b-template@041462d` (3344 files) and
`skukla/eds-demo-patches@main` found **no** high-confidence partner-pattern secret. The
template does carry credential-shaped values (a 35-char `MAGENTO_API_KEY` in
`cypress/src/tests/b2c/verifyAemAssets.spec.js`, 32-char hex keys in the cypress configs),
but those are present in `demo-builder-test` too, which accepts writes fine.

**Conclusion: the block is policy on the reporter's account or Adobe's enterprise** —
custom secret-scanning patterns or an org ruleset — not this codebase and not the template.
Note `gh api repos/jogosset/test/rules/branches/main` returned `[]`, but on a repo you do
not own that may mean "not visible" rather than "none"; do not lean on it.

**What shipped** (`69047776`, `b0455aac`): the write paths now name the blocked file, and
the FULL GitHub response body — status, `x-github-request-id`, `data.message`,
`documentation_url`, every `errors[]` entry — is sanitized, capped, and written to the debug
log. Also fixed: the CLI-git path matched `/non-fast-forward|rejected/i` against GitHub's
`! [remote rejected] … (push declined due to repository rule violations)` and told users to
"pull and rebase, then retry" — advice that can never clear a ruleset rejection and loops
them indefinitely.

**To actually find the cause, cheapest first:**

1. Have the reporter run a CLI `git push` on the repo (`git clone … && echo x >> README.md
   && git commit -am probe && git push`). GitHub's git-side rejection is far more verbose
   than the REST one: it names the secret type, file, line, and an unblock URL.
2. Or have them retry setup on a build containing `b0455aac` and send the Debug Logs.

**To unblock them immediately, independent of diagnosis:** make the repo private (push
protection on private repos needs Advanced Security), or use the unblock link in GitHub's
rejection.

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
