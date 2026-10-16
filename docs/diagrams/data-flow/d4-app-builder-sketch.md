# App Builder apps and the API Mesh — Sketch

**ID:** d4
**Tier:** topic
**Anchored in:** [src/features/app-builder/README.md](../../../src/features/app-builder/README.md)
**Render target:** lucid
**Last rendered hash:**

## Intent (for the diagram producer)

Zoom into the middle lane of d1. Adding an app or a mesh is one path for both: pick
from the catalog, clone the source, turn on the APIs it needs, deploy, record it. The
diagram shows where credentials come from and that they are handed to the deploy
rather than written into the project, and how an app's endpoint flows back into the
storefront.

## What this shows you (for the reader)

Each app or mesh starts as a catalog entry pointing at a GitHub repository. The
extension clones it, turns on the Adobe APIs it needs in the project's Developer
Console workspace, and deploys it to App Builder. Apps then install themselves into
Commerce; a mesh's endpoint is written into the storefront's config.

## Layout

**Type:** swimlane, left to right
**Lanes:** SC's machine | Adobe Developer Console + App Builder | Commerce and storefront

## Arrow/notation convention

- `──►` data flow; leading number is the order within one add
- `✎N` annotation marker; index matches the Annotations table

## Composite layout

```
════ SC'S MACHINE ════════════╦════ DEVELOPER CONSOLE + APP BUILDER ══╦════ COMMERCE + STOREFRONT ═══
                              ║                                       ║
 ┌────────────────────────┐   ║                                       ║
 │ App catalog        (N1)│   ║                                       ║
 │ app-builder-components │   ║                                       ║
 └───────────┬────────────┘   ║                                       ║
             │ 1 chosen app   ║                                       ║
 ┌───────────▼────────────┐   ║  ┌──────────────────────────────┐     ║
 │ Extension core     (N2)│─2─╫─►│ Workspace: APIs turned on (N4)│    ║
 │                         │◄3─╫──│ credentials, Runtime namespace│ ✎1 ║
 │                         │   ║  └──────────────────────────────┘     ║
 │                         │◄──╫── 4 clone ── GitHub app repos (N3)    ║
 │                         │─5─╫─►┌──────────────────────────────┐     ║  ┌─────────────────────────┐
 │                         │   ║  │ App Builder / Runtime    (N5)│─7──╫─►│ Commerce           (N7) │
 │                         │◄6─╫──│ deployed actions, app URL     │    ║  │ app installed, events   │
 │                         │   ║  └──────────────────────────────┘     ║  └─────────────────────────┘
 │                         │─5m╫─►┌──────────────────────────────┐     ║
 │                         │◄6m╫──│ API Mesh                 (N6)│─────╫─► Commerce + Catalog Service
 └───────────┬────────────┘   ║  └──────────────────────────────┘     ║
     8 record│  9 endpoint     ║                                       ║  ┌─────────────────────────┐
             ▼  into config ───╫───────────────────────────────────────╫─►│ Storefront config  (N8) │
 ┌────────────────────────┐   ║                                       ║  │ config.json, republished│
 │ Project folder     (N9)│   ║                                       ║  └─────────────────────────┘
 │ manifest: one entry per│ ✎2║                                       ║
 │ app or mesh             │  ║                                       ║
 └────────────────────────┘   ║                                       ║

KEY   ──► data flow, number = order    ✎N annotation
```

Producer cleanup required before using as build reference: (1) open in a fixed-width
font and verify column alignment; (2) check each arrow label lands next to its edge;
(3) verify the lane widths span their contents. The Edges table is the authoritative
checklist.

## Edges table

| # | From | To | Label |
|---|---|---|---|
| E1 | N1 — App catalog | N2 — Extension core | 1. the chosen app or mesh, with its repo and the APIs it needs |
| E2 | N2 — Extension core | N4 — Workspace | 2. every API that any of the project's apps needs, turned on in one request |
| E3 | N4 — Workspace | N2 — Extension core | 3. workspace config: credentials and Runtime namespace |
| E4 | N3 — GitHub app repos | N2 — Extension core | 4. app source cloned into the project folder |
| E5 | N2 — Extension core | N5 — App Builder / Runtime | 5. app deployed; credentials passed to the deploy, not saved |
| E6 | N5 — App Builder / Runtime | N2 — Extension core | 6. app URL |
| E5m | N2 — Extension core | N6 — API Mesh | 5m. mesh definition deployed |
| E6m | N6 — API Mesh | N2 — Extension core | 6m. mesh endpoint URL |
| E7 | N5 — App Builder / Runtime | N7 — Commerce | 7. app installed into Commerce; Commerce events delivered to it |
| E8 | N2 — Extension core | N9 — Project folder | 8. app recorded in the project manifest |
| E9 | N2 — Extension core | N8 — Storefront config | 9. endpoint the app provides (e.g. the mesh URL) written into config.json and republished |

## Annotations table

| # | Anchor | Text |
|---|---|---|
| ✎1 | N4 — Workspace | Each extra ERP connection gets a workspace of its own. |
| ✎2 | N9 — Project folder | Removing an app undeploys it first, then deletes only that app's files and record. |

## Sources

- The add flow, in order: `src/features/app-builder/services/appBuilderComponentRunner.ts`
- Catalog: `src/features/components/config/app-builder-components.json`
- One request for all APIs: `src/features/app-builder/services/apiSubscriber.ts`
- Credentials passed as environment only: `src/features/app-builder/services/runtimeCredentials.ts`
- Deploy: `src/features/app-builder/services/appDeployment.ts`
- Install into Commerce: `src/features/app-builder/services/appManagementInstaller.ts`
- Mesh deploy: `src/features/mesh/services/meshDeployment.ts`
- One workspace per extra ERP: `docs/systems/erp-integration.md`
- One state map for apps and mesh: `src/features/app-builder/README.md`

## Related artifacts

- Overview: [d1](d1-overview-sketch.md)
- Lucid doc: see the table in [README.md](README.md)

## Producer notes

