# Shared demos: the whole demo as one package, in a library every SC can use

**Status: DRAFT for the owner's review (2026-10-31).** Nothing here is filed in the backlog
yet. The owner asked to review this plan before any item exists.

## What the owner asked for

> "A rethink of the foundation we laid for sharing storefronts … a shared demo concept which
> incorporates every piece of a demo that an SC needs to deliver: storefront code, content,
> commerce backend data including ACO data, (all including multi site and any integration
> scenarios). All of this should be wrapped up in the project and exportable and importable …
> stored in a library that any SC can contribute to. … Reuse as much as we can from our current
> functionality and expand where necessary." (owner, 2026-10-31)

It is the last epic before 1.x, alongside ACO support (PL-60) and multi-site storefronts (EDS-1).

## The short version

Most of the pieces exist. What does not exist is **the demo as one thing**: today a demo is
spread across a GitHub repo, a live DA.live site, datapacks in a library, a project file on
someone's disk, and integration state living in an App Builder workspace. Sharing works by
pointing at those live places, so a shared demo breaks when the sharer changes or deletes any
of them, and there is nowhere a colleague can browse demos.

The plan: one **demo manifest** (the project file, grown up) that names every part and the
version of each, a **demo library** in the service we already run for datapacks, a
**contribute** flow (the Share dialog's next step) and a **build from the library** flow (the
Welcome step's next card source). Content gets the one genuinely new capability: a snapshot.

## What exists, and what each part still needs

Measured on develop at `b4a7f1504` by reading the code; the four "not verified" items are named.

| Part of a demo | What carries it today | What is missing |
|---|---|---|
| **Storefront code** | The demo bundle zip snapshots the repo; the description file (`demo.demo-builder.json`) points at a live repo; "Add a demo" builds from either | Edge Delivery only (headless has no repo of its own, EDS-13g). A pointer breaks if the repo goes private or away |
| **Content** | Copied from the sharer's PUBLISHED pages at build time | No snapshot anywhere. Drafts, the authored block library and 18 runtime pages and sheets are dropped (EDS-40); reading authored content needs a grant (EDS-22) |
| **Commerce data** | Datapacks: each demo has its own pack in the library; the project file names it; a colleague's pack is copied on arrival | No images (DI-7); "unlisted" sharing needs a service change; nothing warns when a pack someone's demo names is unshared |
| **ACO data** | ACO packs can be made from a store and saved | Cannot be installed until PL-60's loader merges (built on its branch) |
| **Integrations** | Which integrations, and their text settings, travel in the project file | Their runtime state does not: ERP settings, appearance, ERP records, store preparation, second ERP copies |
| **Settings** | The project file (credentials stripped) | Complete |
| **Multi-site** | The store tree travels; a project targets one store | No sites model until EDS-1 |
| **A place to find demos** | Nothing shared. Each SC's own Welcome cards live in their settings | The whole library |

Not verified: whether added-demo cards sync across an SC's machines; that a bundle leaves
content behind in practice (read from code, not run); live behaviour of library Share and
"copy to the Data Installer"; copy-on-arrival of a pack.

## Decisions for the owner

Each has a recommendation; none blocks the research or the manifest work.

**1. Where the library lives.** Recommend: **the datapack library service we already own**
(`skukla/accs-discovery-service`, verified our repo, already holding datapack actions,
owner and shared flags, and a sign-in guard), with a new kind of entry, a demo. Rejected: a
file in a GitHub repo (EDS-13d's idea): no per-entry owner, everyone needs write access,
and a fetched file deciding where code is copied from is a trust problem.

**2. Snapshot or pointer.** Recommend: **a demo version is a snapshot**: code pinned to a
commit, content as a snapshot, data as specific pack versions. A pointer to live sources is
what breaks today. Contributing again makes a new version; old versions keep working.

**3. Who owns a contributed demo's code.** Recommend: **pin a commit of the contributor's
repo, and offer "keep a copy in the team organisation"** for demos meant to last (EDS-17
already made organisation repos possible). Which organisation is the owner's call.

**4. Content.** Recommend: **build the content snapshot** (every document, sheet and the
authored block library, as one zip in the library), and install it by writing to the new
site the way the copy does today. This also closes EDS-40 and most of EDS-22.

**5. Integration state.** Recommend: **capture it as the steps that produce it**, not as raw
data: which store preparation ran, the ERP settings, which demo data was loaded. Building
from the library replays them. Raw ERP records belong to the integration, and replaying is
reversible where copying records is not.

**6. Multi-site and ACO.** Recommend: **the manifest has a place for sites and ACO packs from
the start**, filled when EDS-1 and PL-60 land. Shared demos ships its first version without
waiting for either.

**7. The words.** "Share", "Export" and "demo package" each mean something already.
Recommend: **"Demo library"** for the place, **"Add to the demo library"** for contributing,
and the Welcome step showing library demos beside the shipped ones.

**8. Who can change what.** Recommend: an entry belongs to its contributor; only they can add
a version or withdraw it; versions never change once added; withdrawing hides it from new
builds and leaves existing projects working (their project keeps its own copy of what it
needs, as "Add a demo" already guarantees).

## Proposed work (not filed)

| # | Item | Builds on | Lane |
|---|---|---|---|
| 1 | Settle decisions 1 to 8 | this plan | owner |
| 2 | Demo manifest: the project file, version 3, naming every part and its version, with places for sites and ACO; reads version 2 | project file v2 (PL-56) | fully local |
| 3 | Demo library in the service: demo entries, versions, owner, shared, withdraw | datapack library service | service change, then a deploy (owner's go) |
| 4 | Content snapshot: export a site to a zip, import a zip into a site | DA.live copy code (`daLiveContentCopy`) | local, then one live check |
| 5 | Add to the demo library: from the Share dialog, run the existing checks, save the packs, the content snapshot and the manifest | Share dialog, `packageChecks`, pack sharing | local, then live |
| 6 | Browse the library on the Welcome step | added-demo cards, the resolver | local |
| 7 | Build from the library: the manifest's parts installed in order | `create_project_from_file`, copy-on-arrival, zip storefront import | local, then live |
| 8 | Integration state as replayable steps | store preparation records, ERP settings tools | local, then live |
| 9 | Versions and updates: a new version offered to projects built from an old one | `builtWith`, EDS-56 | local |
| 10 | Withdraw, and taking a demo back to zero in a project | reset, pack removal | local, then live |
| 11 | Sites in a demo | EDS-1 | after EDS-1 |
| 12 | ACO in a demo | PL-60 | after PL-60 |
| 13 | The agent surface: every action above as an MCP tool | descriptor pattern | with each item |

**What this supersedes:** EDS-13d (team catalog) becomes item 6; EDS-13 closes into this
epic once its open children (EDS-13f's last line, EDS-22's intake) land or move here.

## Order

1. **Milestone 1**: manifest, library, contribute and build for code, data and settings.
   Most of it is wiring what exists; the library service change is the one new piece.
2. **Milestone 2**: the content snapshot.
3. **Milestone 3**: integration state.
4. **Milestone 4**: sites and ACO, as EDS-1 and PL-60 land.

## Reversibility (the repo's first rule)

Every action ships with its undo: add to library and withdraw; build from the library and
reset to zero; a content snapshot imported and the site cleaned. The library never deletes a
version someone's project names.

## Risks

- **The service change is a cloud deploy** to a shared Stage workspace, so it waits for the
  owner each time.
- **Content snapshots can be large**; the library's size limits need measuring before
  item 4 is designed in detail.
- **Integration replay depends on each integration's own setup steps staying stable.**
