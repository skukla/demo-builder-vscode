# Face buttons vs the kebab — decide it once, for every tile

**Filed:** 2026-08-04
**Type:** Research, then a single cross-tile change. NOT a per-card fix.
**Research: DONE** — `.rptc/research/card-face-buttons-vs-kebab/research.md`
(2026-08-04). Recommends Option A: no face buttons anywhere, kebab carries every
verb, card body stays the open-detail affordance. Supported by an inventory showing
integrations is the ONLY surface with a face button, and by Adobe's own Spectrum
guidance. What remains is the implementation decision in the research doc's "Open
questions" — chiefly what a never-deployed card looks like without a face verb.
**Origin:** Reported against the mesh card: *"I don't see a Redeploy option for a
mesh in the kebab. (Shouldn't have a Retry button on a mesh card.)"* Two attempts
to answer it card-by-card produced a mesh-only exception both times, which is the
signal that the question is about the vocabulary, not the mesh.

## The question

Cards currently carry an at-most-one **face** verb plus a **kebab**. The stated
rule: the face holds the urgent verb (the card needs you), the kebab holds the
deliberate ones. The owner's position is that face buttons are abandoned — if that
is right, it applies to **all** tiles and is one change, not a mesh patch.

## What is actually in the code today (verified 2026-08-04)

`IntegrationFaceButton` renders in BOTH `IntegrationCard.tsx` and
`IntegrationDetailPanel.tsx`. Face verbs come from two matrices:

| Status | Integration face | Mesh face | Kebab redeploy? |
|---|---|---|---|
| not-deployed | Deploy | Deploy | no |
| stale | Update | Update | no |
| error | Retry | Retry | no |
| deployed | — | — | **yes** |
| needs-auth | — | Sign in | no |

So Redeploy is a kebab item ONLY on a healthy card. In every state where something
is wrong, the same operation appears on the face under a different name — which is
exactly why it looked missing on an errored mesh.

## The asymmetry any decision must account for

The two card kinds do NOT have the same number of operations behind these verbs.

- **Integrations** — `KEYED_MESSAGES` maps `deploy`/`retry` →
  `deployAppBuilderComponent` and `update`/`redeploy` → `redeployAppBuilderComponent`.
  Four labels, **two** real calls. Retry and Redeploy genuinely differ.
- **Mesh** — `IntegrationsGrid.handleMeshAction` routes every verb except `sign-in`
  to `onDeployMesh()`. Four labels, **one** real call. Retry, Update, Redeploy and
  Deploy are the same operation.

A vocabulary that fits integrations therefore over-names the mesh. Collapsing the
mesh's verbs alone is what produced the rejected mesh-only exception.

## Options to weigh (none chosen)

1. **No face buttons anywhere.** Every verb becomes a kebab item; the face carries
   status only. Simplest rule, one control per card. Costs the one-click urgent
   action on a broken card, and needs a decision about whether Deploy on a
   never-deployed card is also demoted.
2. **Face for state-changing verbs only.** Deploy and Sign in stay (they are not
   redeploys); Update and Retry fold into a single kebab Redeploy. Keeps urgency
   where nothing exists yet.
3. **Keep as-is, widen the kebab.** Offer Redeploy in the kebab in every actionable
   state so it never disappears, accepting that the face duplicates it. Smallest
   change; keeps two controls for one action, which is the thing that confused.

## Scope when it happens

`MESH_MATRIX` + `INTEGRATION_ACTIONS` + `buildMenuActions`/`meshMenuActions` in
`integrationCardModel.ts`; `FACE_LABELS` and `IntegrationFaceButton` in
`IntegrationActions.tsx`; both render sites. Test impact is wide — the mesh matrix
suite asserts a face kind per status, and the grid action tests drive the face
button by name. Expect the card-face and flyout tests to move together.

## Do not

Fix this on one card kind. It was tried twice on 2026-08-04 (mesh error face
retyped to `redeploy`, then mesh face verbs dropped for stale/error) and both
produced a mesh that disagreed with every integration beside it. Reverted; only the
mesh Remove wiring from that session shipped.
