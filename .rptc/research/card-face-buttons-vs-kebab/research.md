# Card face buttons vs the kebab

**Date:** 2026-08-04
**Type:** Hybrid — codebase inventory + Adobe Spectrum design guidance
**Question:** Should card tiles carry an inline action button on the face, or should
every verb live in the kebab? Asked of the mesh card; answered for every tile.
**Backlog item:** `.rptc/backlog/2026-08-04-card-face-buttons-vs-kebab.md`

## Summary

The integrations surface is the only place in the extension with a card-face action
button. Every other tile — projects, prompts — puts all verbs in the kebab and makes
the card body itself the affordance that opens the detail view. Spectrum deprecated
that face button ("quick actions") and names our exact failure mode as the reason.
**Recommendation: remove face buttons, move their verbs into the kebab, and keep the
card body as the open-detail affordance.** Confidence: high on the direction, medium
on the treatment for a never-deployed card.

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

## Finding 4 — Spectrum names this exact pattern and rejects it (confidence: high)

[spectrum.adobe.com/page/cards](https://spectrum.adobe.com/page/cards/) carries a
section headed **"Don't use quick actions"** — a quick action being an inline button on
the card face. Its stated reason describes our tile precisely:

> Quick actions — a deprecated component — presents conflicting nested actions (for
> example, a whole asset card could open a detailed view). This makes targeting specific
> actions very difficult, especially on smaller screens or with the keyboard.

"A whole card could open a detailed view" **is** `IntegrationCard`: `role="button"`,
`onClick` → open the flyout. The `stopPropagation` wrapper in Finding 2 is the
conflicting-nested-action problem Spectrum deprecated the component over, reproduced by
hand.

Three more rules from the same page, all pointing the same way:

- **"Keep cards simple"** is its own guidance section.
- "Any type of card can have an **action menu**, which is placed on the right side of the
  header" — the kebab is the sanctioned control, and `CardActionsMenu` already renders it
  in the sanctioned place.
- "If a card has other interactive elements (e.g., a hidden action menu or an avatar) but
  **no buttons, the whole card (outside of those elements) should be clickable**." That is
  exactly Option A: kebab plus a clickable body, no face button.

Spectrum's replacement for quick actions is an **action bar** for single and bulk
selection — a selection-mode surface, not a per-card control. We have no selection mode,
so for us the guidance collapses to: action menu on the card, richer actions in the
detail view.

Method note: this page is a client-rendered Next.js app and returns an empty shell to
`fetch`, `raw` included. It was read with the Playwright MCP browser
(`browser_navigate` + `browser_evaluate`). An earlier pass recorded it as "could not
read" and fell back to Adobe-internal channels for the same conclusion; the public page
says it plainly and is citable, which the internal sources were not.

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
