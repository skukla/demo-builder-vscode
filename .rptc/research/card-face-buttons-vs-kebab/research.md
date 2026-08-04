# Card face buttons vs the kebab

**Date:** 2026-08-04
**Type:** Hybrid — codebase inventory + Adobe Spectrum design guidance
**Question:** Should card tiles carry an inline action button on the face, or should
every verb live in the kebab? Asked of the mesh card; answered for every tile.
**Backlog item:** `.rptc/backlog/2026-08-04-card-face-buttons-vs-kebab.md`

## Summary

The integrations surface is the only place in the extension with a card-face action
button. Every other tile — projects, prompts — puts all verbs in the kebab and makes
the card body itself the affordance that opens the detail view. Adobe's own Spectrum
guidance points the same way. **Recommendation: remove face buttons, move their verbs
into the kebab, and keep the card body as the open-detail affordance.** Confidence:
high on the direction, medium on the treatment for a never-deployed card.

## Finding 1 — face buttons exist on exactly one surface (confidence: high)

Inventory of every tile that renders actions:

| Surface | Card body | Face button | Kebab |
|---|---|---|---|
| `ProjectCard` (projects dashboard) | `role="button"` → opens project | **none** | `ProjectActionsMenu`, sectioned |
| `PromptCard` (AI surface) | `role="button"` | **none** | `CardActionsMenu` |
| `IntegrationCard` (integrations) | `role="button"` → opens flyout | **`IntegrationFaceButton`** | `IntegrationActionsMenu` |
| `IntegrationDetailPanel` (the flyout) | — | **`IntegrationFaceButton`** | `IntegrationActionsMenu` |

`GitHubServiceCard` / `DaLiveServiceCard` are status panels, not action tiles, and
carry neither.

So "should a card have a face button" is not an open question across the codebase —
it is settled everywhere except one feature, which diverged.

## Finding 2 — the divergence left a fingerprint (confidence: high)

`IntegrationCard.tsx` is itself `role="button"` with an `onClick` that opens the
flyout. Its face button therefore renders inside a `stopPropagation` wrapper:

```tsx
<span onClick={stopPropagation} onKeyDown={stopPropagation}>
    <IntegrationFaceButton model={model} onAction={onAction} />
</span>
```

A control that must suppress its own container's primary gesture is a control
competing with it. `ProjectCard` needs no such wrapper, because its kebab
(`CardActionsMenu`) already contains its own clicks and nothing else on the face is
interactive.

The integration tile carries **three** affordances — body, face button, kebab — where
the house pattern carries two.

## Finding 3 — the verb vocabulary over-names what it controls (confidence: high)

Face verbs come from two matrices, and the labels do not map 1:1 to operations.

| Status | Integration face | Mesh face | Kebab redeploy? |
|---|---|---|---|
| not-deployed | Deploy | Deploy | no |
| stale | Update | Update | no |
| error | Retry | Retry | no |
| deployed | — | — | **yes** |
| needs-auth | — | Sign in | no |

Behind them:

- **Integrations** — `KEYED_MESSAGES` maps `deploy`/`retry` →
  `deployAppBuilderComponent`, `update`/`redeploy` → `redeployAppBuilderComponent`.
  Four labels, **two** calls.
- **Mesh** — `handleMeshAction` routes every verb except `sign-in` to
  `onDeployMesh()`. Four labels, **one** call.

Consequence, and the reported symptom: Redeploy is a kebab item only on a healthy
card, so in every state where something is wrong the same operation appears on the
face under a different name. On an errored mesh the kebab's Redeploy is simply
absent, which is what prompted the question.

This asymmetry is why a mesh-only fix cannot work. It was attempted twice on
2026-08-04 — retyping the mesh's error face to `redeploy`, then dropping mesh face
verbs for stale/error — and both produced a mesh that disagreed with every
integration beside it. Both reverted.

## Finding 4 — Spectrum says the same thing (confidence: medium-high)

Two independent statements from Adobe's Spectrum design team:

1. **Cards are meant to be simple.** Card "quick actions" — inline action buttons on
   the face — were slated for removal from the pattern. Additional actions belong in
   an action bar and/or a **detail view (side panel)**.
2. **Spectrum cards use an Action button as the "more" menu trigger** — which is
   exactly what `CardActionsMenu` renders.

Sourcing note: this came from Adobe-internal channels. This repository is public, so
the conclusion is recorded here and the sources are not. Anyone re-verifying should
route through the `adobe-docs-lookup` skill rather than re-deriving.

**Could not read:** `spectrum.adobe.com/page/cards/` is a client-rendered Next.js app
and returns an empty shell to `fetch`, `raw` included. The public page was not read —
this is "could not read it", not "it does not say it". If public citation is ever
needed, that page must be opened in a browser.

## Options

### A. No face buttons anywhere — kebab carries every verb (recommended)

The card body stays the open-detail affordance; the kebab carries Deploy, Redeploy,
Manage APIs, Remove. Matches `ProjectCard` exactly, matches Spectrum, and deletes the
`stopPropagation` wrapper along with the whole `FaceAction` concept.

- **For:** one control model across the app; one name per operation; the mesh's
  over-naming problem disappears without a mesh-specific rule; `ProjectActionsMenu`
  already proves sectioned kebabs work here if grouping is wanted.
- **Against:** a never-deployed integration's primary call to action moves behind a
  kebab. This is the one real cost and the reason confidence on treatment is medium.
- **Mitigation:** put the state's verb first in the kebab; the flyout can carry a
  prominent verb, since a side panel is exactly where Spectrum says richer actions
  belong. A never-deployed card could also use its body as the CTA.

### B. Face for state-changing verbs only

Keep Deploy and Sign in on the face (neither is a redeploy); fold Update and Retry
into one kebab Redeploy.

- **For:** preserves one-click action on the two states where nothing works yet.
- **Against:** keeps three affordances on the tile and the `stopPropagation` wrapper;
  still diverges from every other tile; still needs a rule for which verbs qualify.

### C. Keep the face, widen the kebab

Offer Redeploy in the kebab in every actionable state, accepting that the face
duplicates it.

- **For:** smallest change; nothing disappears.
- **Against:** deliberately ships two controls for one action — the exact confusion
  that produced this question.

## Recommendation

**Option A**, in one change across both card kinds. It is the only option that makes
the integrations surface agree with the rest of the app rather than adding a fourth
rule to it, and it has independent support from Spectrum.

Sequence it as: delete `FaceAction`/`FACE_LABELS`/`IntegrationFaceButton` → fold each
status's verb into `buildMenuActions`/`meshMenuActions` → decide the not-deployed
treatment (kebab-first item vs. body-as-CTA) with the card in front of you.

## Blast radius

**Source:** `integrationCardModel.ts` (`INTEGRATION_ACTIONS`, `MESH_MATRIX`,
`FaceAction`, `AttentionKind`, both menu builders), `IntegrationActions.tsx`
(`FACE_LABELS`, `IntegrationFaceButton`), and the two render sites
(`IntegrationCard.tsx`, `IntegrationDetailPanel.tsx`).

**Tests:** 35 `faceAction` assertions across four suites — `integrationCardModel`
(15), `integrationCardModel-mesh` (10), `IntegrationCard` (5),
`IntegrationDetailPanel` (5) — plus the grid action suites, which drive the face
button by accessible name. The mesh matrix suite asserts a face kind per status and
will move wholesale.

Unrelated `faceAction`-shaped matches in `CenteredFeedbackContainer`,
`AuthErrorState`, and `DestinationStage` are different components; they do not move.

## Open questions for the implementer

1. What does a never-deployed card look like without a face button? This is the only
   genuine UX loss in Option A and deserves the prototype, not a guess.
2. Should the integrations kebab adopt `ProjectActionsMenu`'s sections (Use / Manage /
   Delete) once it holds more verbs?
3. Does the flyout keep a prominent verb? Spectrum's guidance suggests a side panel is
   the right home for richer actions, which would argue yes — and that is a different
   question from what the card face does.
