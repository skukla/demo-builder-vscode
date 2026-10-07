---
id: PR-1a
kind: feature
area: prerequisites
parent: PR-1
needs: []
value: med
status: backlog
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

## Migration

Nothing is uninstalled (PR-1 D13/D15): fnm keeps old majors side by side, and the user's
default Node is never changed.

- **The machine.** The first command that needs a newly declared Node ensures it, and ensures
  the Adobe CLI and its plugins under it, once. Today `ensureFnmNodeVersion` installs Node
  only; ensuring the CLI under it is new work. Measured on the owner's machine 2026-10-07: aio
  is installed under 18.20.8, 20.19.6 and 24.12.0 but NOT under 24.21.0, which is what
  `fnm exec --using=24` picks. How deploys under 24 found aio anyway (likely `enhancePath`
  putting another version's bin first) is unverified.
- **Projects.** The only Node recorded in a project is `metadata.nodeVersion` on installed
  components (integrations, the headless frontend, and a `.node-version` file beside them).
  Both real projects read 2026-10-07 record 24 on their integrations and nothing on the
  storefront. Start and update must read ONE value: when the declared version differs from the
  recorded one, the next update or reset reinstalls under the declared version and records
  it, and start uses the record until then.
- **AI tools.** Already moved by AI-13 through the AI bundle sweep (AI_CONTEXT_VERSION 39).
- **Undo.** Change the one declared value back; the old Node is still installed.

## Related

[[AB-3]] (integration `nodeVersion`, the mechanism to generalise), [[AI-13]] (the AI tools,
already on it), [[AB-22]] (read `engines` / `.nvmrc` from an imported repo, a later source for
the register), [[PL-36]] (an untested Node-version sort in the prerequisites installer).
