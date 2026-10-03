---
id: AI-11
kind: feature
area: ai
needs: []
value: med
status: backlog
---

# Create project cannot set store scope for an added demo

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-09-30, found building the JustRite project from Khalil's storefront (AB-53).

## The gap

`create_project` takes `projectName`, `stack`, `package` or `link`, `repoName`, `githubOwner`,
`daLiveOrg`, `daLiveSite` and `accsEndpoint` — and no store scope. The three store codes come
from the demo: for an added demo, whatever the colleague's `config.json` says
(`probe_shared_demo` records them). Khalil's storefront says `justrite / juststore / justeng`;
the ACCS instance it is being built on has `justrite / justrite_store / justrite_us`. The
endpoint answers "Requested store is not found (justeng)" for his view code, so the project
would be created, and its `config.json` generated and published, naming a store view the
instance does not have.

The wizard has this: the Commerce area's Connection / Business Structure steps let the SC pick
the codes discovery found. The agent surface does not, so an agent's only path is create →
`configure_project { storeScope }` → `republish`: a project published wrong once, then fixed.

## Fix

`create_project` takes an optional `storeScope { website, store, storeView }` (the shape
`configure_project` already accepts), applied before the setup pipeline generates and publishes
`config.json`. When omitted, the demo's codes as today. Worth pairing with a refusal: when the
stack is ACCS and the demo's codes are not among what `discover_store_structure` finds on the
endpoint, say so and name the found codes, rather than publishing a storefront that cannot load.

## Shipped so far
- 2026-10-03  2026-10-03 (worktree night2-b, uncommitted): create_project and create_project_from_file take storeScope {website, store, storeView} from configure_project's one schema (storeScope.ts), checked before anything is created and written to the backend's config that generates config.json; live ACCS proof left for the owner.
