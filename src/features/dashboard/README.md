# Dashboard

The panel a user spends their time in once a project exists: start it, open it,
configure it, fix what has drifted.

## The rule that governs this feature

**Where a status goes** is documented at the top of
`ui/components/ActionGrid.tsx`, in the component it governs, and that is where it
should be read. In summary:

- **Environment health** — whether the tooling works at all (AI Ready, IMS Org) —
  goes in the masthead band. It would still mean something on an empty project.
- **Artifact state** — the frontend, the mesh, the integrations — is carried by a
  **remedy tile**: the button that fixes it, wearing an amber dot when the fix is
  due, with a tooltip saying why.

The Frontend badge broke that rule and is why it exists: it sat in the band while
its remedies sat in the grid, so it was the only status that named a problem and
offered nothing.

Every dotted tile goes through `DashboardTile`, whose `status` prop carries the dot
and its wording **as one value** — a dot with no explanation is not expressible.
The integrations tile shipped a naked one for months before that was enforced.

Which tile takes the dot matters: **Republish**, not Sync Storefront, because Sync
pushes storefront *code* and never clears the drift it would appear to fix.

**Draft Examples** (Storefront zone, EDS-71 step 4c) is a remedy tile whose fix is the
SC's AI: its amber dot counts the blocks the last DA.live block list build left with no
example (`metadata.blocksNeedingExamples`, read into the status payload), hover "13 blocks
have no example", and pressing it sends the seeded **Draft Block Examples** prompt through
`openInClaude`, the door the prompts list's cards use. A promote takes a block off the count.

## Three handler maps, three surfaces

| map | surface |
|---|---|
| `dashboardHandlers` | the project dashboard |
| `configureHandlers` | the Configure screen |
| `aiHandlers` | the standalone AI surface |

AI prompts are **scope-routed by `pinned`**: a pinned prompt persists in globalState
and appears in every project, an unpinned one in that project's manifest. Toggling
the pin is a cross-scope move, not a flag flip. Two starter prompts are seeded once into
the global store (`defaultPromptsSeeder`): Create an EDS demo project, and Draft Block
Examples (`draftBlockExamplesPrompt.ts`, the same text the Draft Examples tile sends).

## Related

- [`webview-command-handler`](../../../.claude/skills/webview-command-handler/SKILL.md)
  — adding a message this feature handles
- [`spectrum-webview-ui`](../../../.claude/skills/spectrum-webview-ui/SKILL.md) — the
  Spectrum traps these surfaces hit

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). Hooks are the service layer here: a component renders, and the state machine lives in a hook (ADR-017). Handlers return their result rather than pushing it.
