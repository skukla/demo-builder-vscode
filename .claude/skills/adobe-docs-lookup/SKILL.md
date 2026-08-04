---
name: adobe-docs-lookup
description: Route an Adobe documentation question to the source that actually has the answer — App Builder / aio CLI / Runtime / Commerce / AEM-EDS — and recover when a doc MCP is down. Use BEFORE looking anything up about Adobe behaviour, whenever a lookup returns off-target product docs, or when an MCP returns "Session not initialized" or 401.
---

# Adobe Docs Lookup

Five sources reach Adobe documentation and they cover **different corpora**. Picking wrong
does not fail loudly — it returns confident, plausible, off-target results. The first search
for `aio app undeploy` came back with Commerce deployment best-practices, AEM namespace
priority, and a 2020 community thread, none of which answer the question. The authoritative
page was on a domain none of the doc servers index.

## Route by corpus

| The question is about | Use | Why |
|---|---|---|
| App Builder concepts: deploy/undeploy, workspaces, Runtime entities, extensions, events | **`MCP_DOCKER fetch`** on `developer.adobe.com/app-builder/docs/...` | The only route that reaches this domain. Neither doc server indexes it. |
| **Exact `aio` flags for the version actually installed** | **The local CLI**: `aio app deploy --help`, `aio app undeploy --help`, `aio app --help` | Ground truth, version-exact, zero latency. Beats every doc for "what flags exist" — docs describe some version, the CLI describes YOURS |
| `aio` CLI semantics, plugin behaviour, what a flag MEANS | **Context7** `/adobe/aio-cli-plugin-app` (owns `app deploy`/`app undeploy`), `/adobe/aio-cli` | Command reference with real snippets |
| Adobe SDK / library usage in code | **Context7** — `/adobe/aio-commerce-sdk`, `/adobe/aio-lib-db`, `/adobe/aio-lib-web`, `/adobedocs/exc-app` | Snippet-level, versioned |
| Commerce developer docs | **Context7** `/websites/developer_adobe_commerce` (20k snippets) or `adobe-exl` | Both indexed; Context7 is denser |
| How a PRODUCT uses a capability (Commerce/Workfront/AEM + App Builder) | **`adobe-exl` search** | This is exactly what ExL indexes |
| AEM as a Cloud Service, pipelines, replication | **`fluffyjaws`** `experience_league_documentation_search` | ExL Q&A, AEM-weighted by design |
| "Has Adobe said anything about this?" — internal guidance, known issues, field intel | **`fluffyjaws`**, non-ExL tools — see below | Corpora NOTHING else reaches |
| Helix / EDS / aem.live | **`helix-mcp-server`** `aem-docs-search` | Its own corpus |
| Nothing above, or need sourced cross-checking | **Perplexity** (`perplexity_ask` / `perplexity_research`) | Project CLAUDE.md prefers it over WebSearch |

**Default for anything App Builder:** go to `developer.adobe.com` via `fetch` first. Reach for
a doc server only when the question is genuinely product-scoped.

### fluffyjaws is not just ExL

It fronts several corpora, and the internal ones are unique — no public source has them.
Reach for these when the public docs are silent, contradict observed behaviour, or you need
to know whether something is a known issue:

| Tool | Corpus |
|---|---|
| `full_documentation_search` | Broadest doc sweep when you don't know which product owns it |
| `helpx_documentation_search` | helpx (end-user / admin facing) |
| `wiki_documentation_search` · `skyline_runbooks_search` | Adobe-internal wiki and operational runbooks |
| `slack_search` · `jira_search` / `jira_ticket_search` | Has anyone hit this? Is there a ticket? |
| `field_readiness_sharepoint_search` | Field enablement material — often ahead of public docs |
| `dynamics_ticket_search` | Customer-reported issues |
| `oak_documentation_search` · `sling_documentation_search` · `marketo_documentation_search` | AEM internals (Oak/Sling), Marketo |
| `google_web_search` | General web, when nothing above fits |
| `program_*` / `environment_*` / `tenant_*` | AEM Cloud program ops — NOT relevant to this repo |

Requires `fj login` (see failure modes). This is an Adobe-employee surface; treat internal
results as internal — do not paste them into anything public, and remember this repo is a
PUBLIC GitHub repo, so internal detail must not land in code comments, docs, or commits.

## Route first, then decide whether to corroborate

This is a ROUTER, not a fan-out. Querying all five sources for every question is slow
and mostly noise — most questions have exactly one right corpus, and the table above
names it.

**Corroborate against a second source when any of these hold:**

- The answer will drive **destructive or irreversible** behaviour — delete, undeploy,
  teardown, "is X cleaned up automatically?". Being wrong costs a user's environment.
- The answer becomes **durable truth**: written into a code comment, an ADR, a skill,
  or a persisted contract. A wrong fact set in a comment outlives the session.
- The first source **returned the wrong corpus** — product docs for a platform question,
  a community thread instead of a guide, results dated years back. That is the signal
  you mis-routed, not a reason to accept what came back.
- Two sources **already disagree**, or a doc contradicts observed behaviour in this repo.

**Do NOT corroborate** a routine flag or signature lookup where the CLI reference is
plainly authoritative. That is the case the router exists to make cheap.

When you do corroborate, prefer sources with DIFFERENT provenance — the concept guide on
developer.adobe.com against the CLI reference in Context7 beats two Experience League
pages that likely share an upstream.

**State which source each claim came from** when you report. "Per the deployment guide"
and "per the aio-cli-plugin-app reference" are checkable; an unattributed assertion is
indistinguishable from recollection.

## Fanning out with subagents

**Not the default.** One probe cost ~108k subagent tokens and 4½ minutes for a single
question. Spending that on "what flags does `aio app undeploy` take" — which
`aio app undeploy --help` answers in one call — is waste.

**Use a fan-out when the corroboration triggers above fire**, and shape it so the agents
disagree usefully:

- **One agent per PROVENANCE, not per source.** Concept docs (developer.adobe.com) ·
  CLI reference (Context7 + the local `aio --help`) · internal/field (fluffyjaws). Two
  agents on two Experience League pages is not corroboration; they likely share an upstream.
- **Require citations per claim**, so you can reconcile conflicting answers by source
  authority rather than by which agent sounded surer.
- **Require the "could not read" vs "does not say" distinction explicitly in the prompt.**
  A subagent that cannot reach a source will otherwise report absence as a finding, and you
  cannot see its tool calls to catch it.
- **Ask for an explicit "what I could not establish" list.** The probe returned three such
  items, each of which would otherwise have become a confident wrong answer.

Verified 2026-08-04: subagents CAN reach `MCP_DOCKER fetch`, `adobe-exl`, `fluffyjaws`
(the user's interactive `fj login` session does propagate), Context7, and the local `aio`
CLI via Bash. The PreToolUse router hook also fires inside a subagent — its session id is
distinct, so it gets its own once-per-session landing and loads this skill too.

## Enforcement

`.claude/hooks/adobe-docs-skill-router.sh` (PreToolUse) blocks the first doc-lookup tool
call of a session — any of the routes above, plus WebFetch/WebSearch — until this skill is
loaded. It fires once per session. A skill description cannot cover this case: by the time
you reach for a doc tool you have already chosen the source, and the choice IS the thing
being routed.

## Which Adobe PROPERTY owns the answer (from Wayfinder)

The table above routes to a TOOL. This one routes to a PROPERTY — the two are different
axes and you need both: pick the property, then fetch its entry point with
`MCP_DOCKER fetch`.

Adapted from [adobe-commerce/wayfinder](https://github.com/adobe-commerce/wayfinder),
Adobe's own agent routing system for Commerce docs. Kept here rather than fetched per
session (its README suggests loading it at session start; most sessions in this repo never
ask a Commerce question). Re-check upstream when Commerce doc structure shifts.

| The question is about | Property | Entry point for agents |
|---|---|---|
| **Delivery layer**, whatever the repo: EDS Config Service, AEM Code Sync, `aem up` / AEM CLI, block authoring, Sidekick, CDN + caching, spreadsheets (metadata, nav, redirects, placeholders, fragments), section metadata | AEM / EDS | `https://www.aem.live/llms.txt` (humans: `aem.live/docs/`) |
| **Commerce layer on top of EDS**: drop-ins (cart, checkout, auth, PLP, PDP), commerce blocks, `scripts/__dropins__/`, `scripts/initializers/`, `build.mjs`, Storefront Configuration, containers/slots, ACO/ACCS wiring from the front end | Commerce Storefront | `https://experienceleague.adobe.com/developer/commerce/storefront/llms.txt` |
| **Product / merchant / ops**: Admin, catalog, orders, B2B, cloud (PaaS/SaaS), upgrades, Live Search, Catalog Service, ACO catalog views + price books | Experience League (Commerce) | `https://experienceleague.adobe.com/en/docs/commerce.md` |
| **da.live authoring**: DA org/site creation, permissions, authoring workflow, variables, reusable content, DA library, UE with DA | Document Authoring | `https://docs.da.live/` |
| **Commerce extensibility**: App Builder for Commerce, web APIs, API Mesh, integration patterns | Adobe Commerce Developer | `https://developer.adobe.com/commerce` |
| **App Builder platform itself** (deploy/undeploy/publish/workspaces) | Adobe Developer | `https://developer.adobe.com/app-builder/docs/guides/` — NOT in Wayfinder's table; this is the gap that started this skill |

`llms.txt` is an agent-optimised index — prefer it over crawling HTML. **Never link a human
to `llms.txt`** or to a `*.md` index; give them the human URL (strip `.md` from Experience
League indexes; `developer.adobe.com` and `docs.da.live` are already human-readable).

Several of Wayfinder's disambiguations bear directly on this repo:

- Code pushed but not live on `aem.live` → **AEM Code Sync / CDN**, not storefront.
- A page edited in DA not appearing after publish → **EDS publish pipeline**, not DA.
- Nav / header / footer → **EDS document-driven patterns**, not storefront.
- CDN/Fastly/VCL on a storefront → **both**; storefront has its own Fastly routing beyond
  generic EDS CDN.

## Read the page before citing it

Two habits that cut tokens and prevent confident-wrong answers:

- **Confirm before citing** (Wayfinder's rule, sharper than "cite your source"): after
  fetching, scan for the specific strings that answer the question. If the page does not
  contain a direct answer, say so and try the next source — do not infer from adjacent
  content.
- **TOC first on a long page.** Fetch a small `max_length`, read the headings, then jump
  with `start_index` to the section you need. The deployment guide took three full pages to
  reach one paragraph; headings-first would have taken two calls. (Technique borrowed from
  `adobe-commerce-docs-mcp`'s `get_page_toc` / `get_code_examples`, which we did NOT adopt —
  it indexes only Experience League, a corpus `adobe-exl` already covers.)

## developer.adobe.com URL shapes

Verified 2026-08-04:

- Works: `https://developer.adobe.com/app-builder/docs/guides/deployment/`
- 404s: `.../guides/app_builder_guides/deployment/` — the `app_builder_guides` segment appears
  in older community posts and is stale. Strip it.
- `fetch` truncates at `max_length` and tells you the next `start_index`. The deployment guide
  needs ~3 calls. Page forward rather than raising `max_length` blindly.

**When you do not know the URL**, do not guess repeatedly — each miss is a 404 round-trip.
Either start from the guides index (`https://developer.adobe.com/app-builder/docs/guides/`)
and read its links, or use `adobe-exl` / Perplexity to SURFACE the URL and then `fetch` the
page itself. Community posts are useful for locating a page and unreliable for its content:
the post that pointed here cited a path whose `app_builder_guides` segment now 404s.

**A fetch that returns empty or near-empty is not proof the page is empty.** Some pages are
JS-rendered and come back as a shell. Check `raw: true` before concluding the content does not
exist, and say "could not read it" rather than "it does not say".

## When a source is down

Both failures are CLIENT-side sessions. **You cannot fix either — ask the user.**

| Symptom | Meaning | Fix (user runs it) |
|---|---|---|
| `MCP error -32002: Session not initialized` | The MCP client lost its handshake. The tool schema is still registered, so calls look available and fail at transport. | `/mcp` → reconnect that server |
| `Unauthorized (401). Run 'fj login'` | fluffyjaws session expired | `fj login` in a shell |

Rephrasing the query never helps either one. Say which source is down, name the fix, and stop
— do NOT fall back on recollection and present it as researched. The point of the lookup is a
verified fact; an unverified one wearing the same confidence is worse than no answer.

## Facts already established (do not re-derive)

From `developer.adobe.com/app-builder/docs/guides/deployment/`, 2026-08-04:

- **`aio app deploy` creates four component classes:** frontend web assets → the App Builder
  CDN (auto-provisioned per Project+Workspace); Runtime entities → Actions, Sequences, APIs,
  Rules, Triggers, Log Forwarding config; extension-registry registrations against implemented
  extension points; and event registrations.
- **`aio app undeploy` removes all components `aio app deploy` created**, and both commands
  take options to act on only PART of an app (`--help` on each).
- Workspaces are fully isolated and deploy separately.
- Deployed app URL: `https://<namespace>.adobeio-static.net/`
- AIO CLI v11+ requires IMS auth for deploy AND undeploy; Runtime namespace auth is retired.
- Project Activity Logs record deploy/undeploy events (not their contents), from 2025-08-08,
  retained one year.

**Publish is a distinct state from deploy, and there is NO `aio app publish` command**
(verified against aio-cli 11.1.2: `Command app:publish not found`). Two different things
carry the name:

- **Deploy-time publish** — `--publish` (default TRUE), `--force-publish`, and
  `--force-deploy` are flags ON `aio app deploy`. They register extension points into the
  Adobe extension registry / Exchange. `-a/--action` implies `--no-publish`.
- **Lifecycle publish** — a Console → Exchange approval workflow with no CLI involvement:
  deploy to Production → *Submit for approval* → **In Review** → org admin approves in
  Exchange → **Published**. Admin can unpublish, forcing resubmission.
  ([publish-app](https://developer.adobe.com/app-builder/docs/get_started/app_builder_get_started/publish-app))

**Publishing FREEZES production deploys**: "Once an application is published, you will not be
able to re-deploy it to Production... you will need to revoke and create a new approval
request" ([uix publication](https://developer.adobe.com/uix/docs/guides/publication/)) — which
is exactly why `--force-deploy` exists. Two provenances agreeing.

Only ExC Shell extensions appear in the App Builder Catalog; a headless app can be published
but gains no listing ([distribution](https://developer.adobe.com/app-builder/docs/guides/distribution/)).

**An ExL "perspectives" article states `aio app publish` exists. It is wrong.** Perspectives
content comes back flagged `sourceTrust: untrusted_retrieval` — treat it as a lead, never as
reference.

## Relationship to the global MCP preferences

`~/.claude/CLAUDE.md` states two general rules — prefer Context7 over WebFetch for library
docs, prefer Perplexity over WebSearch for sourced answers. Both hold, and this skill refines
rather than replaces them: it says WHICH Context7 library, and when a raw `fetch` of a known
Adobe URL beats both. Where they appear to conflict, the corpus table wins for Adobe
questions, because it is the more specific rule.

## Verification status

Trust these only as far as they were tested:

- **Verified working:** `adobe-exl` search · `MCP_DOCKER fetch` on developer.adobe.com ·
  Context7 `resolve-library-id` for Adobe packages
- **Untested:** `adobe-exl` `fetch_article_content` against non-ExL domains (its description
  scopes it to Experience League articles — assume it cannot reach developer.adobe.com until
  someone proves otherwise) · `fluffyjaws` post-login · Perplexity this session

If you test one of these, update this row rather than leaving the next reader to re-discover it.
