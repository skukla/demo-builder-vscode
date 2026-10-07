---
id: PR-1a
kind: feature
area: prerequisites
parent: PR-1
needs: []
value: med
status: planned
---

# Node versions in one place: one register, one resolver, one runner

Filed 2026-10-07 from the owner, after AI-13: Node versions for the extension, the
prerequisites screen, each integration and the AI tools should be managed in a single place.

Research: `.rptc/research/node-version-management/research.md` (inventory at `8c4f266bf`).

## In one paragraph

Node versions are declared in four catalogs plus hardcoded copies and five fallback "20"s,
and turned into a running Node four different ways. The prerequisites screen sees only part
of it (never integrations or the AI tools), and the Adobe CLI runs on different Node for the
same job depending on the caller. The proposal: every catalog entry declares `nodeVersion`
(the Adobe CLI included); one module answers "which Node runs this thing" and "which Nodes
does this project need"; every command runs through `CommandExecutor`'s
`fnm exec --using=N`; the prerequisites screen (PR-1's project tier) reads the same
register; "ensure at the door" for later choices calls it too.

## Decided (owner, 2026-10-07)

1. **Adobe's CLI runs on one Node, 24, for every call**, mesh included. Grounds: aio-cli
   11.1.4 needs Node >=20 and its app plugin >=20.17; the api-mesh plugin accepts >=18; Node 20
   reached end of life 2026-04-30 and Node 24 is supported to 2028-04-30. Needs one live mesh
   deploy on 24 before the switch.
2. **The data ingestion tool moves to 24.** Its package says `engines >=18`; Node 18 ended
   2025-04-30; its `ora@9` likely needs 20 already (unverified). Needs one live run on 24.
3. **Prerequisites prepare only what a project has chosen.** Later choices keep "ensure at
   the door".
4. **Demo Builder keeps its own Node store** (`~/.demo-builder/node/`, fnm's `FNM_DIR`): all of
   it is Demo Builder's, so removal is always safe and the user's fnm is never touched. Replaces
   PR-1 D13/D15 ("never uninstall") for Node. fnm records what is installed, not who installed
   it (checked 2026-10-07), which is why a separate store and not a ledger.
5. **Earlier releases' versions are removed once from the shared fnm**: every version of a major
   Demo Builder ever required (18, 20, 22, 24, from git history), ticked by default in one
   confirmation; the user's fnm default listed but not ticked. The Adobe CLI under a version goes
   with it. (Early releases ran `fnm default` for a week in September 2025, `7f27cc83a`, so a
   default of 20 may be Demo Builder's too.)

## Migration

In the plan's overview (`.rptc/plans/node-versions-in-one-place/overview.md`, "Migration of an
existing installation"): Node 24 and the Adobe CLI arrive in the store at first need; installed
components run unchanged (they were built on 24); the AI bundle is rewritten to the store by the
sweep; the shared fnm is cleaned once (step 8); the store is deleted on uninstall.

## Related

[[AB-3]] (integration `nodeVersion`, the mechanism to generalise), [[AI-13]] (the AI tools,
already on it), [[AB-22]] (read `engines` / `.nvmrc` from an imported repo, a later source for
the register), [[PL-36]] (an untested Node-version sort in the prerequisites installer).

## Shipped so far

- 2026-10-07  2026-10-07 Planned: .rptc/plans/node-versions-in-one-place/ (steps 0-8). Found while planning: getMeshNodeVersion and getInfrastructureNodeVersion look the extension up as adobe-demo-team.adobe-demo-builder (it is skukla.adobe-demo-builder), so mesh always falls back to a hardcoded 20; step 1 removes both.
