# Next session — start here

Rewritten 2026-08-12, header refreshed 2026-08-13. **Everything is committed AND PUSHED**;
`develop` was at `81c13451` when this line was written. `v1.0.0-beta.128` is released.

Gate at handoff: **993 suites / 12,721 tests**, `tsc --noEmit` clean, whole-repo eslint
0 errors 0 warnings.

> A second session works `feature/data-installer` in a sibling worktree. It ceded control of
> `develop` and pushes only its own branch; if something of theirs needs landing they will
> name the branch and range. Its Stage 1 (14 commits) and two doc corrections are already on
> `develop`.

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

## What shipped this session

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

That last one has a second lesson. The first response was to patch the count by hand and
write a note — but every LIST behind the number still came from the broken parse. **A derived
number corrected without regenerating its data is a coincidence you have not checked.** The
re-run happened to agree; that could not have been known in advance.

Rule: a grep can support a positive claim; only running or exhaustively tracing supports a
negative one. And pair every "nothing found" with a positive control at the same scope.

---

## Outstanding

**Shipped since this file was written:**

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
- **`backlog/integrations-host-contract`** — `showIntegrations.ts` still hand-lists the wizard
  handlers it reuses (19 references), so the contract drifts whenever the flow grows and the
  guard tests only catch it after someone writes failing code. Verified still true 2026-08-13.

**Unresolved, NOW REPRODUCING — backlogged 2026-08-13:**

- **~3 suites flake per full run, a different set each time.** This line used to read "did
  not recur in any full run today"; it recurred twice in consecutive runs on 2026-08-13,
  and the set is wider than the four originally named — `executor-appBuilderComponentLoading`
  and `processCleanup.timeout` joined it. All are **timeouts, not assertion failures**; one
  is a wall-clock assertion that measured 12,793 ms against a 2,000 ms bound. Every affected
  suite passes in isolation, verified by stashing to rule the working tree out.
  **So every "full suite green" in this repo is one sample of a noisy process** — including
  the ones quoted in today's handoffs. Evidence, suspects and a measure-first plan:
  `.rptc/backlog/2026-08-13-jest-full-suite-timeout-flake.md`.

**Known gap, no gate:**

- **`SECRET_ENV_KEYS` is a list with a doc comment, not an enforced contract** — though a
  catalog-shaped guard test now exists (`d82aea62`). Re-check whether it closes the hole
  before rebuilding it.

**Backlog filed, still open:**

- `2026-08-11-project-level-facts-stored-per-component.md` — 11 multi-owner keys unexamined.
  Key-agnostic; step 1 is reproducing the drift before any code moves.
