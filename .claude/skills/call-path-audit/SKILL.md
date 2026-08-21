---
name: call-path-audit
description: Prove a user action has ONE definitive path — trace every entry point down AND every occurrence of the action's ground-truth primitive up, then pin the verdict in tests/templates/spine-chokepoints.test.ts. Use when checking for localized/parallel implementations of the same job, at release cuts (the sweep worklist below), or after building a feature that performs an effect the app already performs somewhere. Catches the drift class where a working-but-local implementation bypasses the shared spine and only the touched path gets future fixes.
---

# Call-Path Audit — one definitive path per action

The drift this catches: someone builds a fix where they're standing; it works;
but the app already had a way of doing that job — now there are two paths and
only the touched one gets future fixes. Verified history: the dead second
`get-components-data` handler, the unwired second GITHUB_APP_NOT_INSTALLED
reaction, the parallel `appComponentManager` whose death silently broke
component selections, the callerless `_deployMeshComponent` wrapper (found by
this audit's first run, 2026-08-22).

## The method (two halves; the second is the one that matters)

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

3. **Verdict per hit:** spine (the one implementation) · wrapper (calls the
   spine — fine, but three similar wrappers is Rule-of-Three territory) ·
   second path (does the primitive itself — the finding) · dead (no callers —
   delete outright, no soft deprecation).

4. **Pin what passed.** Add a describe block to
   `tests/templates/spine-chokepoints.test.ts` asserting the primitive appears
   ONLY in the spine module, with a positive control (the spine itself must
   register, so a rename can't green the test on empty air). Mutation-check it
   once: plant a stray call, watch it fail, remove it. From then on a new
   localized implementation fails CI the day it's written.

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
| App Builder undeploy | `aio app undeploy` | 1 real (+1 description string) | `app-builder/services/appBuilderComponentRunner.ts` | **PINNED** |
| Mesh delete | `aio api-mesh:delete` | 3 | `mesh/services/meshDeleteCommand.ts` (verdict: three legitimate doors — dashboard delete, cancel-rollback, removal — sharing ONE command constant; the two spellings unified) | **PINNED** |
| Adobe sign-in | `aio auth login`/`aio login` | 2 | `authentication/services/authenticationService.ts` (diagnostics also invokes) | AUDIT |
| Manifest write | `ProjectConfigWriter`/`writeManifest` | 4 | `core/state/projectConfigWriter.ts` (documented single writer; aiBundleActivationRefresh constructs its own instance — DI note, not a second path) | AUDIT (confirm + pin) |
| Helix preview/publish/unpublish | `admin.hlx.page` per-verb | 9 files touch the host | `eds/services/helixApiClient.ts`/`helixService.ts` (others are probes/reads — split by verb) | AUDIT |
| DA.live content + config writes | `admin.da.live` per-verb | 5 | `daLiveContentOperations`/`daLiveConfigService` | AUDIT |
| Config Service site registration | the registration POST | regex too loose (24 name-matches) | `eds/services/siteConfigRegistrar.ts` (documented) | AUDIT (sharpen primitive first) |
| GitHub repo create/reset/delete | repo-mutation API calls | 5 files touch `api.github.com` | `eds/services/githubRepoOperations.ts` (updates/componentInstallation are READS — different actions) | AUDIT |
| Demo start/stop | terminal spawn / process kill | 3 | `lifecycle/commands/startDemo.ts` (baseCommand + openInClaude are different actions) | AUDIT |
| VS Code settings writes | `getConfiguration(...).update(` | 3 | none claimed | AUDIT (small) |
| Secret storage writes | `secrets.store/delete` | 1 direct (wrappers may hide more — sharpen regex) | credential service | AUDIT (sharpen first) |
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

Runs with the other sweeps at release cuts: pick the topmost non-PINNED row,
run the method, pin or file. One row per cut is enough — the pinned rows are
guarded by CI forever, so the sweep only ever shrinks.
