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

## Open questions for the owner

1. One Node for every Adobe CLI call (24), or mesh kept on 20 as a declared exception?
2. Keep Node 18 for the ingestion tool, or move it to the common version?
3. Should prerequisites prepare Node for integrations a project might add later, or only for
   those already chosen?

## Related

[[AB-3]] (integration `nodeVersion`, the mechanism to generalise), [[AI-13]] (the AI tools,
already on it), [[AB-22]] (read `engines` / `.nvmrc` from an imported repo, a later source for
the register), [[PL-36]] (an untested Node-version sort in the prerequisites installer).
