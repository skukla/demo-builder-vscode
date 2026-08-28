---
id: AI-1a
kind: question
area: ai
parent: AI-1
needs: AI-1c
value: high
status: active
layer: A
---
# AI-surface coverage: do the MCP tools, skills and agents empower an agent to USE the extension?

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**Re-measured 2026-08-24 on beta.141, and most of the original finding has SHIPPED.** The item was filed when there were 52 tools with "zero for authoring a page"; ai-surface phases 1–6 have since taken the surface to **103 tools** — page authoring (`write_page`, `read_page`, `publish_page`, `delete_page`, `list_content`) and the token fix the item wanted most (`get_block_authoring_shape`, replacing a ~121k-token derivation) both landed. **Reachability is essentially closed**: the corrected `ai-coverage-scan` reports 41 name-level gaps of 123 handler keys, and hand-triage puts the genuinely open count at about five (settings import needs a path-taking variant — the handler opens a modal picker; sign-out / GitHub account switching; `check-credential-service`; `provision-accs-credentials`; non-EDS project reset). Note the scan itself was inflating every figure until 2026-08-24 — it ran a regex that counted nested object keys as handlers; `handler-keys.mjs` shipped beside it unused. **Re-scoped to the design axis 2026-08-24**, replacing the retired four-phase plan — and correcting its headline: "zero tools for design" is no longer true. `refine-visual-match` already drives capped render-compare-adjust rounds through the Playwright MCP, and `commerce-block-mapper` models what is themeable versus immutable. The real gap is narrower: **every visual capability we ship assumes a REFERENCE to match; none supports open-ended design** — exactly the Bodea case (no reference site, the design is being invented, no oracle for "done"). Ordered work: (1) theme tokens as a knowledge tool, generalizing the type-scale fix that converted unbounded font-size iteration into a bounded choice without showing the agent anything; (2) close the `brandAssets` write-through trap — theme edits made inside a project are silently destroyed on reset, so any theming tool builds on sand until this is decided; (3) a design skill carrying a STOPPING rule (copy `refine-visual-match`'s capped rounds + honest deltas); (4) only then ask whether open-ended design needs its own feedback loop. Governing principle: when you cannot give the model feedback, give it constraints. Filed 2026-08-16, re-measured and re-scoped 2026-08-24.

> **⚠️ RE-MEASURED 2026-08-24 (beta.141) — most of this item has SHIPPED; the numbers below are historical.**
>
> Filed at 52 tools. The surface is now **103**, and the two things this item
> wanted most both landed via ai-surface phases 1–6: page authoring
> (`write_page`, `read_page`, `publish_page`, `delete_page`, `list_content`)
> and `get_block_authoring_shape`, which replaces the ~121k-token block-shape
> derivation this item measured. Phase 6 also shipped the bundle's first
> PreToolUse hook. The "agent layer does not exist" finding was settled
> deliberately: no agents ship, because the one flow spanning 3+ ordered skills
> is already orchestrated by `scrape-reference-site`.
>
> **Reachability is essentially closed.** The corrected scan reports 41
> name-level gaps of 123 handler keys; hand-triage puts genuinely open at about
> five (settings import — needs a path-taking variant, the handler opens a modal
> picker; sign-out / GitHub account switching; `check-credential-service`;
> `provision-accs-credentials`; non-EDS project reset).
>
> **Every coverage figure in this file predates the scan fix and is inflated.**
> `scan.sh` ran a regex counting nested object keys as handlers until
> 2026-08-24; `handler-keys.mjs` shipped beside it and was never wired in.
> Re-run the scan before citing anything here.
>
> **What is actually still open is the axis the count cannot see: DESIGN.** Zero
> tools give an agent visual feedback on a storefront. That is what the Bodea
> redesign needs, and the owner has sequenced that redesign behind this work
> (2026-08-24). **The four-phase execution plan below needs re-scoping to the
> design/visual axis before anyone executes it** — it was written against a
> tool surface that no longer exists.

**Filed:** 2026-08-16 · **Status:** superseded in part; needs re-scoping (see banner)
**Origin:** Bodea storefront session, dogfooding what a real SC gets.

**Scope, stated precisely because an earlier draft got it too narrow:** this is about whether
the extension's AI surface — **tools, skills AND agents** — gives an agent the coverage to use
the extension's own features efficiently. It is NOT a design project. The storefront redesign is
the *driving use case*, and it happens inside the extension using the extension's MCP tools; this
item is about making sure that surface is good enough for an agent to do it well.

The question to keep asking of every gap below: *can an agent do this through the extension, and
does it cost what it should?*
## Shipped so far

- 2026-08-24  Page authoring — `write_page`, `read_page`, `publish_page`, `delete_page`, `list_content` (ai-surface phases 1–6)
- 2026-08-24  `get_block_authoring_shape` — replaces the ~121k-token block-shape derivation this item measured
- 2026-08-24  The bundle's first PreToolUse hook (phase 6)
- 2026-08-24  Agent layer settled deliberately: no agents ship — `scrape-reference-site` already orchestrates the one 3+-skill flow

**Reachability is essentially closed** — 41 name-level gaps of 123 handler keys, hand-triaged to about five genuinely open. What REMAINS is the design/visual axis: no tool gives an agent visual feedback on a storefront. The four-phase plan below predates the current tool surface and needs re-scoping before anyone executes it.
- 2026-08-28  Design-axis step 1 SHIPPED (loop, 2026-08-28): token-first theming generalized from type to the whole token system in commerce-block-mapper + refine-visual-match (verified against bodea's real styles.css: 114 tokens — 36 type, 33 color, 15 grid, 14 shape, 13 spacing). Skills teach read-the-file-first, so the rule survives template drift. v30. Step 2 (brandAssets write-through trap) is a product decision — queued for walkthrough with recommendation. Steps 3-4 build on 2.
- 2026-08-28  Step 2 researched (loop, 2026-08-28) and the trap is BROADER than recorded: EDS reset resets the WHOLE repo to template via the Git Tree bulk operation (edsResetRepoHelper.ts step 1), so ALL CSS edits die on reset — tokens included — not just brandAssets-vendored files. Interim fix shipped: commerce-block-mapper now states the lifecycle plainly and routes must-survive theming upstream with an ask-first. DECISION QUEUED for walkthrough: should theme edits survive reset? Recommendation: keep reset destructive (it is the feature's contract) and make durability an upstream/brand-source concern — a preserve-on-reset mechanism would need vendored-hash bookkeeping in the manifest and blurs what reset means. Steps 3-4 stay gated on this decision per the item's ordering.
- 2026-08-28  docs(backlog): AI-1a step 2 researched — the reset trap is repo-wide; decision queued (`afb20991f`)
- 2026-08-28  feat(ai): the theming skill states the reset lifecycle plainly (`74c2a13ef`)
- 2026-08-28  feat(ai): token-first theming — the whole theme is a bounded choice, not just type (`e918947ca`)
- 2026-08-28  fix(ai): get_auth_status github false no longer reads as signed out (`f6c0fba49`)
- 2026-08-28  Step-2 decision RULED (owner, 2026-08-28): themes do NOT survive reset — reset's back-to-template contract stands; the skill's plain lifecycle warning is the shipped behavior. Follow-on feature filed as EDS-10 (custom themes as savable entities). Steps 3-4 (design skill with a stopping rule) are now unblocked.
- 2026-08-28  Journey measurement APPLIED end-to-end (2026-08-28): ERP journey replayed as three battery prompts. Results vs original: catalog-format 8 trial-and-error curls + header creep -> ONE run_commerce_query call, 3/3 repeats identical; category query -> 2 queries (discover + filter) in 2/3 repeats; mesh inspect 5 aio commands + select dance -> 3-5 calls, dance gone. First pass artifact: 6 runs answered for Battery Scratch (isolated host had no prior pointer; harness said so, results did not carry it) -> run meta now records currentProject with a loud scratch warning. NEW FINDING from the enumerate step: the dropins MCP's 21 tools (incl. list_graphql_queries) declare no readOnlyHint, so the battery allowlist excludes them ALL — the dropins routing question is unmeasurable by battery until someone classifies those tools; real sessions can still reach them.
- 2026-08-28  Sibling-routing measured (2026-08-28): cross-design-tokens 2/2 HIT (dropins, one call), cross-starter-kit-docs 2/2 HIT (commerce-extensibility, one call) — routing to sibling servers WORKS when the ask needs them. cross-graphql-shapes adjudicated: agent grepped vendored dropin source instead, answered correctly (file+line, 4-5 calls) even with list_graphql_queries named in AGENTS.md — NATIVE-FILES accepted per grade-outcomes-not-paths; the local source is version-exact ground truth. Also fixed en route: battery env mismatch (home cwd + project servers — no real session has that combo; prompt now cwd:project), and verify-coverage check 2 reconciled against real run modes (was silently red). Owner's idempotency principle captured: journeys round-trip to zero, undo inside the ask, plain-English results.

## How to audit this systematically — `ai-coverage-scan`

**The coverage gap is computable.** Every webview button dispatches into a handler map, and MCP
descriptors dispatch into the SAME maps, so handler types are the extension's feature spine and
a type no agent can reach is a missing AI feature. Written up as a repeatable scan skill
(`.claude/skills/ai-coverage-scan/`), sibling to `dead-code-scan`.

**Baseline 2026-08-16, develop @ beta.131** (re-measured after the release; unchanged from
beta.130 — `2568dd78` decomposed `dashboardHandlers` using verbatim re-exports, so the handler
map stayed byte-equivalent and the scan correctly reported no movement):

| | |
|---|---|
| UI-reachable handler types | 106 |
| Reachable by an MCP tool | 29 |
| Uncovered | 77 (24 UI-only, **53 agent-relevant**) |
| **Agent-relevant gap** | **53 — 50% of the surface** |

Concentrated where an SC actually works: `ProjectCreationHandlerRegistry` (13),
`dashboardHandlers` (11), `edsHandlers` (11).

**The measurement was wrong twice before it was right**, and both errors are recorded in the
skill because they will recur: matching one key convention gave 50 types instead of 106, and
counting only descriptor rows reported 81% uncovered against a true 50%.

**What the count cannot see:** it measures REACHABILITY, not usability. A feature reachable
through a tool may still be expensive — see the ~121k-token block-shape derivation below, which
is invisible to the scan because `list_blocks` exists, so blocks read as "covered". The count
finds missing features; the judgement question finds expensive ones.

## The finding

**52 MCP tools on develop. Zero for authoring content, zero for design.**

> **Scope correction (2026-08-16, at the beta.131 rebase).** An earlier draft said 58. That
> figure was measured in the `test/bodea-on-data-installer` worktree, which has the Data
> Installer merged in, while the coverage numbers below were measured on develop — **the item
> mixed two trees.** On develop it is 52; the six extra are the datapack tools
> (`find_datapacks`, `get_datapack`, `check_datapack_service`, `list_datapack_data_types`,
> `list_installed_datapacks`, `get_datapack_activity`), which live on `feature/data-installer`.
> Every number in this item is now develop-only. Measure one tree, and say which.

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

## The agent layer — there isn't one

A generated project ships `.claude/` containing `CLAUDE.md`, `mcp.json`, `settings.json` and
`skills/`. **There is no `agents/` directory. The extension ships zero agent definitions.**

The seven `appbuilder-*` entries look like agents but are SKILLS with persona names —
`appbuilder-architect`, `-developer`, `-devops-engineer`, `-product-manager`,
`-technical-writer`, `-tester`, `-tutor`, each a `SKILL.md` with a role description.

That exposes a coverage asymmetry worth deciding about deliberately:

| Domain | What ships |
|---|---|
| App Builder | 7 role-shaped skills — effectively a team |
| **Storefront / EDS** | 14 task-shaped skills, **zero roles**, nothing for design |

App Builder — which comparatively few demos use — gets a full cast. The EDS storefront, which is
what an SC actually builds, gets a toolbox of individual tasks. Open questions: should the
storefront have role-shaped coverage too; and should any of these be real subagents (isolated
context, parallelisable) rather than skills the main agent loads.

The token argument cuts both ways here and is worth measuring rather than assuming: a subagent
isolates context, but this session's own ~121k-token block-shape derivation was performed BY a
subagent — isolation does not make the work cheap, it only moves where it is paid.

## Secondary gaps

- **The block loop is half-open.** `get_block_source` reads and `promote_block_to_library`
  registers, but nothing writes block source. Survivable in-project (the agent has the files on
  disk); it means the MCP cannot support a block workflow from outside the project folder.
- **Visual feedback is one step from existing.** `get_project_urls` already knows the storefront
  URLs and the Playwright MCP is already wired into generated projects. Nothing closes the loop
  ("render my storefront and show me"), so every agent reinvents it.
- ~~**Tool-surface size is itself a cost.**~~ **WITHDRAWN — measured and wrong.** 52 descriptions
  total 4,700 chars (~1,175 tokens per session). The surface is not the tax; unshaped OUTPUT is
  (see "Response efficiency" below). This claim was the main argument for per-task tool scoping,
  so scoping loses most of its rationale.
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

## Triage of the 53 — the actual work list (2026-08-16)

Ran `--list` and sorted every entry by hand. **The 53 is not 53 pieces of work.**

### A. Wizard and webview internals — correctly NOT tools (~18)

`ready` · `log` · `requestStatus` · `loadComponents` · `loadDependencies` · `loadPreset` ·
`get-components-data` · `update-component-selection` · `update-components-data` · `validate` ·
`validateSelection` · `checkCompatibility` · `re-detect-context` · `ensure-org-selected` ·
`storefront-setup-start` · `storefront-setup-cancel` · `configure` · `editProject`

These are steps INSIDE the creation wizard or pure webview protocol. An agent reaches the whole
flow through `create_project`; exposing the steps individually would expose UI internals, not
capability. (`storefront-setup-start` is the exception that proves it — the MCP `create_project`
tool already dispatches it internally.)

### B. Covered under a different name — false positives the scan cannot see (~5)

| Flagged | Actually reachable via |
|---|---|
| `resetProject` | `reset_eds_project` |
| `republishContent` | `republish` |
| `exportProject` | `export_project_settings` |
| `getProjects` | `list_projects` |
| `restartDemo` | `start_demo` + `stop_demo` (partial — no single restart) |

**Why the scan misses these:** these tools are registered DIRECTLY and reimplement the handler's
job rather than dispatching to it, so there is no `type:` link for the scan to follow. Confirmed
by tracing: `get_store_structure` DOES carry `type: 'get-store-structure'`, while `republish`
carries none. A future scan pass could flag same-verb near-matches for human review; it cannot
resolve them automatically.

### C. Real gaps — ~29, in eight clusters

| Cluster | Handlers | Why it matters |
|---|---|---|
| **Adobe I/O provisioning** | `create-adobe-project`, `create-adobe-workspace`, `delete-adobe-project`, `get-projects`, `get-workspaces`, `check-project-apis`, `list-org-console-apis` | 7 — **an agent cannot create an I/O project or workspace at all.** Directly blocks the Data Installer credential decision in the sibling backlog item. |
| **GitHub** | `create-github-repo`, `get-github-repos`, `github-oauth`, `github-change-account`, `check-github-app`, `check-repo-readiness` | 6 — no repo creation or GitHub auth recovery |
| **DA.live auth** | `check-dalive-auth`, `clear-dalive-auth`, `store-dalive-token`, `store-dalive-token-with-org` | 4 — an agent cannot check or repair the auth every content operation depends on |
| **Auth recovery** | `authenticate`, `check-auth`, `reAuthenticate`, `switchOrg` | 4 — cannot recover from the org-mismatch state the extension is built to self-heal |
| **Prerequisites** | `check-prerequisites`, `install-prerequisite`, `continue-prerequisites` | 3 — cannot check or install what a demo needs to run |
| **App Builder components** | `addAppBuilderComponent`, `renameAppBuilderComponent` | 2 |
| **Store discovery** | `discover-store-structure` | 1 — distinct from `get-store-structure`, which IS covered |
| **Mesh / import** | `ensure-mesh-api-subscribed`, `importFromFile` | 2 |

### What the triage changes

The headline moves from "50% uncovered" to **~29 real gaps in eight clusters** — a work list, not
a percentage. Two things stand out:

1. **The Adobe I/O cluster is the largest and it is load-bearing.** The Data Installer item's
   whole problem is that a project has no workspace to provision credentials into — and an agent
   cannot create one either. Whichever architecture wins there, the AI surface needs this cluster.
2. **Auth and prerequisites are entirely absent**, which is where an agent gets stuck first and
   has the least ability to recover. `check-dalive-auth` matters disproportionately: every content
   operation depends on that token, and an agent cannot even test it.

**Re-run `ai-coverage-scan` before using this list** — it is a snapshot of develop @ beta.130.

## How to decide WHAT TO BUILD — routing a finding to a layer

Four layers, four different jobs. The mistake to avoid is fixing a capability gap with a skill
(the agent still cannot do it) or a correctness gap with a tool (it still gets it wrong).

**Route by the SYMPTOM, not by the topic:**

| Symptom observed | Layer | Why that layer |
|---|---|---|
| The agent literally cannot do it | **Tool — transport** | Capability. No amount of documentation adds a verb. |
| It can, but re-derives what the extension already knows | **Tool — knowledge** | Cost. Cheapest code, biggest token win. |
| It can, but does the right things in the wrong order or skips a step | **Skill** | Sequence. |
| It does something detectably wrong, and keeps doing it | **Hook** | Enforcement — the only layer that works WITHOUT the agent's cooperation. |
| The work needs isolated context or a standing role | **Agent** | Context and persona. |

Two rules from this repo's own history:

- **A hook that enforces a skill must travel with the skill** (root `CLAUDE.md`). They pair:
  the skill teaches, the hook catches the case where teaching failed.
- **Prefer a hook over a skill when the cost of being wrong is high**, because a skill can be
  ignored and a hook cannot. Prefer a skill when the right action needs judgement.

### Priority = frequency × cost-when-wrong

Not "how many handlers are in the cluster". A single missing `check-dalive-auth` outranks six
GitHub handlers, because every content operation depends on that token and an agent currently
cannot even test it.

## Applying it to the findings

### Tools — transport (capability)

The 8 clusters from the triage, ordered by frequency × cost:

1. **DA.live content authoring** (`read_page`, `write_page`, `publish_page`, `list_content`,
   `delete_page`) — not in the handler triage at all, because *no handler exists either*. Highest
   priority: it is the storefront's substance and the whole reason this item exists.
2. **DA.live auth** (4) — every content operation depends on it; an agent cannot test it.
3. **Adobe I/O provisioning** (7) — load-bearing for the sibling Data Installer decision.
4. **Auth recovery** (4) · **Prerequisites** (3) · **GitHub** (6) · **App Builder** (2) ·
   **mesh/import/store-discovery** (4).

### Tools — knowledge (cost)

- `get_block_authoring_shape` — the ~121k-token measurement. Highest single-tool ROI in the item.
- `get_catalog_scope` — real category `urlPath`s and store codes.
- Fold into existing tools: block `origin` into `list_blocks`, LKG pin into `get_project`,
  published state into `list_content`.

### Skills (sequence and judgement)

- **An EDS authoring skill** — the block markup shape, the body/main/div wrapper, that DA is
  authored content while `data/*.json` is code-bus. Pairs with the transport tools.
- **An open-ended design skill** — the gap that started this item. Every existing design skill
  assumes a reference site to match; nothing supports "improve this".
- **Role-shaped storefront skills**, if the App Builder persona set is judged to have earned its
  keep. Decide deliberately rather than by inheritance.

### Hooks (enforcement) — the layer with NOTHING in it today

A generated project ships exactly one hook, a `PostToolUse` auto-commit-and-push on
`Write|Edit` under the storefront. It is a SYNC mechanism, not a guard — it makes an edit
visible on the CDN, which visual iteration needs. **There are zero guard hooks**, while the
extension repo itself runs eight.

Each trap below cost this session real time and is mechanically detectable, which is exactly the
hook profile:

| Trap | Hook that would catch it |
|---|---|
| Theme edits in-project are destroyed on the next reset (`brandAssets` re-vendors) | `PreToolUse` on Write to a vendored path — warn, name the brand source |
| Non-sheet JSON written to DA silently fails at preview | `PreToolUse` on a DA write of `.json` — route to the code bus |
| Checking `aem.live` for library doc pages (the Library reads `content.da.live`) | Hard to hook; belongs in a skill |
| Auto-commit fires per edit, pushing broken intermediate states | Reconsider the existing hook's granularity |

**Also worth questioning: that auto-push hook.** One commit per edit is noisy, and an agent
iterating on design will push intermediate states. It exists because EDS serves from the repo,
so the alternative is an explicit `publish` step the agent controls — which the transport tools
would provide anyway.

### Agents

Deliberately last. **Do not add agents to save tokens** — this session's own ~121k derivation was
performed BY a subagent, so isolation moved where the cost was paid without reducing it. Add an
agent when work needs a standing role or genuinely isolated context; fix cost with knowledge
tools instead.

## Suggested build order

1. **Knowledge tools first.** Cheapest, highest measured ROI, and they make everything after
   cheaper. `get_block_authoring_shape` alone is a ~121k → ~200 token change.
2. **Content transport + its authoring skill together.** Capability plus the sequence knowledge
   to use it; neither is much use alone.
3. **The two guard hooks** (vendored-path write, DA JSON write) — small, and they stop the two
   traps that silently destroy work.
4. **Auth and prerequisites tools** — where an agent gets stuck first.
5. **Adobe I/O provisioning** — sequence with the sibling Data Installer decision.
6. **Agents, if at all** — only once there is evidence a role boundary is needed.

## Response efficiency — reshaping what tools return (2026-08-16)

### Measured, not assumed

**Tool descriptions are NOT the problem.** An earlier draft of this item called 58 tools "a
standing tax". Measured: 52 descriptions, 4,700 characters, **~1,175 tokens per session**. Modest.
That claim is withdrawn — and it matters, because it was the argument for per-task tool scoping.

**Output shaping IS the problem, and nothing does it.** `ToolDescriptor` has an optional
`shape?` projector, documented as "custom response projector". **Zero tools use it.** Every
descriptor tool returns `JSON.stringify` of whatever the handler produced — and handlers were
written to feed React components, so they carry ids, flags and flat arrays a UI needs.

Measured on `get_store_structure` against a real project:

| | |
|---|---|
| As returned today | 701 chars (~175 tokens) |
| Same information, LLM-shaped | 186 chars (~46 tokens) |
| **Reduction** | **73%** |

```
as-is  : {"storeGroups":[{"code":"main_website_store","default_store_id":1,"id":1,
          "name":"Main Website Store","root_category_id":51,"website_id":1}, …
shaped : [{"website":"base","stores":[{"store":"main_website_store",
          "views":["default"]}]}, …]
```

**The shaped form is not merely smaller — it is more useful.** The raw form is three flat arrays
joined by numeric ids (`website_id`, `store_group_id`), so the LLM must perform the join before
it can answer "which store views exist under `base`?". The shaped form expresses the hierarchy
directly. **Reshaping removes work, not just bytes.**

### How to work on this systematically

Output size depends on runtime data, so it cannot be measured statically like coverage. Two
steps, in order:

1. **Static pass, available now:** every descriptor row lacking `shape:` is a candidate. That is
   currently all of them, so the finding is "start with the highest-traffic tools".
2. **Runtime pass:** instrument the MCP server to log response byte counts per tool, run a
   representative session, then rank by *bytes × call frequency*. That ranking is the work list.
   Cheap to add and it turns a guess into a measurement, exactly as `ai-coverage-scan` did.

Shaping rules worth applying as each tool is reshaped:

- **Resolve joins server-side.** If the payload has ids the LLM must correlate, correlate them.
- **Drop UI-only fields** — display strings, icons, panel ids, `lastUpdated` nobody reads.
- **Prefer the answer over the record.** `get_project` returning a whole manifest makes the LLM
  parse; returning the three fields the question needs does not.
- **Keep errors terse and actionable** — `defaultShape` already does this well.

### Do skills need guarding hooks?

Yes, for mechanically-detectable traps — see the routing framework above. Worth adding: this
repo enforces skill-loading with `router.sh` (`PreToolUse`, blocks the first doc-lookup call
until the skill is loaded). **A generated project has no equivalent**, so a project-side skill is
advisory only. If a trap silently destroys work — the vendored-theme case — advisory is the wrong
strength.

### Do feature flows need dedicated agents?

**Unproven, and the obvious argument for them does not survive measurement.** The case is usually
"a curated tool subset reduces what the agent reasons over" — but the whole tool surface costs
~1,175 tokens, so there is little to reclaim. And subagent isolation does not reduce cost: this
session's ~121k block-shape derivation was performed BY a subagent.

The argument that might hold is **sequencing**, not context: a flow like "scrape → map chrome →
map commerce blocks → refine" has an order, and today that order lives in prose across four
skills. Whether that needs an agent or just a better skill is an open question — decide it after
the knowledge tools land, since a cheaper flow may not need orchestration at all.

**Do not add agents to save tokens. Add them when a role or an order genuinely needs an owner.**

## RE-SCOPED 2026-08-24 — the design axis is what is left

The original four-phase plan (tools → skills → agents → hooks, all 52 tools scored)
is **retired**: phases 1–4 of the ai-surface program executed that work. Tools went
52 → 103, responses were reshaped against a measured ceiling table, the skill layer
was scored and corrected, agents were decided against with evidence, and the hook
layer got its first entry. What that program could not close is the axis its own
measurement cannot see, and it is the axis the Bodea redesign needs.

### First, a correction to this item's headline

"Zero tools for design" was true when filed and is **not true now**. A visual
iteration loop ships today: `refine-visual-match` drives rounds of
render-compare-adjust against reference screenshots using the Playwright MCP the
extension installs, capped at 3 rounds with honest reporting of what still differs.
`commerce-block-mapper` models what is actually themeable versus immutable inside a
dropin. `get_block_authoring_shape` answers block structure in ~200 tokens.

So the gap is not "an agent cannot see anything". It is narrower and worth stating
exactly:

> **Every visual capability we ship assumes a REFERENCE to match. None supports
> open-ended design — "make this look right for this brand" with nothing to
> copy.** That is precisely the Bodea case: there is no reference site, the design
> is being invented, and the agent has no oracle telling it when it is done.

### Why open-ended design is the hard case, stated precisely

Reference-matching has a termination condition: the screenshots converge, and
`refine-visual-match` can honestly say "3 rounds, here is what still differs".
Open-ended design has none. Without an oracle an agent iterates without a stopping
rule, which is the same failure the type-scale finding recorded — agents picked font
sizes by eye, users said "fonts are too small", and iteration never converged.

**The fix that worked there is the pattern to build on, and it was not feedback.**
Nothing showed the agent the page. The generated guidance was changed to say: the
boilerplate ships 36 `--type-*` custom properties, read them and use
`font: var(--type-…)`, never invent a size. That converted an unbounded visual
search into a small set of valid choices.

> **The principle for this whole axis: when you cannot give the model feedback,
> give it constraints.** Fewer ways to be wrong beats more ways to check. Build the
> constraint layer first; only then ask whether a feedback loop is still needed.

### The work, in order

**1. Theme tokens as a knowledge tool — generalize the type-scale fix.**
The type scale is one family of custom properties; colour, spacing, radius and
weight have the same problem and no equivalent guidance. A tool that reads the
storefront's ACTUAL custom properties (from its `styles/styles.css` plus any
vendored brand theme) and returns them lets an agent style with what exists instead
of inventing hex values that drift from the brand. Same shape as
`get_block_authoring_shape`: the answer already exists on disk; the cost today is
that finding it means reading CSS.
*Note the standing rule this must respect: never ship a hardcoded token list. The
scale belongs to `aem-boilerplate-commerce` and a copied list rots — read the
properties.*

**2. Close the theme write-through trap — this blocks everything else.**
`styles/bodea-theme.css` is vendored by `brandAssets` from `skukla/bodea-source`, so
**every theme edit made inside a generated project is destroyed on the next reset,
silently**. Any design tooling that writes theme changes into the project is
building on sand. Either the tool writes through to the brand source repo, or it
states plainly that the change is throwaway. No existing skill knows `brandAssets`
exists. Decide this before shipping a single theming affordance.

**3. A design skill that terminates.**
Deferred out of ai-surface phase 5 as `2026-08-17-open-ended-design-skill.md` and
still open. The re-scoped requirement is narrower than "a skill for design": it must
carry a **stopping rule**. `refine-visual-match`'s 3-round cap with honest delta
reporting is the shape to copy — the value is not the iteration, it is admitting
when iteration stopped paying.

**4. Only then: does open-ended design need its own feedback loop?**
Do not start here. Playwright can already render and screenshot; what is missing is
something to compare against when there is no reference. Answer 1–3 first, then ask
whether agents still get design wrong once they can look up the constraints. This is
the same deferral logic the item already applied to `write_page` markup validation.

### What "done" looks like

Not a tool count. An agent can be asked to restyle a storefront for a brand and
(a) uses tokens that exist rather than inventing values, (b) makes changes that
survive a reset, and (c) stops, reporting what it did and what it could not judge.
