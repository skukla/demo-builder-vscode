# Next session — start here

Rewritten 2026-08-10 (third pass, same day). **Everything is committed AND PUSHED —
`develop` is level with `origin/develop` at `3c8e651f`.**
Gate at handoff: 945 suites / 12100 tests, whole-repo eslint, tsc.

**Streams A and B are both discharged.** Only the release remains.

---

## One stream remains.

| # | Stream | Working directory | Branch |
|---|---|---|---|
| C | Release `.127` | main checkout | `develop` → `master` |

Nothing is outstanding behind it — start whenever.

---

## B. Configure step rail — SHIPPED 2026-08-10, merged to develop

Plan moved to `.rptc/complete/configure-step-rail/`. Landed as six commits on develop;
the worktree has been removed. The Configure screen now renders the wizard's horizontal
`StepRail` with one section on screen at a time.

**What it turned up that was not in the plan:**

- **`componentConfigs` writes were mutating the caller's object.** `{ ...prev }` clones
  one level, and both commerce config surfaces then wrote through into the nested
  per-component object — which on Configure is the `existingEnvValues` PROP. Three sites
  in `useComponentConfig`, one in the new Configure hook. Now one shared immutable writer
  (`features/components/services/componentConfigWrites.ts`). It presented as a test that
  passed alone and failed in sequence; the shared fixture had been rewritten by an
  earlier test.
- **Two of the six deleted Configure hooks were STALE FORKS of live logic**, not merely
  unused: `useFieldValidation` and `useConfigureFields` had lost the default handling and
  the shared-component lookup. Re-extract from the live code, never revive an orphan.
- **`getValidationState` existed three times**, one of them alive only because its own
  test imported it. Now `core/ui/utils/validationState.ts`.

**The two validators stay separate — SETTLED 2026-08-10, do not re-litigate.**
`useComponentConfig`'s validation and Configure's `validateServiceGroups` look like one
job. On inspection only ONE of the four apparent divergences was real:

| Divergence | Verdict |
|---|---|
| MESH_ENDPOINT: wizard filters upstream, Configure defers in the check | Same outcome, different mechanism |
| Defaults: wizard pre-writes them, Configure accepts them in the check | Same outcome, different mechanism |
| Configure also sweeps NON-declaring components | Real — Configure needs it (`.env` values can sit under another component id); the wizard does not |
| Wizard used a bare truthiness check | The only defect — **fixed**, see below |

So convergence would have meant giving the wizard a lookup it does not need, to erase a
fork that was one flaw wide. The flaw was fixed on its own instead: the wizard now uses
the shared `findFieldValue`, so a required field holding `false` or `0` reads as PRESENT
rather than "required but missing" — an error the user could not clear, because the
checkbox IS ticked. It was unreachable (no env var declares a boolean) but armed:
`ConfigFieldRenderer` has a live `case 'boolean'` that writes real booleans. Pinned by
`useComponentConfig-validation.test.ts`, whose two failing cases each have a passing
control beside them.

**The one thing that could still be wrong:** the Dev Host pass (step 05) was never
confirmed by either of us. The build is verified — the rail is in
`dist/webview/configure-bundle.js`, the old sidebar CSS is gone, and both CSS tokens
landed on `.container-configure` — but nobody checked the rail's padding, the new 960px
content cap, or the sub-1180px behaviour on screen. Branch `feature/configure-step-rail`
is kept for that reason; `git reset --hard ca559eca` on develop reverts the lot.

Also carried over: Configure's content is now capped at the canonical 960px band. Losing
the 300px sidebar freed that width and it would otherwise all have gone into field width.

---

## C. Release `.127`

**No longer blocked** — the feature it was waiting on (stream B) has landed.

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

- ~~**`demo-builder-test` mesh still runs on `base`.**~~ **RESOLVED 2026-08-10** — mesh
  redeployed; `.env`, the recorded snapshot and the flattened configs all read
  `citisignal_*` and the "Update available" badge cleared.
  **The note that came with it was wrong and is worth correcting**: it said `deploy_mesh`
  does not regenerate the `.env`, "only a Configure save does". Both mesh deploy paths DO
  regenerate it — `appBuilderComponentRunner.ts:330` (`writeComponentEnv`, aborts on
  failure) and `deployMeshHeadless.ts:162` (best-effort, warns and continues). The
  best-effort arm is the plausible seed of the original observation: a silent regeneration
  failure there leaves a stale `.env` and the deploy proceeds anyway.
  **Still true after the fix:** `componentConfigs['eds-accs-mesh']` STILL holds the stale
  `base`/`main_website_store`/`default` copy. Nothing authoritative reads it, but it is
  live ammunition for the staleness order-dependence below.
- **Missing `get_store_structure` MCP tool** — PDP handoff §3, flagged as the
  highest-value gap. An agent debugging PDP failures cannot see that a project points at a
  Commerce website with no products. That cost most of an afternoon.
- **Duplicated Commerce scope still in existing manifests.** Confirmed still present on
  `demo-builder-test` after the 2026-08-10 mesh fix. TWO resolvers consult
  `BACKEND_OWNED_SCOPE_KEYS`; a **third** — the mesh staleness detector — does not, and
  its verdict therefore turns on manifest key order. **Now an ACTIVE plan**:
  [`mesh-staleness-scope/`](mesh-staleness-scope/) — four steps, promoted 2026-08-10. Step 01
  (the correctness fix) ships value alone; steps 02–03 add the deployed-vs-configured diff
  to the mesh flyout, which is why they are folded in rather than filed separately.
  A migration that drops the duplicate copies would dissolve the whole bug class; the
  scope-key rule is the interim. PDP handoff §2.
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
