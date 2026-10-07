# Plan: Node versions in one place (PR-1a)

**Item:** [[PR-1a]] (child of [[PR-1]]). **Research:**
`.rptc/research/node-version-management/research.md` (see "Revision, 2026-10-07" and "Live
verification"). **Status:** steps 0 to 6 built 2026-10-07; replanned the same day around
component-declared ranges (owner); steps 7 to 14 to build.

## Goal

Demo Builder keeps no Node version of its own. Each component already says which Node it
accepts, in its own `package.json` `engines.node`; Demo Builder reads those ranges, picks ONE
Node that all of them accept, runs everything on it from its own Node folder, and removes what
it no longer needs. A version rises only when a delivered component's range demands it.

## Decisions (owner, 2026-10-07)

1. **One Node for everything Demo Builder ships**, worked out from the components' ranges, never
   typed by a person. The rule: the LOWEST long-term-support Node major that every range accepts,
   at its newest patch. Lowest, so it rises only when a range's floor rises (newest would move
   new machines to the next LTS on its own).
2. **Worked out at release time**, across the whole catalog (not per project: a project without
   the ERP integration would otherwise pick 22 while another picks 24). A release script reads
   every range and writes the answer into a generated file; it fails when the ranges do not
   overlap, so a conflict is caught by us, never by an SC. Nothing on an SC's machine depends on
   reaching GitHub to know its Node.
3. **Code we do not own follows the same rule at runtime.** The Adobe CLI's range is part of the
   release-time answer (read from npm). An integration an SC brings from its own repo is read when
   it is added: reuse the shared Node if its range accepts it, otherwise install the lowest LTS
   it does accept.
4. **Demo Builder's own Node folder**, `~/.demo-builder/node/` (fnm's `FNM_DIR`). Everything in it
   is Demo Builder's, so removing what is unused is always safe; the SC's own fnm is never touched
   except by the one-time cleanup they confirm (decision 6).
5. **Unused Nodes are removed automatically** from that folder: anything that is not the shared
   Node, not what an installed component was last installed under, and not what an outside
   integration needs.
6. **The versions earlier releases put in the SC's own fnm are removed once**, with one
   confirmation: majors 18, 20, 22, 24 ticked, the SC's fnm default listed but not ticked.
7. The ingestion tool waits on [[DI-4]] (its repo is private and unreadable today).

## Live evidence (2026-10-07)

On Node 24 from `~/.demo-builder/node`: both older mesh repos built, deployed and answered
queries in a throwaway workspace (deleted after); the headless storefront served its home page;
the Adobe CLI 11.1.4 and mesh plugin 5.7.3 installed with no engine warnings. The two mesh repos'
ranges were out of date (14 to 18 only) and the storefront declared none; fixed in the repos
(`f35b082`, `596d916`, `6b26bbc`). The probe (`engines-probe.js` beside the research) now
resolves ONE Node, 24.21.0, for everything.

## Steps

| # | Step | Status | Cloud? |
|---|---|---|---|
| 0 | Live checks on Node 24 | done | yes (approved) |
| 1 | A register that answers "which Node runs this" | done; step 7 swaps its source | no |
| 2 | Demo Builder's own Node folder; one call ensures a Node and the Adobe CLI under it | done | no |
| 3 | Every caller asks the register; "auto", the directory scan and the fallback "20"s gone | done | no |
| 4 | One runner, one reader of what is installed, start uses the folder | done | no |
| 5 | Prerequisites use one Node set for the CLI and its plugins | done; step 8 simplifies plugins | no |
| 6 | Update records the Node it installed under; `.node-version` no longer written | done | no |
| 7 | **The release-time resolver and generated file; catalog `nodeVersion` fields deleted** | to build | no (reads GitHub/npm) |
| 8 | **Outside repos at runtime; plugins installed once** | to build | no |
| 9 | **Start notices a component installed under an older Node and offers a reinstall** | to build | no |
| 10 | The AI bundle and terminals use the folder (was step 7) | to build | no |
| 11 | **Cleanup: unused Nodes in the folder, the one-time shared-fnm cleanup, uninstall** | to build | no (local, confirmed where it touches the SC's fnm) |
| 12 | **What the SC sees: the prerequisites step, the add confirmation and progress, the post-update Node, Diagnostics** | to build | no |
| 13 | Docs, skills, backlog | to build | no |
| 14 | Live verification on the owner's machine | to build | yes, with the owner's OK |

Each step is a commit with the gate green.

## What steps 1 to 6 keep and what step 7 replaces

Kept: the register's interface (`adobeCliNodeVersion`, `nodeForComponent`,
`nodeForAppBuilderEntry`, `aiToolsNodeVersion`, `nodesFor`), so no caller changes; the folder,
`ensureNode`, the one runner, `readStoreFnmList`, `perNodeToolMajors`, the update record.
Replaced: where the register gets its answer (hand-kept catalog `nodeVersion` fields become the
generated file), and the SOP enforcer's rule ("only in catalogs" becomes "only in the generated
file").

## Migration of an existing installation

| What | How it moves | Step |
|---|---|---|
| The machine | The first command that needs the shared Node installs it, with the Adobe CLI, into the folder | 2 (done) |
| Installed components | Keep running on the Node they were installed under; Start offers a reinstall when that is older than the shared Node; update and reset move them | 6, 9 |
| The AI bundle | Rewritten by the activation sweep (`AI_CONTEXT_VERSION` bump) | 10 |
| Adobe sign-in and plugins | Carry over: both live in the SC's user folders, not in a Node (verified 2026-10-07) | none |
| The SC's own fnm | One confirmation removes what Demo Builder used to install there | 11 |
| Uninstalling Demo Builder | Its folder is deleted | 11 |

## Surfaces to hit

- **Config field in three places:** step 7 deletes `nodeVersion` from `components.json`,
  `app-builder-components.json`, `ai-defaults.json`, their schemas and their types together.
- **Release:** the `cut-release` skill runs the resolver; `tests/sop` pins that the generated
  file covers exactly the catalog's sources (offline), so adding a component without
  re-resolving fails the build.
- **Human and agent surfaces:** prerequisites, integration adds and Start reach both through the
  same handlers; step 11's shared-fnm cleanup gets a read tool and a confirm-gated tool.
- **Mocks:** suites that fake the register or the folder.

## Undo

Every step is a commit. The generated file is regenerated by one command. Anything removed from
the SC's own fnm comes back with `fnm install <major>`; anything removed from the folder comes
back the next time something needs it.
