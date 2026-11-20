# How Demo Builder moves data — overview — Sketch

**ID:** d1
**Tier:** canonical
**Anchored in:** [docs/architecture/overview.md](../../architecture/overview.md)
**Render target:** lucid
**Last rendered hash:**

## Intent (for the diagram producer)

The one-page picture. Every outside system the extension reads from or writes to,
grouped by who owns it, with each arrow labelled by the data it carries. It answers
"what does this extension actually touch?" for someone who has never opened it. The
three detail diagrams (d2 to d4) zoom in on parts of this one; this one stays
deliberately coarse, one box per system.

## What this shows you (for the reader)

Demo Builder runs on the SC's laptop and builds a demo out of three kinds of cloud
service: Adobe's (sign-in, App Builder, API Mesh, Commerce), the storefront's code and
content (GitHub, DA.live, AEM), and the project folder on disk that ties them together.
The buttons and the AI agent go through the same core, so they reach the same systems.

## Layout

**Type:** swimlane, left to right
**Lanes (vertical columns, left to right):** SC's machine | Adobe cloud | Code and content

## Arrow/notation convention

- `──►` data flow (label carries the data)
- `◄─►` both directions; label reads "out / back"
- `✎N` annotation marker; index matches the Annotations table

## Composite layout

```
════ SC'S MACHINE ════════════╦════ ADOBE CLOUD ═════════════════╦════ CODE AND CONTENT ════════════

 ┌────────────────────────┐    ║                                  ║
 │ Wizard + dashboard  (N1)│   ║  ┌─────────────────────────┐     ║  ┌─────────────────────────┐
 │ screens (webviews)      │   ║  │ Adobe sign-in (IMS) (N5)│     ║  │ GitHub             (N10)│
 └───────────┬────────────┘    ║  └────────────┬────────────┘     ║  │ templates, components,  │
     E1 ◄─►  │ clicks / progress║     E4 token  │                  ║  │ the SC's storefront repo│
 ┌───────────┴────────────┐    ║               ▼                  ║  └────────────┬────────────┘
 │ Extension core      (N2)│◄──╫───────────────┘                  ║   E9 ◄─► clone / new repo,
 │ handlers + services     │   ║                                  ║        config.json commits
 │ driven by the catalogs  │◄──╫─E5─► ┌───────────────────────┐   ║               │
 │ (components, stacks,    │   ║      │ Developer Console  (N6)│  ║  ┌────────────┴────────────┐
 │  demo packages)  ✎3     │   ║      │ + App Builder / Runtime│  ║  │ DA.live            (N11)│
 └──┬─────────┬──────────┬─┘   ║      └──────────┬────────────┘   ║  │ page content            │
    │         │          │     ║   E14 installs  │ events         ║  └────────────┬────────────┘
    │ E3      │          └─E6─►║  ┌──────────────▼──────────┐     ║  E10 pages copied, site config
    ▼         │                ║  │ API Mesh            (N7)│     ║  ┌────────────┴────────────┐
 ┌──────────────────────┐      ║  └──────────────┬──────────┘     ║  │ AEM admin          (N12)│
 │ Project folder   (N4)│ ✎1   ║     E15 queries │                ║  │ publish + site config   │
 │ .env, config.json,   │      ║  ┌──────────────▼──────────┐     ║  └────────────┬────────────┘
 │ manifest, AI files   │      ║  │ Commerce           (N8) │     ║        E12 publish │
 └──────────────────────┘      ║  │ + Catalog Service / ACO │     ║  ┌────────────▼────────────┐
                               ║  └──────────────▲──────────┘     ║  │ Live storefront    (N13)│
 ┌──────────────────────┐      ║     E8b sample  │ data           ║  │ aem.live            ✎2  │
 │ Agent tools (MCP)(N3)│─E2─► N2 ┌─────────────┴───────────┐     ║  └─────────────────────────┘
 │ AI agent in the       │     ║  │ Data installer     (N9) │     ║
 │ project folder        │     ║  │ service                 │     ║
 └──────────────────────┘      ║  └─────────────────────────┘     ║

KEY   ──► data flow    ◄─► both directions    ✎N annotation
```

Producer cleanup required before using as build reference: (1) open in a fixed-width
font and verify column alignment; (2) check each arrow label lands next to its edge;
(3) verify the lane widths span their contents. Edge routing here is topologically
correct; pixel alignment is best-effort. The Edges table is the authoritative checklist.

## Edges table

| # | From | To | Label |
|---|---|---|---|
| E1 | N1 — Wizard + dashboard | N2 — Extension core | button clicks out / progress and results back (messages only) |
| E2 | N3 — Agent tools (MCP) | N2 — Extension core | tool calls, into the same handlers as the buttons |
| E3 | N2 — Extension core | N4 — Project folder | writes .env, config.json, project manifest, AI files |
| E4 | N5 — Adobe sign-in | N2 — Extension core | sign-in token, bound to one Adobe org (via aio CLI) |
| E5 | N2 — Extension core | N6 — Developer Console + App Builder | create project and workspace, turn on APIs, deploy apps / workspace config and app URLs back |
| E6 | N2 — Extension core | N7 — API Mesh | mesh definition out / mesh endpoint URL back |
| E7 | N2 — Extension core | N8 — Commerce | store discovery out / store structure back |
| E8 | N2 — Extension core | N9 — Data installer service | datapack install and removal jobs out / job status back |
| E8b | N9 — Data installer service | N8 — Commerce | sample products, customers, categories |
| E9 | N10 — GitHub | N2 — Extension core | templates and component source (clone) / new storefront repo and config.json commits out |
| E10 | N2 — Extension core | N11 — DA.live | pages copied from the template site, site config |
| E11 | N2 — Extension core | N12 — AEM admin | preview, publish, site registration |
| E12 | N12 — AEM admin | N13 — Live storefront | published pages; code arrives from GitHub via the AEM Code Sync app |
| E13 | N13 — Live storefront (template site) | N2 — Extension core | template pages read for copying |
| E14 | N6 — App Builder | N8 — Commerce | deployed apps install into Commerce and receive its events |
| E15 | N7 — API Mesh | N8 — Commerce | storefront queries to Commerce and Catalog Service |

## Annotations table

| # | Anchor | Text |
|---|---|---|
| ✎1 | N4 — Project folder | Passwords and keys stay in VS Code's secret store. Shared project files carry no credentials. |
| ✎2 | N13 — Live storefront | Every step that creates something here has a reverse: reset and delete take it back off the internet. |
| ✎3 | N2 — Extension core | Adding support for something is usually a row in a catalog file, not new code. |

## Sources

- Webviews talk to the extension by messages only: `docs/architecture/overview.md`
- Agent tools dispatch into the same handlers: `src/features/ai/server/toolDescriptors.ts`, `docs/systems/mcp-server.md`
- Project folder contents: `src/core/state/projectConfigWriter.ts`, `docs/systems/project-file-format.md`
- Sign-in and org binding: `src/features/authentication/services/authenticationService.ts`, `docs/architecture/adobe-setup.md`
- Console and App Builder: `src/features/app-builder/services/appBuilderComponentRunner.ts`
- API Mesh: `src/features/mesh/services/meshDeployment.ts`
- Store discovery: `src/features/eds/services/commerceStoreDiscovery.ts`
- Data installer: `docs/systems/data-installer.md`
- GitHub: `src/features/eds/services/github/githubRepoOperations.ts`
- DA.live content copy: `src/features/eds/services/daLive/daLiveContentCopy.ts`
- AEM admin: `src/features/eds/services/helix/helixApiClient.ts`
- Teardown order: `src/features/eds/services/storefront/storefrontTeardown.ts`
- Catalogs: `src/features/components/config/components.json`, `stacks.json`, `demo-packages.json`

## Related artifacts

- Detail diagrams: d2 (creation order), d3 (storefront), d4 (App Builder)
- Lucid doc: see the table in [README.md](README.md)

## Producer notes

