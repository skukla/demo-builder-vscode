---
name: call-path-audit
description: Prove a user action has ONE definitive path — trace every entry point down AND every occurrence of the action's ground-truth primitive up, audit the ENTRY-POINT layer (the functions handlers, commands and MCP tools call into the spine through), then pin both in tests/templates/spine-chokepoints.test.ts. Use when checking for localized/parallel implementations of the same job, at release cuts (the sweep worklist below), or after building a feature that performs an effect the app already performs somewhere. Catches the drift class where a working-but-local implementation bypasses the shared spine and only the touched path gets future fixes.
---

# Call-Path Audit — one definitive path per action

The drift this catches: someone builds a fix where they're standing; it works;
but the app already had a way of doing that job — now there are two paths and
only the touched one gets future fixes. Verified history: the dead second
`get-components-data` handler, the unwired second GITHUB_APP_NOT_INSTALLED
reaction, the parallel `appComponentManager` whose death silently broke
component selections, the callerless `_deployMeshComponent` wrapper (found by
this audit's first run, 2026-08-22).

## The method (three layers; pin the primitive AND the entry points)

1. **Trace down from the doors.** List every entry point for the action —
   command registrations (`commandManager.ts`), webview handler maps, MCP
   descriptors (`actionDescriptors.ts`/`statusDescriptors.ts`), UI buttons —
   and follow each to the function that does the work. This confirms the doors
   you know about converge.

2. **Trace up from the ground truth.** Identify the PRIMITIVE that *is* the
   action — the literal shell command, API endpoint, or state write. Find every
   occurrence in `src/`. Doors you never knew existed cannot hide from this
   half: if the primitive appears outside the spine, there is a second path,
   whoever built it and whyever it worked.

   ```bash
   grep -rn "<primitive>" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
   ```

   Then READ each hit — counts nominate, reading decides. **False-positive
   classes measured 2026-08-22:** comment lines; string literals in MCP tool
   *descriptions* (`actionDescriptors.ts` names commands it never runs); doc
   text generated into user projects (`agentsMdSections.ts`); field names that
   merely mention the primitive (`skipNpmInstall`).

3. **Audit the entry-point layer.** A pinned primitive is not enough. Between
   the doors (handlers, commands, MCP tools) and the spine sits the layer of
   functions that CALL INTO the spine, and that layer drifts too: each door
   grows its own caller and re-decides the mode and the after-steps. List every
   file outside the spine's own directory that calls the spine's public entry
   (for Adobe sign-in: `.login(` and `.loginAndRestoreProjectContext(`), and
   for each ask: does it decide a MODE (forced or not, a notice or not) or add
   POLICY (asking first, retrying, a refresh) the spine or a shared door should
   own? **Modes are parameters of the one path; a door may not re-decide a mode
   or add policy the spine should own.** The target is a short list of named
   entry points, each with one job, that every door calls.

4. **Verdict per hit:** spine (the one implementation) · entry point (a named
   door function the others call; few, each one job) · wrapper (calls the
   spine — fine, but three similar wrappers is Rule-of-Three territory) ·
   second path (does the primitive itself, or re-decides a mode at a door —
   the finding) · dead (no callers — delete outright, no soft deprecation).

5. **Pin what passed — both layers.** Add describe blocks to
   `tests/templates/spine-chokepoints.test.ts`: one asserting the primitive
   appears ONLY in the spine module, and one asserting that outside the spine's
   directory only the named entry points call the spine's public entry. Each
   carries a positive control (every allowed file must register, so a rename
   can't green the test on empty air) and, where the pattern allows, a planted
   self-test (`hasCodeHit` on a planted line and on a comment). Mutation-check
   it once: plant a stray call, watch it fail, remove it. From then on a new
   localized implementation fails CI the day it's written.

### Worked example: Adobe sign-in (2026-11-18)

The primitive pin (`aio auth login` only in `adobeSignIn.ts`) had held since
2026-08-22, and above it seven callers had each grown their own sign-in: the
dashboard's `reAuthenticate` forced it (a workaround the shared sign-in now
owns, `RejectedTokens`), the palette command opened its own progress, the
mesh step signed in without asking, the agent tool collected its own notices,
and the wizard called `login(force)` directly. They became three entry points:

| Entry point | Job | Who calls it |
|---|---|---|
| `ensureAdobeIOAuth` (`core/auth/adobeAuthGuard.ts`) | a flow needs a sign-in partway: ask in a VS Code dialog, then sign in | ~15 flows, now including the creation mesh step |
| `signInToAdobe` (`authentication/handlers/signInToAdobe.ts`) | someone pressed Sign In, or an agent asked; the caller (`'person'` or `'agent'`) is the only mode | the `authenticate` handler (every screen), the Sign In command, the `sign_in` tool, the dashboard's expired-sign-in prompt |
| `handleForcedOrgSwitch` / `signInThroughOrgChooser` (`authentication/handlers/orgSwitchHandler.ts`) | the org switch, the only forced sign-in | `switchOrg`, the wizard's Switch IMS Org, the command's "Sign In Again" over a good session |

The pin is "adobe SIGN-IN entry points" in `spine-chokepoints.test.ts`. Its
first run, before the doors moved, named exactly the drifted callers.

Not every primitive belongs to one spine. `npm install` and `git clone`
legitimately serve unrelated jobs (component deps, tool installs, AI defaults,
updates); the audit unit is the user ACTION, not the raw command. Don't pin a
primitive whose multiple sites are different actions.

## The sweep worklist (census 2026-08-22 — counts are CODE files, comments excluded)

Statuses: **PINNED** (audited, choke-point test in place) · **READY** (one
code site measured; verify it's the intended spine, then pin) · **AUDIT**
(multiple sites; run the full method) · **NOT A SPINE** (legitimately
multi-site; skip).

| Action | Primitive | Sites | Suspected spine | Status |
|---|---|---|---|---|
| Mesh deploy | `aio api-mesh:create/update` | 1 | `mesh/services/meshDeployment.ts` | **PINNED** (6 doors verified) |
| App Builder deploy | `aio app deploy` | 1 | `app-builder/services/appDeployment.ts` | **PINNED** |
| App Builder undeploy | `aio app undeploy` | 1 real (+1 description string) | `app-builder/services/appBuilderComponentTeardown.ts` | **PINNED** |
| Mesh delete | `aio api-mesh:delete` | 3 | `mesh/services/meshDeleteCommand.ts` (verdict: three legitimate doors — dashboard delete, cancel-rollback, removal — sharing ONE command constant; the two spellings unified) | **PINNED** |
| Adobe sign-in/out | `aio auth login/logout` | 1 each | login in `authentication/services/adobeSignIn.ts` (run only by the service's sign-in gate; moved there unchanged 2026-10-08), logout in `authentication/services/authenticationService.ts` (diagnostics' hit is a `--help` capability probe — a read) | **PINNED** |
| Adobe sign-in ENTRY POINTS | `.login(` / `.loginAndRestoreProjectContext(` outside `authentication/services/` | 3 (was 7) | the guard, `signInToAdobe`, `orgSwitchHandler` — see the worked example above (2026-11-18) | **PINNED** |
| Manifest write | names `.demo-builder.json` AND writes | 2 | `core/state/projectConfigWriter.ts` + `mcp-server.ts` (verdict: TWO doors by design — state serializer vs agent byte-writer; the agent door now refuses malformed JSON + reports schema warnings) | **PINNED** |
| Helix URLs + credentials | partition template + host literal | 1 | **CONSOLIDATED 2026-08-22** — client owns buildPartitionUrl/buildPublishHeaders/buildDeleteHeaders/normalizeWebPath; service delegates; missing publish `Authorization` fixed test-first (MCP failed on admin-protected sites). Item archived to `../complete/` | **PINNED (one engine)** |
| DA.live host + transport | `admin.da.live` literal | 1 (was 5) | `daLiveConstants` — host now single-sourced + pinned. Transport verdict: **CONSOLIDATED 2026-08-22** — every DA.live admin write rides the client (body factories, 429-return); orgOperations' private retry copy deleted; documented raw exceptions (CDN, bulk copy, probe). Item archived to `../complete/` | **PINNED (host + transport)** |
| Config Service paths | `/config/${org}/…` builders | 3 | three role owners — configurationService (site object CRUD, sent through configServiceRequest, which builds no path; registrar wraps its retry protocol), configServiceAccess (grants), configServiceProbe (read-only diagnostics). Probe/access verified GET-only on the site object | **PINNED** |
| GitHub mutations | `octokit.request('POST/DELETE/PATCH/PUT …')` | 3 | clean split — githubRepoLifecycle (repo-level: create, Actions off, template flag, delete, archive; githubRepoOperations keeps only reads since the 2026-10-08 EDS-8 split), githubFileOperations (content), githubTreeCommits (tree/commit/ref; the reset in githubRepoArchive drives it and makes no request of its own). The four raw-fetch api.github.com users verified read-only | **PINNED** |
| Demo lifecycle | `window.createTerminal` / kill primitives | 1 / 2 | ONE terminal factory (baseCommand.createTerminal); kills split by role — processCleanup (demo teardown) + commandExecutor (own child on timeout). No direct child_process.spawn anywhere | **PINNED** |
| VS Code settings writes | `getConfiguration(...).update(` | 4 files | four single-sited actions (zoom, save-defaults, legacy cleanup, channel switch); verdict: no spine, pin guards the NEGATIVE — MCP/AI tool code never writes settings | **PINNED** |
| Secret storage writes | `secret*.store/delete(` | 4 | four owner modules, one key family each (helixKeyStore, githubTokenService, componentSettingSecrets, declaredSecretStore — the data-installer routes through the migration) | **PINNED** |
| Category pages + catalog menu (EDS-24) | `applyCatalogMenu(` / `removeCatalogMenu(` | 1 | `eds/services/catalogMenu/catalogMenuStep.ts`, reached only from creation (`catalogMenuPhase`), reset (`edsResetCatalogMenu`), republish (`storefrontContentRepublishService`) and a store change (`storeScopePages`, EDS-44); the button and its two agent tools were deleted 2026-10-05 | **PINNED** |
| Pages after a store change (EDS-44) | `replaceStoreScopePages(` | 1 | `eds/services/storefront/storeScopePages.ts`, reached from Configure's Republish (`configureStorefrontRepublish`) and `republishStorefrontContent` (dashboard Republish and the agent's `republish`, EDS-63) | **PINNED** |
| Dependency install | `npm install` | 6 | — | NOT A SPINE (different actions) |
| Repo clone | `git clone` | ~5 real | — | NOT A SPINE (different actions) |

When a sweep row completes: update its Status here, add the pin block, and if
the audit found a second path or a dead wrapper, fix it in the same slice
(verified + in reach = fix now) or file it with a fix-or-defer question.

## When NOT to use

- Duplicate UI markup / copy-paste logic — that's `component-extraction-scan`
  / `code-duplication-scan`. This skill is about one ACTION with two engines,
  not two copies of code.
- Competing same-job architectures already visible without tracing — that's
  `architecture-duplication-scan`; this skill is its mechanical, per-action
  half and feeds it candidates.

## Release-cut anchor

**Every PINNED row above audited the primitive; only Adobe sign-in has had its
entry-point layer audited (2026-11-18).** At a release cut, run step 3 on the
next row: the primitive staying in one file says nothing about how many doors
re-decide its mode above it.

**The 2026-08-22 full campaign pinned every auditable row** — 13 pin blocks in
`spine-chokepoints.test.ts`, two consolidations filed (Helix two-engines,
DA.live client bypass), two rows excluded by design. From here the skill's job
is incremental: when a NEW action gains a ground-truth primitive, audit and
pin it in the same slice; at release cuts, re-read the two filed
consolidations and check the NOT-A-SPINE exclusions still hold.
