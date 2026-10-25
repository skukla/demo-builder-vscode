# Share dialogs overlap: Export "Send a link" vs "Save as demo package"

Date: 2026-10-22. Research. **Built the same day** (owner: "I do want the merged share
dialog"): the dashboard's Share Demo dialog in `src/features/dashboard/ui/components/share/`.
The paths below under `export/` and `demo-package/` describe the code as it was before that.
Asked by the owner while reviewing the JustRite project's dashboard.

## The short answer

They are the same job. Both buttons end in the same handler, `saveDemoPackage`, and that
handler always does the same three writes. The only real differences are what each dialog
SHOWS before the write: Save as demo package lets the SC edit the name and description and
shows "What colleagues get"; Export's link form hides both and writes the prefilled draft.
Export also adds the card to the SC's own Welcome step, and before today said nothing about
it (its button now reads "Save details and copy link" when it will write).

## Path 1: Export, "Send a link"

| Step | Where | What it does |
|---|---|---|
| Tile "Export" | `src/features/dashboard/ui/components/ShareZone.tsx` | opens `ExportModal` |
| Open | `export/ExportModal.tsx` `useStorefrontState` | `getDemoPackagePreview` (a read) |
| Show | `LinkCopy` | the link, one line, one button. The preview's `checks` arrive and are NOT shown |
| Press, file not yet ours (`preview.saved` false) | `LinkCopy.copy` | `saveDemoPackage` with `preview.draft` (no editing), then `navigator.clipboard.writeText(link)` |
| Press, file already ours | `LinkCopy.copy` | clipboard only |

`preview.saved` is `Boolean(project.demoPackage?.fileSha)`
(`src/features/dashboard/handlers/demoPackageHandlers.ts`, `handleGetDemoPackagePreview`).
Edge case: when the repository already holds a description file Demo Builder did not write,
the save answers `skipped` and records an empty `fileSha`, so `saved` stays false and every
press repeats the save (re-adding the Welcome card, writing nothing to the repository).

## Path 2: "Save as Package"

| Step | Where | What it does |
|---|---|---|
| Tile "Save as Package" (Edge Delivery only) | `ShareZone.tsx` | opens `DemoPackageModal` |
| Open | `demo-package/useDemoPackage.ts` | the same `getDemoPackagePreview` |
| Show | `demo-package/DemoPackageSection.tsx` | Name and Description fields (prefilled), "What colleagues get" checks, the link once saved |
| Save / Update | `useDemoPackage.save` | `saveDemoPackage` with the EDITED name and description |
| Remove demo package | `useDemoPackage.remove` | `removeDemoPackage` |

## The shared write: `handleSaveDemoPackage`

`src/features/dashboard/handlers/demoPackageHandlers.ts`. Every call does all three:

1. **Repository file.** `writeSharedDemoFile` (`src/features/eds/services/demoPackage/sharedDemoFile.ts`)
   commits `demo.demo-builder.json` (`SHARED_DEMO_FILE_NAME`, `src/types/projectFile.ts`) to the
   storefront repository's default branch, built by `describeProject`
   (`demoPackageService.ts`): name, description, store codes (`configDefaults`), config flags,
   mesh posture, datapack, integrations, block libraries, content source, `builtWith`. It
   rewrites only a file whose blob sha matches the one it recorded (ADR-013 rule, by sha).
2. **The SC's own Welcome card.** `rememberAddedDemo(cardFor(...))` appends to the user-scoped
   setting `demoBuilder.demos.added` (`src/features/project-creation/services/addedDemoSettings.ts`).
   The card is built from the description in memory, not re-read from the repository.
3. **The project record.** `project.demoPackage = { fileSha, savedAt }`, saved by the state manager.

There is no parameter that skips any of the three.

Undo: `handleRemoveDemoPackage` removes the file only on sha proof, takes the card off the
list, and deletes `project.demoPackage`. Reachable from the Save as demo package dialog and
the agent tool only; Export has no undo of its own. The Welcome card also has its own
Remove (card only).

## What the colleague's "Add a demo package" reads

- `src/features/eds/services/storefront/sharedDemoProbe.ts` reads the repository (read-only),
  including `demo.demo-builder.json` when present; the file outranks `config.json` and the
  dependency list.
- `defaultDemoName` (`src/features/project-creation/ui/components/add-demo/addDemoFlow.ts`)
  prefills the card name from the file, else from the repository name spelled for people.
  The colleague can edit the name before adding.
- `handleAddSharedDemo` (`src/features/eds/handlers/addSharedDemoHandler.ts`) remembers the
  row in the colleague's own `demoBuilder.demos.added`. Nothing is written on GitHub.

So without the file a colleague still gets a working card, under the repository's name, but
loses what only the file carries: the description, datapack, integrations, block libraries
and the `builtWith` record.

## Agent surface

`src/features/ai/server/demoPackageTools.ts`:

| Tool | Handler | Notes |
|---|---|---|
| `get_demo_package_preview` | `handleGetDemoPackagePreview` | read |
| `save_demo_package` | `handleSaveDemoPackage` | `confirm:true`; the refusal names the file and the Welcome card |
| `remove_demo_package` | `handleRemoveDemoPackage` | `confirm:true`, destructive |
| `export_demo_bundle` | `handleExportDemoBundle` | file form only; its description says "Prefer sharing a link (save_demo_package)" |

The agent already has ONE door for the link (save_demo_package). There is no agent
counterpart to Export's "copy", which is right: copying to a clipboard is a human act.
So the agent surface already models this as one job.

## Are they the same job?

Yes. Both make the repository carry the description so a link gives a colleague a proper
card, and both put the card on the SC's own Welcome step. What differs:

| | Export link | Save as demo package |
|---|---|---|
| Name and description | prefilled, not editable | editable |
| "What colleagues get" checks | read, not shown | shown |
| Writes file, card, record | yes, on first press | yes |
| Says it writes | button label (since today) | Save button, plus the saving spinner text |
| Undo | none in the dialog | Remove demo package |
| Copies the link | yes | link shown with a copy control after saving |
| Headless project | says "no storefront", offers file | tile hidden |

## Does an SC ever need one without the other?

- **A link without a card on my own Welcome step.** Plausible (handing over a one-off demo
  without cluttering your own grid), and impossible today: both paths add the card.
- **A card on my Welcome step without sharing.** Already possible: save and do not send the
  link. The repository file is written either way. The own card does not itself need the
  file (it is built in memory), so a "card only" save would be a new mode; no one has asked.
- **The checks before sending.** Export hides "This storefront's code is private" from the
  person about to send the link, which is the moment it matters most. This is a gap, not a
  reason to keep two dialogs.

## Recommendation: one Share dialog

Merge "Save as Package" into Export's link form and remove the separate tile.

- Tile: keep **Export** (or rename to **Share** if the owner prefers; the zone is already
  titled Share). Remove the **Save as Package** tile from `ShareZone.tsx`.
- Dialog, "Send a link" form, top to bottom:
  - The link and the one line: `Colleagues paste this into "Add a demo package" and get your code, content and later changes.`
  - A warning notice only when a check fails (for example "This storefront's code is
    private. Colleagues will need access to it, or make it public."). Passing checks stay
    quiet, so the form stays short.
  - A quiet link **Change name or description**, which opens the two fields (prefilled).
  - A checkbox **Also show it on my Welcome step** (ticked by default, matching today).
  - The button: **Save details and copy link** while the repository lacks the file or the
    fields changed; **Copy link** once they match.
  - When saved, a quiet **Remove the details from my repository** (today's Remove demo
    package), so the write has its undo in the same place.
- "Send a file" form: unchanged.

Code that would move:

- `DemoPackageSection` fields and checks into `ExportModal`'s link form;
  `useDemoPackage` becomes the link form's state (it already owns preview, save, remove).
  `DemoPackageModal.tsx` and the tile prop `handleSaveDemoPackage` are deleted (no soft
  deprecation).
- `SaveDemoPackageRequest` gains `addToWelcome?: boolean`; `handleSaveDemoPackage` skips
  `rememberAddedDemo` when it is false. The type, the handler and the MCP schema change
  together.
- `save_demo_package` gains the same `addToWelcome` argument so the agent matches the button.
- `docs/systems/sharing-a-demo.md` (both sections) and `docs/systems/mcp-tools.md`.

Tests that pin the current two (all would move or change):

- `tests/features/dashboard/ui/components/export/ExportModal.test.tsx` (+ `.testUtils.tsx`)
- `tests/features/dashboard/ui/components/demo-package/DemoPackageModal.test.tsx` (+ `.testUtils.tsx`)
- `tests/features/dashboard/ui/components/DashboardDialogs.test.tsx`
- `tests/features/dashboard/ui/components/ActionGrid-overflow.test.tsx`
- `tests/features/dashboard/ui/ProjectDashboardScreen-actions.test.tsx`,
  `-export.test.tsx`, `-demoSource.test.tsx`
- `tests/features/dashboard/handlers/demoPackageHandlers.test.ts`,
  `dashboardHandlers-map.test.ts`
- `tests/features/ai/server/demoPackageTools.test.ts`, `responseCeilings.ts`,
  `tests/sop/tool-auth-declarations.test.ts`, `tests/core/communication/requestTimeouts.test.ts`
- `tests/templates/sharing-a-demo-doc.test.ts` (the doc pin)

Not traced here: whether building a NEW project from the SC's own card re-reads the
repository file or only the settings row. That decides whether "Also show it on my Welcome
step" without the repository write is a mode worth offering; the recommendation above does
not need it.
