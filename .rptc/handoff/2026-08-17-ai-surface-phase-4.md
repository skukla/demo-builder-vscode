# Handoff — AI surface, phase 4 (Groups 1–8 shipped)

**Branch:** `feature/ai-surface-coverage` (worktree of the same name)
**State:** **103 tools** · full suite 14,318 / 1,084 suites green · tsc, typecheck:tests, eslint clean
(2 eslint warnings, both from develop's bodea line, neither in AI-surface code)
**Plan:** `.rptc/plans/ai-surface/phase-4-step-02-full-parity-plan.md` — carries every decision;
this file carries only what a fresh session needs that the plan does not say.

## What shipped (20 commits, 2026-08-17)

| Group | Tools |
|---|---|
| **1 — diagnosis** ✅ | `get_project_status` · `check_prerequisites` · `check_github_app` · `check_repo_readiness` · `discover_store_structure` · `get_component_requirements` · `validate_component_selection` · `get_auth_status` (enriched) |
| **2 — cloud resources** ✅ | `create_github_repo` · `create_adobe_project` · `create_adobe_workspace` · `delete_adobe_project` |
| **3 — configuration** ✅ | `configure_project` |
| **4 — integrations** ✅ | `add_integration` (Wave 3, + the panel-branch defect it was blocked on) · `rename_integration` · `set_console_apis` · `set_project_destination` |
| **5 — lifecycle** ✅ | `set_current_project` · `restart_demo` · `set_project_pinned` · `open_url` · `edit_project` (handoff). **Three deliberately NOT built — see below.** |
| **6 — EDS / storefront** ✅ | `get_site_access` · `set_site_admin` · `repair_site_configuration` · `connect_dalive` (handoff), all in `siteTools.ts`, preceded by the `repairSiteConfigForProject` extraction. All four probed live, ceilings recorded, no defects. `migrate_storefront_names` outstanding; `github_change_account` blocked; bulk pair deliberately not built. |

Every Group 1–3 row was measured live and given a ceiling in
`tests/features/ai/server/responseCeilings.ts`. `add_integration` was NOT — see its note below.

> **Correction (2026-08-17).** An earlier version of this table labelled `configure_project`
> "Group 4 — configuration" and showed it complete. In the plan, configuration is **Group 3**;
> **Group 4 is Integrations**, and three of its four tools are unbuilt. As written, the next
> session would have read Group 4 as finished and skipped them.

**The tool count is MEASURED, not derived.** 103 = 57 bespoke registrations + 46 descriptor rows
(12 read + 4 status + 22 action + 8 data-installer), cross-checked against `info`'s own 103,
no overlap, enumerated from the `registerTool(` call sites in `src/features/ai/server/` and
`src/mcp-server.ts`. An earlier header's 77 was carried forward by hand; it happened to be right,
which is not the same as having been checked.

**Re-run the greps rather than adding to the number.** This paragraph has now been wrong twice,
both times by someone updating the total and leaving the breakdown alone — most recently
"103 = 53 + 50", where neither figure was measured and only the total was. Two traps make the
raw counts untrustworthy in opposite directions:

- A raw `grep -c "server.registerTool("` reads **60**, not 57. THREE hits are not tools:
  `toolDescriptors.ts`'s generic registrar, `inExtensionMcpServer.ts`'s `withToolLogging`
  wrapper, and a doc comment in `mcp-server.ts`. (Writing this rule, I first put "59, two
  hits" — from memory — and the count disagreed. Enumerate the NAMES on the following line
  and `sort -u` them; do not subtract from memory.)
- The descriptor total must include EVERY array `extension.ts` spreads. There are four now.

The cheapest honest check is `probe.mjs info`, which reports the count the SERVER registered —
independent of any grep, and the thing the greps are trying to predict.

## Group 4 — the last three (2026-08-17)

- **`rename_integration`** — display name only. `name` is REQUIRED **as a headless-safety
  guard, not a convenience**: `resolveRenameName` falls through to
  `vscode.window.showInputBox` when the payload carries none, so an optional field would hang
  an agent's call on a dialog nobody is watching. The handler now returns
  `{renamed: {id, name}}` — the TRIMMED name, which is not what the caller sent.
- **`set_console_apis`** — CONFIRM-GATED, and it is the case the `delete_*` naming rule
  structurally cannot catch: it says "set" and it removes. A short list unsubscribes codes from
  the live workspace credential. `add_console_apis` stays ungated because it is add-only.
- **`set_project_destination`** — UNGATED, deliberately. The move only ever DEPLOYS (nothing is
  undeployed from the old target) and is undone by setting the destination back; the UI's
  confirmation modal was removed for that same reason (user decision 2026-08-07), and gating
  here would reinstate it for agents alone. It does not create the target — `create_adobe_project`
  / `create_adobe_workspace` already exist, so the plan's "can also create them" is served by a
  second call rather than a wider tool.

All three dispatch to handlers that already returned real data, so only `rename_integration`
needed a response fix. Each assertion was falsified before being trusted: making `name` optional,
dropping the confirm flag, and restoring the bare rename success each failed exactly the test
written for it (4 failures, no others).

**Probed live 2026-08-17** — all four run correctly against a real Adobe org. Their ceiling-table
EXEMPT entries still rest on the SHAPE argument rather than a recorded measurement, which the
probe supports: the responses were 51–95 bytes.

## Wave 3 — DONE (`9d52a5de`, pushed)

`add_integration`'s panel branch, plus the tool itself. Three parts:

- **The handler** (`appBuilderComponentHandlers.ts`) no longer answers `{success: true}` for
  opening Configure and adding nothing. It returns `blocked` naming the missing vars — the same
  shape a guard refusal uses, so no error row is painted for work that never ran. Its SUCCESS
  path also stopped being bare: it returns `{added: {id, name, kind}}`, because `defaultShape`
  renders a bare success as the literal `"{}"` and the id is what the agent needs next (for a
  custom source it never supplied one).
- **`add_integration`** joined `ACTION_DESCRIPTORS` — catalog `id` OR custom `source`, plus
  `name`/`instanceId`/`apis`. Ungated, like `deploy_integration`.
- **Its `preflight`** returns the `needsUser` handoff, so the agent path never opens a panel in
  the user's editor for a call they did not make. Resolution and classification come from two
  new exports on the handler (`resolveAddEntry`, `userSuppliedEnvVars`) rather than a second
  copy of the rule — otherwise the tool would dispatch, the handler would refuse, and the panel
  the preflight exists to suppress would open anyway.

`HandoffReason` gained `'config-entry'`: a bucket-3 component can declare plain-text vars, and
calling a base URL a secret trains an agent to treat ordinary config as dangerous.

**MEASURED, and it changes what this fix is worth: no entry in the shipped catalog declares a
user-supplied env var.** All 5 ids across all 4 stacks (`headless-commerce-mesh`,
`eds-commerce-mesh`, `eds-accs-mesh`, `app-builder-shell`) plus a custom GitHub source come back
with empty `userText`/`userSecret`. So the bucket-3 branch cannot fire today — it is the guard
that has to exist before the first such component is authored, not a live bug being fixed. The
live half of Wave 3 is the bare-success success path, which every add hits.
`actionDescriptors.test.ts` pins the catalog's current state so the day someone authors an
`ERP_API_KEY`-style entry, it fails and points at the tool that now has a handoff to return.

An earlier `handoff.ts` paragraph blamed a GUARD failure for the defect; guards already returned
`blocked`. Corrected there.

Gate: 1070 suites / 14,083 tests (baseline 1069 / 14,070), tsc + typecheck:tests + whole-repo
eslint clean. Each new assertion was falsified by re-introducing the defect before being trusted.

## Group 5 — five built, three refused (2026-08-17)

Built: `set_current_project` (named around the `select_project` collision — that one is the
Adobe Console selector), `restart_demo`, `set_project_pinned` as descriptor rows, plus a new
`lifecycleTools.ts` holding two the row shape cannot express.

**`open_url` takes a TARGET, never a URL.** `open_url(url)` would let an agent point the user's
browser anywhere, and no validation makes that safe — the danger is a well-formed URL nobody
asked for. The argument names WHICH of the project's URLs to open (`storefront` · `liveSite` ·
`daLive` · `commerceAdmin` · `devConsole`) and the extension resolves it through the SAME
`getProjectUrls` handler `get_project_urls` uses, so the reachable set is exactly what that read
reports and a target cannot mean two things. A test pins the enum against the handler's own
`urls.X =` assignments, so the two cannot drift.

**`edit_project` never dispatches** — it is always a handoff. The wizard is a multi-step human
surface; the handoff points at it AND at `configure_project`, because most "edit my project"
asks are env vars or store scope, which need no wizard.

**`set_current_project` forces `forceNewWindow: false` via `argDefaults`.** That flag is the
shift-click gesture: it opens a SECOND VS Code window and leaves the current one on the projects
list, so an agent could take over the screen and then act on a window the user is not watching.

**Refused, with reasons** — the plan listed eight; three earn a tool only by being on the list:

- **`export_project`** — `export_project_settings` already writes the file headlessly. The only
  delta is a save dialog choosing the path, which an agent can choose itself.
- **`import_project_from_file`** and **`copy_from_existing`** — both are dialog-bound WIZARD
  PREFILL (`showOpenDialog` / a QuickPick, no argument bypass), and an agent driving the wizard
  is not the flow. The capability is reachable as `get_project` on the source, then
  `create_project` + `configure_project`. Same call the plan made for `cancel_storefront_setup`.

## The registration guard covered HALF the surface (fixed here)

`realSdkRegistration.test.ts`'s "whole surface on ONE server" test registered **8** functions
while `extension.ts` registers **17** — and still said "as extension.ts registers it". So the
duplicate-name net covered about half the tools, and it is the test that would have caught the
`select_project` collision before it was written. Same shape as the stub-server hole that file
exists for: a guard whose scope quietly stopped matching what it guards.

It now registers all of them, and a new test READS `extension.ts` and fails when a `register*`
call is missing here. Asserted by reading the source rather than by counting what registered,
because the failure is an omission — a function nobody calls registers nothing, so any count
taken from the server would agree with the mistake.

## The Group 4/5 live probe (2026-08-17) — two real findings, one wrong one

12 paths probed against build `94c8bb18`. Every refusal, gate and validation path behaved as
designed, and `open_url`'s `available` list matched `get_project_urls` exactly — the
shared-resolver claim, proven rather than argued.

**Found and fixed:**

- **`get_project` returned `ACCS_OAUTH_CLIENT_SECRET` in plaintext**, on the summary AND on
  `full: true`. Every agent that read the project put a working Commerce credential into its
  transcript. `stripSecretValues` already existed and `export_project_settings` already followed
  the convention — only this tool did not. Fixtures could never have caught it: an invented
  manifest has no real secret in it.
- **`set_project_pinned` returned the literal `{}`** and NOTHING anywhere reported pinned state,
  so an agent could pin a project and never learn whether it worked. It had been classified in
  `responseSize.test.ts` as "category 1 — paired with a confirming read". The pairing was
  assumed, not checked, and did not exist. Both halves now exist: the handler names the new
  state, `list_projects` carries `pinned` (only when true).

**Withdrawn: `rename_integration` is NOT broken.** It was reported as refusing real integrations
— `Only integrations can be renamed` for two live, deployed ones. On a clean host it works and
returns its `{renamed}` payload. What made it look broken is below, and it is the more important
finding.

## Three Dev Hosts, one socket — this invalidates measurements silently

The socket name is `sha256(projects-root)`, identical across every checkout, and the last host to
start takes it. **Three rebound it during one probe session**: `ai-surface-coverage` →
`bodea-template` (07:22) → `develop` (07:32). Consequences actually observed:

- A `restart_demo` call answered `Tool restart_demo not found` — a correct answer from the wrong
  build, which reads exactly like a registration bug in yours.
- The `rename_integration` "defect" almost certainly came from `getCurrentProject()` resolving a
  DIFFERENT project: the hosts share one on-disk current-project pointer, and
  `bodea-template-test` exists in the same projects root. That is the leading explanation, not a
  proven one — it cannot be established after the fact, and what would prove it is running the
  same call twice with a second host started in between.
- A full-suite run failed one suite on a 10s timeout in `inExtensionMcpServer` — the documented
  contention signature. `ps` showed ZERO competing jest runs; the contention was the Dev Hosts.
  The re-run was clean.

**So: before probing, have exactly ONE Extension Dev Host running, and read `info` immediately
before every measurement.** A wrong-build answer is a real response to a real server and looks
identical to a right one. This is the skill's rule 1 and it is not paranoia — it produced a
false defect report in this session.

**The happy paths were then probed** against a single host, and every Group 4/5 tool works:
`add_integration` really clones and deploys (85 B `{added}`), `open_url` opens (53 B),
`rename_integration` renames, `set_console_apis` runs a real subscribe PUT leaving state and
attribution untouched, `restart_demo` starts the demo. `set_project_destination` was approved
but not run — the round trip is two multi-minute redeploys and nothing else was outstanding.

One caution if you probe `set_console_apis` again: called WITHOUT `componentId` it rewrites
`componentApiPicks` through `applyDesiredApis`, which can collapse per-integration attribution.
Pass `componentId`.

## Three more defects the probe found, all pre-existing

- **`remove_integration` left the integration SELECTED** — keyed entry and instance cleared,
  `componentSelections.appBuilder` not. The mesh branch of that same function had been fixed on
  the identical argument and nobody carried it across. Fixed (`06ccb91d`); it bites at RESET,
  which rebuilds the component list from the selections.
- **`restart_demo` never returns inside 60 s** though it completes — the storefront URL resolved
  afterwards. `start_demo`/`stop_demo` share the shape, so this is a property of the
  demo-lifecycle tools, not of the new row. FILED, not fixed: it is a design question about
  long-running tools with no progress channel.
- **`set_console_apis` under-reports.** Asked for `AppBuilderDataServicesSDK`, it answered
  `subscribed: [GraphQLServiceSDK]` — an API the caller did not request — and said nothing about
  the one it did. The handler already COMPUTES the missing set and logs it as a warning; the
  response just does not carry it. FILED, not fixed: two lines, but on the subscribe path.

**Not a defect, checked rather than assumed:** `componentVersions` keeps a row for a removed
component. `getComponentVersion` is a keyed lookup nothing asks for after removal, and
`projectFileLoader.discoverComponents` reconciles it against disk — and the project already
carried such a row from an earlier session, independently of this probe.

## Group 6 — built AND probed 2026-08-17

**All four run correctly against a real Configuration Service**, on build
`feature/ai-surface-coverage@0c9d0bc6` with exactly one Dev Host, `info` read immediately
before the first measurement. `info` reported **90 tools** — an independent confirmation of the
53 bespoke + 37 descriptor count, arrived at by a different route than the greps.

| Tool | Live bytes | Path exercised |
|---|---|---|
| `get_site_access` | 131 | 1 site admin + 1 org admin, `canManage: true` |
| `set_site_admin` | 140 grant · 115 revoke · 126 refusal | grant → revoke round trip, both `verified: true` |
| `repair_site_configuration` | 241 · 148 refusal | real re-register, `repaired` + `verified` |
| `connect_dalive` | 444 | the handoff, unchanged by anything |

**No defects.** Every gate refused before touching its service, both `set_site_admin` directions
verified on re-read, and the storefront's admin roster was byte-identical before and after the
whole run — including across the re-register, which is the merge-not-replace pin in
`pinSiteAdmin` doing its job rather than an absence of evidence.

`repair_site_configuration` returned `nextStep: 'republish'` and did NOT publish, which is the
one claim about this tool that a fixture could never have supported.

### The storefront-name pair (added after, probed the same way)

| Tool | Live bytes | Path exercised |
|---|---|---|
| `find_storefront_name_mismatches` | 39 | 2 projects scanned, 0 mismatches |
| `migrate_storefront_name` | 105 no-op · 82 unknown path · 35 blank arg | every branch that refuses |

**The migration SUCCESS branch was NOT probed, and cannot be from here.** No project with a
name mismatch exists — this is a heal for pre-`164fd251` storefronts and both live projects are
newer. Manufacturing one means corrupting a real manifest, which costs more than the branch is
worth. Its ceiling therefore comes from the SHAPE plus a unit-driven measurement, and the
ceiling entry says so rather than implying a live number.

Two things the probe settled that no unit test could:

- **`projectPath` is rejected by the SDK before the handler runs** (the zod field is required),
  so the handler's own `projectPath is required` check looked like dead code. It is not: zod's
  `z.string()` accepts `"   "`, and the trim catches it — measured, 35 bytes. Worth knowing
  before someone "simplifies" that guard away.
- **`find_storefront_name_mismatches`' 39 bytes proves nothing about its bound**, because it
  found nothing. The ceiling is set from a full page instead — 2,780 bytes for 20 rows of long
  project paths, driven in the suite. A live measurement of an empty result is not a
  measurement of the tool.

The `confirm` + `confirmName` gate could not be reached live either, for a reason that is
correct rather than a gap: on a project with no mismatch the tool returns "nothing to do"
BEFORE the gate, so an agent looping the find list is never asked to confirm work that does not
exist. The gate is covered by unit tests and was falsified there.

Ceilings are recorded in `responseCeilings.ts` from these numbers, and the fixtures driving them
in `siteTools.test.ts` were copied from the live responses (addresses and the Runtime overlay
host redacted, lengths kept). Falsified by lowering `connect_dalive`'s ceiling: the failure
reported **444 bytes**, byte-identical to the live call — which is what a static handoff should
do, and is the check that the fixture is not a simplification.

### The earlier probe attempt answered from the wrong build

The first `info` returned `develop@8e5f40c2` from the MAIN checkout — 58 tools, none of them
these. Same shared-socket rebinding as the Group 4/5 session, and it would have reported all four
tools missing. Caught because `info` was read first rather than after a confusing result. This is
the second session in a row where that rule paid, and both times the wrong answer would have read
as a registration bug.

## Group 6 — what was built

Four tools in `siteTools.ts`, preceded by the extraction the plan insisted on:
`repairSiteConfigForProject(project, context, logger, onProgress?)` in
`features/eds/services/`, with two callers. The command keeps only the progress notification —
which is the one part an agent must not get — and the tool passes no `onProgress` at all.

The scoping held up under implementation. Every call it made was correct, including the one
that mattered most: **nothing here is dispatchable**, so these are bespoke modules over
`ctx.context` / `ctx.stateManager` rather than `{map, type}` rows.

Decisions worth not re-litigating:

- **`get_site_access` returns UNMASKED addresses.** The tool exists to name who can grant a
  role; a masked address can neither be relayed to the user nor passed to `set_site_admin`.
  This was checked against the `get_project` secret finding and is not the same case — an
  address is not a credential, and the masking in this codebase serves the diagnostics report,
  which is written to be pasted into tickets.
- **`repair_site_configuration` does not publish**, and says `nextStep: 'republish'` instead.
  Registration writes a routing rule; publishing here would push a config change under whoever
  is presenting the demo. An agent that stopped at `repaired` would report a storefront fixed
  that still serves the old config.
- **Both writes are confirm-gated and refuse BEFORE touching the service.** Asserted by
  checking the service was never called, not merely that an error came back.

**One test could not be falsified and was deleted rather than kept.** "Omits `onProgress` when
the caller wants none" passed whether the key was absent or explicitly `undefined`, because
`onProgress?.()` cannot tell them apart. The conditional spread went with it. A test that cannot
fail is worse than no test — it reads as coverage.

**No debt left on these four** — ceilings measured and recorded, see the probe section above.

## Groups 7 and 8 — built and probed 2026-08-17

**103 tools.** `info` reported it, matching 92 + 11 exactly, and the tree line moved 6 → 14
datapack tools.

### Group 7 — two defects, not just two tools

- **`install_prerequisite` could only ever fail from an agent.** It addressed the prerequisite by
  a numeric INDEX looked up in `sharedState`, which the headless context rebuilds empty on every
  call. However correct the index, the answer was always "state not found". Now addressed by the
  prerequisite's own id, resolved by re-reading config rather than cached state — and
  `check_prerequisites` reports `prereqId` beside the index so there is something to name.
- **It opened the user's browser for a call they did not make**, then returned bare
  `{success: true}` — "installed" for something that was not installed and never would be by that
  call. Now returns `{manual, url}`; `openExternal` still fires when there IS a panel, which is a
  person who just clicked Install. `createProject.ts:407` is the only caller and passes
  `panel: this.panel`, so the signal was traced rather than assumed.

A regression I introduced and the EXISTING tests caught: returning early instead of throwing
skipped the `prerequisite-status` push, which would have left the wizard's row on "Installing…"
forever. Kept as a throw.

`get_settings` returns all 21 keys; `dataInstaller.apiBaseUrl` reports `{configured}` rather than
its value because `package.json` withholds a default on the grounds that this repo is public. The
other three endpoint-shaped keys DO return values — checked, and all three are package defaults
already published in the public manifest, so withholding them would protect nothing.

**Unset settings used to vanish.** `JSON.stringify` drops `undefined`, so a key with no default
disappeared from the response with nothing saying the list was short. They are `null` now.

### Group 8 — three decisions the code made for me

- **`provision_accs_credentials` is not exposed.** Its handler docstring: "Panel-only by
  construction (never in the MCP maps): it creates a credential in the user's Console workspace."
  A prior judgement, not a gap. Its bare success is deliberate for the same reason.
- **The long-running problem was already solved.** `runAndWatch` validates, starts, persists an
  `ImportJobRecord`, fires the watcher with `void`, returns `{activationId}`. The watcher's
  `onProgress` pushes to a webview that is not there headlessly, but the authoritative record goes
  to `TransientStateManager`, which `get_datapack_import_status` reads. No handler needed changing.
- **`reset_datapack` is gated twice and that is not redundant** — the handler has always required
  `confirm:true` in its payload, the row refuses before dispatch, and the same flag satisfies both.

### The guard that did not cover the new rows

Adding 8 tools produced an all-green run, which was wrong. `responseSize.test.ts`'s `ALL` listed
three descriptor arrays and not the new one, so every Group 8 row escaped BOTH the bare-success
classification and the ceiling-coverage check. Widened; it immediately demanded five things that
had been skipped. This is the third instance of the same shape in this file's own history — a
guard whose scope quietly stopped matching what it guards. **When adding a descriptor array, add
it to `ALL` in the same edit.**

### Two schema defects the probe found

Both are the "never write a shape you have not read" trap, and neither is visible offline:

- **`list_datapack_export_items` was UNCALLABLE.** Its schema omitted `dataTypes`, and a raw zod
  shape STRIPS unknown keys — so the argument never reached the handler and every call answered
  "Select at least one data type to export." Same class as the `discover_store_structure`
  `backendType` defect this plan already records. Fixed and verified live: 801 bytes for 20
  categories of 25, 622 for 20 products of 186.
- **`commerceInstance` and `version` were described as optional.** They are required, and
  `commerceInstance` deliberately so — the handler's comment says "a wrong default writes sample
  data into someone else's live demo". The schema was inviting an agent to omit the one argument
  that was made mandatory for safety.

### Live measurements

| Tool | Bytes |
|---|---|
| `get_settings` | 1,159 (all 21 keys) |
| `get_datapack_import_target` | 71 |
| `list_datapack_import_scopes` | 320 (3 websites) |
| `get_datapack_import_status` | 997 (a real completed 14-type import) |
| `validate_datapack_import` | 14 valid · 47 / 80 refusals |
| `list_datapack_export_items` | 801 categories · 622 products |

**One note for whoever probes next:** `mcp-live-probe`'s read-only allowlist has no `validate_`
prefix, so `validate_datapack_import` needs `--force` despite being a dry run that writes nothing
(verified by reading the handler). Widening the allowlist is a change to a SAFETY mechanism —
`validate_something_destructive` is imaginable — so it was left alone rather than edited in
passing. Worth a deliberate decision, not a drive-by.

## Then

**Group 6 is COMPLETE.** `migrate_storefront_names` shipped as a PAIR rather than the single
bulk tool the plan named: `find_storefront_name_mismatches` (read) +
`migrate_storefront_name` (one project, confirm + name echo). The bulk shape cannot carry a
name echo — there is no single name to echo — and it would hand an agent one call that deletes
N DA.live site roots. Its per-project sequence is extracted into
`storefrontNameMigrationForProject`, shared with the command, because the migration mutates the
manifest in memory WITHOUT saving and the re-register DESTROYS the site publish key. A second
implementation omitting either step would look correct and leave every migrated storefront
unable to publish. The command's 16 existing tests pass unmoved over the extraction.

**Group 7** — `install_prerequisite` is the only real refactor left on the surface: it
indexes into per-call `sharedState` and must re-address by prereq id, and return
`{manual: true, url}` instead of calling `vscode.env.openExternal`.

Still blocked, unchanged: **`github_change_account`** — no Demo Builder command exists to hand
off to (re-verified against `package.json`), and `HandoffTarget` takes only a view or a command
id. Design decision, not an implementation. Do not invent an id. The bulk
`cleanup_dalive_sites` / `manage_github_repos` pair stays deliberately unbuilt.

## Primitives now available (use these, do not reinvent)

In `toolDescriptors.ts`, all four with tests:

- `capturePayloadFrom: '<event>'` — a handler that pushes its answer and returns bare success
  becomes a tool with no handler edit. A captured `success: false` beats the handler's `true`.
- `argDefaults: {...}` — arguments FORCED onto the call, overriding the caller. For read tools
  whose handler has a write on some branch.
- `preflight: (args) => result | undefined` — answer without dispatching. This is how a
  `needsUser` handoff avoids running the handler first.
- `projectors.ts` — `leanList` / `indexDetail` / `verdictOnly` / `legend`, plus `AGENT_PAGE_SIZE`.

## Traps that cost real time today

1. **The stub server in every test file ignores the tool DEFINITION.** 20 of 22 files. It cannot
   see the input schema, and `tsc` cannot either (`server` is `any`). Two defects shipped through
   it, one of which killed the entire server for six commits. Add new registration functions to
   `tests/features/ai/server/realSdkRegistration.test.ts`. Full write-up in the
   `mcp-tool-authoring` skill.
2. **`inputSchema` must be a zod shape or schema — never raw JSON Schema**, and a raw shape
   STRIPS unknown keys. Use `z.object({...}).strict()` on anything that writes.
3. **Never write a shape you have not read** — schema fields from the handler's payload type,
   test fixtures from a real `.demo-builder.json`, and check WHICH of two similar accessors a
   caller uses. Five instances today. See `mcp-tool-authoring` and `webview-test-authoring`.
4. **The registry usually already knows.** Four problems were solved by reading a declaration
   that existed: the mesh's `requiredEnvVars`, `getWorkspaces`' `target?` shape,
   `checkGitHubApp`'s own `skipTrigger`, and `COMPONENT_SECTIONS`. Look before adding a mechanism.
5. **`mcp-live-probe` earns its keep.** It found three defects that passed jest, tsc,
   typecheck:tests and eslint. Read `info` before EVERY measurement — the `bodea-template`
   worktree's host rebinds the shared socket every few minutes, and a wrong-build answer looks
   exactly like a right one.

## Open debts

- **Unprobed:** `check_prerequisites` with `selectedOptionalDependencies: ['eds-accs-mesh']`
  (should pull Node 20 into the check), and `configure_project`'s APPLY paths. The latter writes
  real project state — point it at a throwaway project, not `demo-builder-test`.
- **`update_project_config`** is still the unguarded whole-file write. `configure_project` now
  covers the structured cases; consider narrowing or retiring it.
- **Adobe cache vs session target** is fixed for `createProject`/`createWorkspace` only. Any
  future tool over `AdobeEntityFetcher` must pass an explicit target — `select_*` writes
  `adobeTargetStore`, which the fetcher's cache never sees.

## Conventions worth keeping

- Every tool answers with something an agent can act on: the applied diff and what remains, not
  `{success: true}`. `responseSize.test.ts` classifies every row that could return `{}`.
- Irreversible actions take `confirm: true` AND an exact name echo (`delete_github_repo`,
  `delete_adobe_project`).
- Secrets are never tool arguments. Refuse with `needsUser`, apply nothing else.
- Record a ceiling from a LIVE measurement. If it cannot be measured yet, put the tool in
  `PENDING_LIVE_MEASUREMENT` rather than inventing a number.
