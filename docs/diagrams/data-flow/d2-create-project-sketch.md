# Creating a project, step by step — Sketch

**ID:** d2
**Tier:** canonical
**Anchored in:** [d1 overview](d1-overview-sketch.md)
**Render target:** lucid
**Last rendered hash:**

## Intent (for the diagram producer)

The d1 boxes again, with the arrows numbered in the order a new EDS project is built.
The point is order and dependency: why the storefront exists before Create is pressed,
why the mesh comes before the config files, and why sample data comes before the
catalog pages are warmed. A headless (Next.js) project skips steps 1 to 3, 8b and 10.

## What this shows you (for the reader)

The storefront's repository, content and publishing are set up inside the wizard,
before Create. Pressing Create then provisions Adobe Runtime, clones the components,
deploys the mesh and any apps, writes the project's config, publishes it, loads the
sample data, warms the product pages, and finally writes the AI files.

## Layout

**Type:** swimlane, left to right, same lanes and node positions as d1
**Lanes:** SC's machine | Adobe cloud | Code and content
**Two phases, shown as a dashed divider across all lanes:** "In the wizard (Storefront
area)" above, "After Create" below. Each numbered arrow is a step.

## Arrow/notation convention

- `──►` data flow; the leading number is the step order
- `- - -` phase divider
- `✎N` annotation marker; index matches the Annotations table

## Composite layout

```
════ SC'S MACHINE ══════════╦════ ADOBE CLOUD ═══════════════╦════ CODE AND CONTENT ═════════

 IN THE WIZARD (Storefront area)
                            ║                                ║
 ┌──────────────────────┐   ║                                ║  ┌──────────────────────┐
 │ Extension core  (N2) │───╫── 1 new repo from template ────╫─►│ GitHub          (N10)│
 │                      │   ║                                ║  └──────────────────────┘
 │                      │───╫── 2 site registration, ────────╫─►┌──────────────────────┐
 │                      │   ║     code sync check            ║  │ AEM admin       (N12)│
 │                      │   ║                                ║  └──────────────────────┘
 │                      │───╫── 3 pages + block library, ────╫─►┌──────────────────────┐
 │                      │   ║     then publish          ✎1   ║  │ DA.live         (N11)│
 └──────────────────────┘   ║                                ║  └──────────────────────┘
- - - - - - - - - - - - - - ║ - - - - - - - - - - - - - - - -║- - - - - - - - - - - - - - -
 AFTER CREATE
 ┌──────────────────────┐   ║  ┌────────────────────────┐    ║
 │ Extension core  (N2) │─4─╫─►│ Developer Console +     │   ║
 │                      │   ║  │ Runtime            (N6) │   ║
 │                      │   ║  └────────────────────────┘    ║
 │                      │◄──╫──────── 5 clone components ────╫── GitHub (N10)
 │                      │─6─╫─►┌────────────────────────┐    ║
 │                      │   ║  │ API Mesh           (N7) │   ║
 │                      │   ║  └────────────────────────┘    ║
 │                      │─7─╫─► Developer Console + App Builder (N6): APIs on, apps deployed
 │                      │   ║                                ║
 │                      │─8─╫────── config.json committed ───╫─► GitHub (N10) ─► AEM admin (N12)
 │                      │─9─╫─►┌────────────────────────┐    ║
 │                      │   ║  │ Data installer     (N9) │─► Commerce (N8)
 │                      │   ║  └────────────────────────┘    ║
 │                      │─10╫────── product pages published ─╫─► AEM admin (N12)   ✎2
 └──────┬───────────────┘   ║                                ║
        │ 5, 6, 7 write .env; 8 writes config.json; 11 writes AI files
        ▼
 ┌──────────────────────┐   ║                                ║
 │ Project folder  (N4) │   ║                                ║
 └──────────────────────┘   ║                                ║

KEY   ──► data flow, number = step    - - - phase divider    ✎N annotation
```

Producer cleanup required before using as build reference: (1) open in a fixed-width
font and verify column alignment; (2) check each arrow label lands next to its edge;
(3) verify the lane widths span their contents. The Edges table is the authoritative
checklist.

## Edges table

| # | From | To | Label |
|---|---|---|---|
| E1 | N2 — Extension core | N10 — GitHub | 1. new storefront repo made from the package's template |
| E2 | N2 — Extension core | N12 — AEM admin | 2. code sync checked, site registered with AEM |
| E3 | N2 — Extension core | N11 — DA.live | 3. pages and block library copied, then published |
| E4 | N2 — Extension core | N6 — Developer Console + Runtime | 4. Runtime namespace made ready in the workspace |
| E5 | N10 — GitHub | N2 — Extension core | 5. component source cloned into the project folder |
| E6 | N2 — Extension core | N7 — API Mesh | 6. mesh deployed; endpoint URL comes back |
| E7 | N2 — Extension core | N6 — Developer Console + App Builder | 7. APIs turned on, chosen apps deployed |
| E8 | N2 — Extension core | N4 — Project folder | 8a. .env and config.json written |
| E9 | N2 — Extension core | N10 — GitHub | 8b. config.json committed, then published through AEM admin |
| E10 | N2 — Extension core | N9 — Data installer | 9. chosen datapack installed into Commerce |
| E11 | N2 — Extension core | N12 — AEM admin | 10. every product page published (catalog pre-warm) |
| E12 | N2 — Extension core | N4 — Project folder | 11. AI files written: AGENTS.md, skills, .mcp.json |

## Annotations table

| # | Anchor | Text |
|---|---|---|
| ✎1 | E3 — pages copied | The storefront is live before Create is pressed. Creation adds its config and data afterwards. |
| ✎2 | E11 — product pages | Warming happens after the sample data, because there are no product pages to publish before it. |

## Sources

- Creation order after Create: `src/features/project-creation/handlers/executor.ts`
- Storefront setup in the wizard, phases 1 to 3 and the content pipeline:
  `src/features/eds/handlers/storefrontSetup/storefrontSetupPhases.ts`,
  `storefrontSetupPhase1.ts`, `storefrontSetupPhase2.ts`, `storefrontSetupPhase3.ts`
- Content pipeline steps: `src/features/eds/services/edsPipeline.ts`
- Mesh: `src/features/project-creation/handlers/executorMeshPhase.ts`
- App Builder: `src/features/project-creation/handlers/executorAppBuilderPhase.ts`
- Config sync and publish: `src/features/project-creation/handlers/executorEdsPhase.ts`
- Sample data: `src/features/project-creation/handlers/executorSampleDataPhase.ts`
- Catalog pre-warm: `src/features/project-creation/services/catalogPrewarmPhase.ts`

## Related artifacts

- Overview: [d1](d1-overview-sketch.md)
- Lucid doc: see the table in [README.md](README.md)

## Producer notes

