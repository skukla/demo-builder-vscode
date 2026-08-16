# Optimize the MCP tools and skills for SC design work

**Filed:** 2026-08-16 · **Status:** draft, being designed interactively
**Origin:** Bodea storefront session. The owner asked how to optimize the MCP surface for an SC
*designing and creating* a storefront, having noticed the extension already ships project-scoped
skills and MCP servers worth dogfooding.

## The finding

**58 MCP tools. Zero for authoring content, zero for design.**

| SC journey stage | Tools | Verdict |
|---|---|---|
| Auth, org, workspace, provisioning | ~20 | Heavily covered |
| Create project, stacks, packages | 6 | Covered |
| Data / datapacks | 7 | Covered (blocked separately — see `2026-08-16-data-installer-requires-adobe-io-project.md`, filed on `feature/bodea-template`; the link resolves once both reach develop) |
| Lifecycle — start/stop/reset/rename/update | 8 | Covered |
| Blocks | 5 | Read + register only; nothing writes block source |
| Publish | 4 | Covered |
| **Authoring DA.live pages** | **0** | — |
| **Theme / design / visual feedback** | **0** | — |

The surface is optimized for **provisioning a project**, not for **building the demo inside it**.

## The evidence

This session performed exactly the work an SC doing design would: authored ~20 DA.live pages,
rebuilt the nav, published each, ran link-closure checks, corrected a placeholder headline
inherited from the source site, and generated 28 block-library doc pages.

**Every one of those went through raw `curl` against `admin.da.live` with a hand-rolled IMS
token.** None is reachable through the MCP. An SC's agent can `list_dalive_sites` and
`cleanup_dalive_site`, but cannot write a page to one.

For EDS this is the wrong gap to have: the storefront largely *is* its content.

The concrete operations used, as a requirements list:

| Operation | Endpoint used by hand |
|---|---|
| Read a page's source | `GET admin.da.live/source/{org}/{site}/{path}.html` |
| Write a page | `POST admin.da.live/source/…` (multipart) |
| Preview + publish one page | `POST admin.hlx.page/preview\|live/{org}/{site}/main/{path}` |
| List content | `GET admin.da.live/list/{org}/{site}/{dir}` |
| Delete a page | `DELETE admin.da.live/source/…` (destructive) |
| Verify what published | `GET main--{site}--{org}.aem.live/{path}.plain.html` |

## Secondary gaps

- **The block loop is half-open.** `get_block_source` reads and `promote_block_to_library`
  registers, but nothing writes block source. Survivable in-project (the agent has the files on
  disk); it means the MCP cannot support a block workflow from outside the project folder.
- **Visual feedback is one step from existing.** `get_project_urls` already knows the storefront
  URLs and the Playwright MCP is already wired into generated projects. Nothing closes the loop
  ("render my storefront and show me"), so every agent reinvents it.
- **Tool-surface size is itself a cost.** `toolDescriptors.ts` notes descriptions are "kept terse
  — it rides in context every session". At 58 tools that is a standing tax, and an SC doing
  design needs perhaps a dozen. `add_console_apis`, `list_console_apis` and `delete_mesh` sit in
  context for a task that will never call them.
- **Every design skill assumes a reference site.** `scrape-reference-site` → `refine-visual-match`
  measures against captured screenshots. There is no open-ended "improve this" path, which is the
  request that started this item.

## Trap to carry into any design work

`styles/bodea-theme.css` is vendored by `brandAssets` from `skukla/bodea-source`. **Theme edits
made in the project are destroyed on the next reset**, with no warning. Any theming tool or skill
must either write through to the brand source or say plainly that the change is throwaway.
`brandAssets` is new, so no existing skill knows about it.

## Design decision 1 — three tool CLASSES, not one granularity choice (2026-08-16)

Granularity and token spend are different axes. Granularity decides what is POSSIBLE; token
spend is driven by how much the agent must REDISCOVER. So the answer is not thin-vs-structured
transport — it is that three distinct classes are needed, and only one of them saves tokens.

- **Transport** — read/write/publish/list/delete a page. Sets the capability floor: without these
  an agent cannot build a storefront at all, which is today's state. Maximum granularity here, no
  workflow assumptions, so the LLM can do anything. Does NOT save tokens; makes the work possible.
- **Knowledge** — return what the extension ALREADY knows so the agent stops deriving it.
  **This is where the token savings live**, and it is the cheapest code of the three because the
  data already sits in files the extension ships.
- **Composite** — one call for a sequence that is genuinely invariant (write → preview → publish).
  Saves round trips. Add only where the sequence never varies, or it constrains the agent for a
  guess about workflow.

**A granular surface WITHOUT knowledge tools is what makes an agent expensive:** it can do
everything, and rediscovers how every time.

## The operation sort — from one real session, not from categories

Every row is something this session actually did while building the Bodea storefront.

### Transport (capability floor — none of this is reachable today)

| Operation performed | Existing tool | Proposed | Wraps |
|---|---|---|---|
| Read a page's source | **none** | `read_page` | nothing — genuinely absent; had to GET `admin.da.live/source` |
| Write a page | **none** | `write_page` | `daLiveSourceOperations.createSource` |
| Preview + publish one page | **none** | `publish_page` | `helixService.previewAndPublishPage` |
| List content in a directory | **none** | `list_content` | `daLiveSourceOperations.listDirectory` |
| Delete a page | **none** | `delete_page` (confirm-gated) | `daLiveSourceOperations.deleteSource` |
| Unpublish a page | **none** | fold into `delete_page` | `helixService.unpublishPage` |

Nearly all of this is EXPOSURE, not new capability — the service methods already exist. Only
`read_page` has no implementation behind it.

### Knowledge (the token savings)

| What had to be derived | Measured cost | Existing tool | Proposed |
|---|---|---|---|
| A block's authoring shape — rows, cells, key-value vs positional | **~121,000 tokens** (subagent read 8 blocks' JS) | none | `get_block_authoring_shape(blockId)` — returns the `plugins.da` row from `component-definition.json`, ~200 tokens |
| Which blocks are custom vs inherited from the template | a `gh api` fetch + diff at the LKG SHA | none | fold into `list_blocks` as an `origin` field |
| Real category paths (`products/cooling-equipment`, not `cooling`) | published-page fetches + catalog probes | partial (`get_store_structure`) | `get_catalog_scope()` — categories with full `urlPath`, store codes |
| Commerce endpoint + required headers | fetched `config.json`, parsed | none | fold into `get_catalog_scope()` |
| Which pages exist / are published | `sitemap.json` fetch + diff between sites | none | `list_content` covers it if it reports published state |
| The LKG SHA the project is pinned to | raw fetch from `eds-demo-patches` | none | fold into `get_project` |

`component-definition.json` is read by the promote flow but never exposed, so the 121k derivation
was genuinely unavoidable with today's tools. `list_blocks` returns directory names only;
`get_block_source` returns file names or one file's source — neither carries authoring shape.

### Composite (round-trip savings, only where invariant)

| Sequence | Always together? | Proposed |
|---|---|---|
| write → preview → publish | Yes, every authored page this session | `write_page(publish: true)` as a flag rather than a separate tool |
| Publish many pages | Yes, for bulk content | existing `sync_content` already covers it |
| Verify a page rendered | Yes, after every publish | `read_published_page(path)` — fetch `.plain.html`; also the correctness check below |

### Verification — a class the current surface ignores entirely

This session's most valuable checks were verification, and every one was hand-rolled:
link closure across text AND `href` (found 14 dead paths an `href`-only crawl missed), published-vs-
source parity, `head.html` marker idempotence. An agent building a demo needs to know its work
landed. `read_published_page` is the primitive; a `check_content_closure` composite is worth
considering once transport exists.

## Traps a skill must carry (each cost this session real time)

- The DA Library reads `content.da.live`, **not** the `aem.live` CDN. Checking the wrong surface
  reported 0/28 doc pages live when all 28 were fine.
- `.da/library/*` paths DO preview and publish; that had to be proven before trusting it.
- DA's content bus **rejects non-sheet JSON** (`error from content-bus`). Block data files must go
  in the git repo (code bus), not DA.
- A site's **sitemap is not its page set** — 13 storefront pages existed on the source site and
  were absent from its sitemap, so a sitemap-driven copy dropped them silently.
- Theme edits in-project are destroyed on reset (see the `brandAssets` trap above).

## Still open

1. Whether tools should be scoped/filtered per task so a design session does not carry the
   ~20-tool provisioning surface in context.
2. Whether an open-ended design skill should exist, or design should always route through a
   reference site.
3. Whether `write_page` should validate block markup against `component-definition.json` — the
   structured-authoring question, deferred until knowledge tools show whether agents actually get
   markup wrong once they can look the shape up.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-16-mcp-surface-for-sc-design-work.md`. Design the content-authoring
> and design-support additions to the Demo Builder MCP surface, using the operations table as the
> requirements list. Follow `.claude/skills/mcp-tool-authoring/` for how a tool is added
> (headless-safe handler + descriptor row, count-pinned tests, `mcp-server.md` sync).
