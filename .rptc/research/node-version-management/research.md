# Node versions in one place

**Date:** 2026-10-07
**Trigger:** owner, after AI-13: "We have a backlog item to look at prerequisites, which
includes what versions of Node are installed for the builder to run. Cross-reference this,
and the fact that integrations run on their own Node versions, so that we develop a
comprehensive approach to ensuring that all Node versions are managed in a single place."
**Related:** [[PR-1]] (prerequisites reframe), [[AB-3]] (integration `nodeVersion`),
[[AB-22]] (read `engines` from an imported repo), [[AI-13]] (AI tools on Node 24),
[[PL-36]], `.rptc/research/prereqs-architecture-reframe/research.md`,
`.rptc/research/extension-owned-toolchain/research.md`.

**Evidence status:** an inventory from a read of the code on the release-candidate branch at
`8c4f266bf`. Items marked *(code read)* are what the code says. Items marked *(unverified)*
were inferred and have not been run.

## What the two earlier documents already settled

- PR-1 research: Node is "the one genuine straddler": the TOOL is extension-wide, the
  VERSIONS are per project. The versions were meant to live with the components
  (`components.json`), the tool with the prerequisites.
- PR-1's 2026-08-27 log: the owner chose "ensure at the door" (`ensureFnmNodeVersion` when a
  choice binds) over a later graphical check, for anything that depends on a choice.
- Extension-owned toolchain: fnm's side-by-side Node store is the model; the extension picks
  the version per call and never changes the user's default.

So the direction is agreed. What is missing is that the VERSIONS are not in one place, and
the ways of USING a version are not one way.

## Where a Node version is declared today *(code read)*

| Declared in | Value | Who reads it |
|---|---|---|
| `components.json` headless frontend `configuration.nodeVersion` | 24 | prerequisites, component install, update, start |
| `components.json` three mesh entries | 20 | prerequisites; `getMeshNodeVersion()` for every mesh `aio` call |
| `components.json` `tools.commerce-demo-ingestion` | 18 | nothing (the registry does not load `tools`) |
| `toolManager.ts` `NODE_VERSION` | 18, hardcoded | the ingestion tool (a second copy of the line above) |
| `app-builder-components.json` `nodeVersion` (starter kit, demo ERP, ERP integration) | 24 | the integration add door (AB-3). **Not the prerequisites screen** |
| `ai-defaults.json` `nodeVersion` | 24 | AI tools install, update, launch (AI-13) |
| hardcoded fallback "20" | 5 places (`meshConfig.ts` x3, `installHandler.ts`, `DependencyResolver.ts`, `startDemo.ts`) | whenever a lookup finds nothing |
| `appDeployment.ts` `APP_NODE_VERSION` | "auto" | an integration with no `nodeVersion` |
| `components.json` `infrastructure.adobe-cli` | none | so "auto" never finds a declared version |

Schemas: `nodeVersion` is in the App Builder and ai-defaults schemas only. The components
schema does not describe it; the prerequisites schema still carries the dead
`componentRequirements.nodeVersions`.

## How a version becomes a running Node today *(code read)*

| Way | Where | Form |
|---|---|---|
| explicit major | `CommandExecutor.wrapCommandWithFnm` | `fnm exec --using=N cmd` |
| "current" | same | `eval "$(fnm env)" && cmd` (the user's fnm default) |
| "auto" | `resolveAutoNodeVersion` → `findAdobeCLINodeVersion` | the FIRST fnm version directory that has `aio` in it |
| none | `enhancePath` | every fnm version's `bin` put first on PATH, in directory order |
| prerequisite installs | `ProgressUnifier` | its own `fnm exec --using N` (a second wrapper) |
| install a major | `ensureFnmNodeVersion` | `fnm install N` |
| start a demo | `startDemo.ts` | `fnm use <the version recorded at install>` |
| the demo-builder MCP proxy | `resolveNodePath` | `which node` + realpath, else Electron's own binary |
| the AI tools (AI-13) | `launchUnderNode` | `fnm exec --using=24 node` |

## What goes wrong because of it

Confirmed by the code read:

1. **The prerequisites screen never sees integrations' or the AI tools' versions.** It reads
   frontend, backend, mesh and infrastructure only. So Node 24, and the Adobe CLI under 24,
   are never prepared for a project that later adds an ERP. The add door installs Node 24,
   but not the Adobe CLI under it.
2. **The Adobe CLI runs on different Node for the same job.** An integration deploy uses 24.
   The same workspace download uses "auto" in four other places. Mesh uses 20. Bare `aio`
   calls use whatever the PATH puts first. The CLI refresh installs into the default Node
   while deploys run under 24.
3. **"auto" does not mean "the CLI's Node".** It means the first fnm directory, in listing
   order, that happens to contain `aio`.
4. **Two sources for "which Node runs a demo".** Start uses the version recorded at install;
   update uses the registry's current value. Raise the version in `components.json` and the
   install moves while `npm run dev` does not.
5. **The same number in several places.** Node 18 for the ingestion tool twice; the mesh's 20
   in `components.json` and again as a fallback in five places.
6. **Two fnm wrappers, three validators, `fnm list` parsed in five places.**
7. **Prerequisites use three different version sets** for check, continue and post-install.

Inferred, not run:

8. *(unverified)* The Adobe CLI plugin's version filter compares component ids against
   display names, so it may never match and always fall back to the first version.
9. *(unverified)* An unwrapped `npm` or `aio` may run on the lexically first fnm Node (18),
   not the user's default, because of how `enhancePath` orders the PATH.

AI-13 fixed one instance of 2 for the AI tools (install, update and launch now agree on 24).

## The proposed approach: one register, one resolver, one runner

**1. One register of Node needs.** Every place that needs Node declares it in its own catalog
entry, as today, under one field name (`nodeVersion`): components, App Builder integrations,
tools, the AI tools, and the Adobe CLI itself (`infrastructure.adobe-cli`). No hardcoded
numbers anywhere else; no fallback literals. A single module
(`core/node/nodeRequirements.ts`, say) loads all of those catalogs and answers two
questions:

- `nodeFor(thing)`: the major a given component, integration, tool or the CLI runs on.
- `nodesFor(project)`: every major a project needs, including its integrations and AI tools.

**2. One resolver for "which Node runs this".** Every caller asks the register by WHAT it is
running, never by number: `useNodeVersion: nodeFor('adobe-cli')`, not `'auto'`, not `'20'`.
"auto" and the directory scan go. The Adobe CLI gets one declared Node; every `aio` call uses
it, mesh included, unless a mesh entry says otherwise (and then that is declared too).

**3. One runner.** `CommandExecutor`'s `fnm exec --using=N` is the only way a command runs on
a chosen Node. `ProgressUnifier`'s second wrapper and `startDemo`'s `fnm use` go through it;
the MCP launch lines use the same form (as AI-13 already does).

**4. Prerequisites read the register.** The prerequisites screen (PR-1's project tier) asks
`nodesFor(project)`, so it shows and prepares every Node a project will need, integrations
and AI tools included, and the Adobe CLI under each one that needs it. Choices made later (a
dashboard integration add) keep "ensure at the door", now calling the same register.

**5. One recorded version per thing.** A component records the version it was installed
with; start and update both read that record, and an update that changes the declared version
re-installs on the new one and records it.

**6. Later: read the repo.** AB-22's `engines` / `.nvmrc` reader becomes one more source for
the register, for imported integrations that have no catalog entry.

## How it fits PR-1

PR-1 is the prerequisites screen and its tiers. This is the data underneath its project tier:
"what Node does this project need" becomes one call instead of a partial read of one file.
Recommended as a child of PR-1, sequenced FIRST (PR-1's own step 1 is a schema rewrite; the
register is the same kind of groundwork), and buildable without PR-1's welcome panel.

## Open questions for the owner

1. Which Node should the Adobe CLI itself run on: one version for every `aio` call (24, which
   integrations need) or keep mesh on 20 as a declared exception?
2. Should Node 18 for the ingestion tool stay, or move to the same version as everything else?
3. Should the prerequisites screen prepare Node for integrations a project MIGHT add later, or
   only those already chosen (today's "ensure at the door" for later choices)?

## Revision, 2026-10-07: read the version from each component, keep none in Demo Builder

**Owner direction.** Demo Builder should not carry Node versions of its own. A version goes up
only when a delivered tool demands it, and nobody should have to read every component's code
and copy a number that can drift. PR-1a steps 1 to 6 built a register over hand-kept
`nodeVersion` fields; this revision replaces those fields with what each component already
declares.

**Evidence (2026-10-07, `engines-probe.js` beside this file, read-only).** Every component we
ship already declares a Node range in its own `package.json` `engines.node`:

| Component | Declared range | Read from |
|---|---|---|
| demo-erp | `>=20` | GitHub |
| commerce-erp-integration | `^24.0.0` | GitHub |
| Adobe commerce-integration-starter-kit | `^24.0.0` | GitHub |
| app-builder-shell | `>=18` | GitHub |
| eds-accs-mesh | `>=18` | GitHub |
| headless-commerce-mesh | `^14 \|\| ^16 \|\| ^18` | GitHub |
| commerce-eds-mesh | `^14 \|\| ^16 \|\| ^18` | GitHub |
| citisignal-nextjs (headless storefront) | none | GitHub |
| commerce-demo-ingestion | unreadable (private, PMET-public) | GitHub |
| @adobe/aio-cli 11.1.4 | `>=20` | npm |
| @adobe/aio-cli-plugin-api-mesh 5.7.3 | `^16.13 \|\| >=18.0.0` | npm |
| @adobe-commerce/commerce-extensibility-tools | `>=22.0.0` | npm |
| @playwright/mcp | `>=18` | npm |
| @dropins/ai-tools 1.0.0 | `>=18.0.0` | npm |

**The rule tested.** One Node for everything Demo Builder ships = the LOWEST long-term-support
major every declared range accepts, at its newest patch. "Lowest", not "newest": newest would
move fresh machines to the next LTS on its own; lowest rises only when a range's floor rises.

**What the probe found.**

1. **No shared Node today, because of two stale ranges.** The two older mesh repos cap at 18
   (`^14 || ^16 || ^18`) while the ERP integration and the starter kit require `^24`. Step 0
   deployed a mesh on Node 24 successfully, so the caps are out of date, not real. Without them,
   every range agrees on **24**: the `^24` ceilings force it, and `>=22` from the extensibility
   tools is the highest floor.
2. **Per-project resolution would split machines across Nodes.** A project without the ERP
   integration resolves to 22 on its own. So the shared Node must be resolved across EVERYTHING
   Demo Builder can install, not per project, or one machine holds 22 and 24.
3. **One component declares nothing** (the headless storefront, ours) and one cannot be read
   (the ingestion tool, DI-4). A component with no range takes the shared Node.
4. **Ceilings are the real hazard.** `^24` means "not 26". When something we ship later demands
   `>=26`, the ranges stop overlapping. That is a true conflict and must fail at release, never on
   an SC's machine.

**Not yet verified (needs live runs).** headless-commerce-mesh and commerce-eds-mesh deploying on
24 (only one mesh was tried in step 0); the headless storefront running on 24 (the catalog says
24 today, so likely, not proven); reading ranges when offline or rate-limited.

### Live verification, 2026-10-07 (owner-approved)

All on Node 24.21.0 from Demo Builder's own store (`~/.demo-builder/node`), set up the way the
extension now does it: `fnm install 24`, then `npm install -g @adobe/aio-cli` (11.1.4) and
`aio plugins:install @adobe/aio-cli-plugin-api-mesh` (5.7.3), no engine warnings.

| Check | Result |
|---|---|
| headless-commerce-mesh: npm install, build, deploy, query | PASS. Built; provisioned in a throwaway workspace (zzNode24Mesh2, Kukla Justrite); a custom resolver answered and a catalog query reached the Commerce search service |
| commerce-eds-mesh: same | PASS. Provisioned; `storeConfig` answered with real store data |
| citisignal-nextjs (headless storefront): npm install, `next dev` | PASS. Ready in 1.3s, home page served (HTTP 200) |
| Cleanup | Both meshes deleted; the workspace deleted by a script that refused any other name; the project's three real workspaces untouched |

**Ranges fixed in the repos (owner-approved, pushed):** headless-commerce-mesh `>=20` (`f35b082`)
and commerce-eds-mesh `>=20` (`596d916`): Demo Builder ran every mesh on Node 20 for months, they
passed on 24 today, and their own aio-cli dependency needs 20+. citisignal-nextjs `>=24`
(`6b26bbc`): what it has always run on and passed on today. **After the fix the probe resolves
one Node for everything: 24.21.0.**

**New finding: aio plugins are per USER, not per Node.** `aio plugins:install` writes to
`~/.local/share/@adobe/aio-cli`, which every `aio` on the machine shares, whatever Node runs it.
So "install the mesh plugin beside the CLI under each Node" (step 5's plugin loop) installs the
same plugin into the same place once per Node. Harmless, but the per-Node plugin logic models
something that does not exist; the plan should simplify it to "once".
