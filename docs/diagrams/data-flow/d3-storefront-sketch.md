# The EDS storefront: code, content, publishing — Sketch

**ID:** d3
**Tier:** topic
**Anchored in:** [docs/architecture/eds-content-separation.md](../../architecture/eds-content-separation.md)
**Render target:** lucid
**Last rendered hash:**

## Intent (for the diagram producer)

Zoom into the right-hand lane of d1. An Edge Delivery storefront is two things kept in
two places, code in GitHub and pages in DA.live, and AEM joins them. This diagram
shows where each piece comes from, which sign-in each call uses, and what the live
site reads. It is the diagram to point at when a storefront is half-working.

## What this shows you (for the reader)

The storefront's code comes from a template repository and lands in the SC's own
GitHub repo. Its pages are copied from the template's live site into the SC's DA.live
site. AEM is told that the two belong together, and publishing makes the result live
on aem.live, where it reads Commerce through the project's config.json.

## Layout

**Type:** block, three bands top to bottom
**Bands:** Sources (what is copied from) | The SC's storefront (what is made) | Live (what visitors see)
**Left column:** Extension core spans the Sources and SC bands, since it drives every copy.

## Arrow/notation convention

- `──►` data flow (label carries the data)
- `[sign-in]` the credential a call uses, shown in brackets on the edge label
- `✎N` annotation marker; index matches the Annotations table

## Composite layout

```
════════ SOURCES ══════════════════════════════════════════════════════════════════════════
 ┌──────────────────────────┐  ┌───────────────────────────┐  ┌─────────────────────────┐
 │ Template repo       (N2) │  │ Patches + block libraries │  │ Template content site   │
 │ GitHub                    │  │ GitHub               (N4) │  │ aem.live           (N5) │
 └────────────┬─────────────┘  └─────────────┬─────────────┘  └────────────┬────────────┘
   E1 code    │                 E2 blocks,   │ patches,          E3 pages  │ read
   [GitHub]   │                 brand assets │ [GitHub]          (public)  │
 ┌───┐        ▼                              ▼                             ▼
 │ E │ ═══ THE SC'S STOREFRONT ════════════════════════════════════════════════════════════
 │ x │  ┌──────────────────────────┐                          ┌─────────────────────────┐
 │ t │  │ SC's storefront repo (N3)│                          │ SC's DA.live site  (N6) │
 │ . │  │ code, fstab.yaml,         │── E5 fstab.yaml points ─►│ org = GitHub owner  ✎1  │
 │   │  │ config.json               │   at this content        └────────────┬────────────┘
 │ c │  └────────────┬─────────────┘                                        │
 │ o │     E6 code   │ (AEM Code Sync app)                                  │ E7 pages
 │ r │               ▼                                                      ▼
 │ e │  ┌─────────────────────────────────────────────────────────────────────────────┐
 │   │  │ AEM admin                                                              (N8)  │
 │(N1│  │ site registration (keyed by GitHub owner/repo) ✎2  +  preview / publish      │
 └───┘  └──────────────────────────────────────┬──────────────────────────────────────┘
                                               │ E9 publish  [DA.live + GitHub sign-ins]
 ════════ LIVE ════════════════════════════════▼══════════════════════════════════════════
        ┌─────────────────────────────┐       ┌──────────────────────────┐
        │ Live storefront   (N9)  ✎3  │─ E10 ─►│ Commerce, via the API    │
        │ main--{repo}--{owner}.aem.live│ reads │ Mesh or directly    (N10)│
        └─────────────────────────────┘ config └──────────────────────────┘

 N1 (Extension core) drives: E1, E2 into N3; E4 copies N5 → N6; E8 registers with N8;
 E11 commits config.json into N3.

KEY   ──► data flow    [x] sign-in used    ✎N annotation
```

Producer cleanup required before using as build reference: (1) open in a fixed-width
font and verify column alignment; (2) check each arrow label lands next to its edge;
(3) verify the band widths span their contents. The Edges table is the authoritative
checklist.

## Edges table

| # | From | To | Label |
|---|---|---|---|
| E1 | N2 — Template repo | N3 — SC's storefront repo | repo made from the template [GitHub] |
| E2 | N4 — Patches + block libraries | N3 — SC's storefront repo | blocks, code patches, brand assets [GitHub] |
| E3 | N5 — Template content site | N1 — Extension core | template pages and index read (public) |
| E4 | N1 — Extension core | N6 — SC's DA.live site | pages and block library written [DA.live] |
| E5 | N3 — SC's storefront repo | N6 — SC's DA.live site | fstab.yaml names this site as the content source |
| E6 | N3 — SC's storefront repo | N8 — AEM admin | code, via the AEM Code Sync GitHub app |
| E7 | N6 — SC's DA.live site | N8 — AEM admin | pages for preview and publish |
| E8 | N1 — Extension core | N8 — AEM admin | site registered, access granted [Adobe] |
| E9 | N8 — AEM admin | N9 — Live storefront | published pages and code [DA.live + GitHub] |
| E10 | N9 — Live storefront | N10 — Commerce | product and cart queries, endpoints taken from config.json |
| E11 | N1 — Extension core | N3 — SC's storefront repo | config.json with Commerce and mesh endpoints [GitHub] |

## Annotations table

| # | Anchor | Text |
|---|---|---|
| ✎1 | N6 — DA.live site | The DA.live org is the SC's GitHub owner name. There is no separate setting. |
| ✎2 | N8 — AEM admin | AEM finds the site by GitHub owner and repo name, not by the DA.live name. |
| ✎3 | N9 — Live storefront | Teardown runs this backwards: unpublish first, then delete the content, then remove the site's access and registration. |

## Sources

- Code and content separation: `docs/architecture/eds-content-separation.md`, `src/features/eds/README.md`
- Repo from template: `src/features/eds/services/github/githubRepoOperations.ts`
- fstab.yaml: `src/features/eds/services/fstabGenerator.ts`
- Page copy: `src/features/eds/services/daLive/daLiveContentCopy.ts`
- Patches: `src/features/eds/services/patches/externalPatchFetcher.ts`
- Code Sync app check: `src/features/eds/services/github/githubAppService.ts`
- Site registration: `src/features/eds/services/configService/configurationService.ts`
- Publishing and its sign-ins: `src/features/eds/services/helix/helixApiClient.ts`
- config.json contents: `src/features/eds/services/configGenerator.ts`
- Teardown order: `src/features/eds/services/storefront/storefrontTeardown.ts`
- Template repos per package: `src/features/components/config/demo-packages.json`

## Related artifacts

- Overview: [d1](d1-overview-sketch.md)
- Lucid doc: see the table in [README.md](README.md)

## Producer notes

