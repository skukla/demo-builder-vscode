# Production-Grade Demo Storefronts — Tiered Roadmap

**Captured**: 2026-05-18
**Origin**: `/rptc:research` session investigating the gap between current Demo Builder provisioning and Adobe's production-readiness checklists
**Status**: Research deliverable. Concrete work scoped via individual `/rptc:feat` cycles against the tiers below.

## Context

The Demo Builder extension provisions Adobe Commerce + EDS demo projects. After Phase 1 (Config Service 403 fix, commit `d751f141`) and Phase 2 (BYOM overlay plumbing, commit `6a22e820`) the open question was: **what would it take to treat each project as a production-grade deployment?**

**Strategic posture (user-confirmed):**

> "It's a mix. It's 'demo features quickly' but without relying on deprecated approaches or features, and also providing for eventual value to be added (for example, multisite storefront support)."

That posture has three implications:

1. **Don't over-engineer for demos** — skip features only production sites need (CDN provisioning, custom domains, Lighthouse-100 gating).
2. **Don't ship anything deprecated** — audit current code for legacy patterns and excise them.
3. **Leave doors open** — make architectural choices today that don't foreclose future capabilities (multisite, multi-locale, multi-environment via Repoless).

**Scope principle (user-confirmed):**

> **Storefront features (widgets, drop-ins, blocks, JS components) are the template's job, not Demo Builder's.** Demo Builder provisions the surrounding infrastructure: GitHub repo, DA.live content, Config Service registration, API Mesh deployment, config files (`.env`, `config.json`, `fstab.yaml`, AI context files), and per-project deployed services (mesh, eventually prerender). Anything that lives inside the storefront repo's JavaScript/HTML/CSS belongs to the template author.

This principle eliminates several items from earlier drafts (Live Search widgets, Auth drop-in install, Experimentation plugin) — they ship with the CitiSignal template; Demo Builder has nothing to do.

---

## Adobe's Official Reference Points

- [AEM Live Go-Live Checklist](https://www.aem.live/docs/go-live-checklist)
- [Adobe Commerce Optimizer Launch Checklist](https://experienceleague.adobe.com/en/docs/commerce/optimizer/launch/launch-checklist)
- [Repoless multisite pattern](https://www.aem.live/developer/repoless-multisite-manager) — the canonical Adobe pattern for multi-environment / multi-locale sharing one repo

Demo Builder is not aiming to pass these end-to-end; it's aiming to align with their direction.

Detailed inventory of current provisioning (file:line references) and full web research with citations live in the agent-generated artifacts that fed this synthesis (paths in the session's plan history).

---

## Tier A — Anti-Deprecated Audit (do first, small)

Goal: ensure nothing the extension provisions today relies on deprecated approaches.

| ID | Item | Investigation needed | Likely outcome |
|---|---|---|---|
| A1 | **fstab.yaml necessity** | The Config Service `content.source` is the modern way to declare content sources. fstab.yaml is "legacy but still active" — the Helix Admin `DELETE /live` endpoint uses it as a guard. Audit whether we still need to write it. | Probably keep for now (Helix Admin guards), but document why and gate removal on Adobe's deprecation. |
| A2 | **Dead folder-mapping code** | Phase 1 stopped *calling* `setFolderMapping`, but the method + `DEFAULT_FOLDER_MAPPING` constant + tests remain. | Remove if confirmed unused; keep as named utility only if non-Commerce use cases exist (no current evidence). |
| A3 | **Static robots.txt referencing unimplemented sitemap-index.xml** | `config-template.json` ships robots.txt pointing at a sitemap that doesn't exist. | Fix by generating the sitemap (see B1) — until then, this is broken-by-default. |
| A4 | **Mesh GraphQL introspection in user-selected workspaces** | When a user picks what looks like a prod workspace, introspection is left on. | Surface a "production hardening" toggle on mesh deploy; default off when workspace name matches prod-ish patterns. |
| A5 | **Storefront Events config wiring scope check** | Investigate whether the CitiSignal template reads the Data Stream ID / Commerce endpoint from a Demo-Builder-written config (`config.json` / `.env`), or whether the template handles those internally. | If config-file driven → B2 stays in scope. If template-internal → drop B2 and mark Events init as template's responsibility in the scope principle. |

**Effort**: 1-2 days of focused investigation + a small follow-up PR per item. None block the rest of the roadmap.

---

## Tier B — Demo-Quality Quick Wins (high value, low effort)

Filtered against the scope principle: only items that touch infrastructure or repo-level config (not storefront feature code).

| ID | Item | Why it fits the principle | Files |
|---|---|---|---|
| B1 | **Sitemap + robots.txt generation at setup** | Config files Demo Builder already writes during setup. EDS has built-in sitemap support via `query-index`. Closes A3 (broken-by-default robots.txt reference). | `src/features/eds/services/configGenerator.ts`, `config-template.json` |
| B2 | **Per-project Storefront Events config wiring** *(scope confirmation needed)* | The Events SDK init code lives in the template (template's job). But the per-project config — Data Stream ID, Commerce environment endpoint — is Demo Builder's territory if there's a config file to write. **Open question**: does the template read this from `.env` / `config.json` (Demo Builder writes), or hardcode it (template's job)? Investigate before scoping. | `config-template.json` plus a per-project config writer if needed |
| B4 | **GitHub Actions: lint + Lighthouse-CI on PR** | Templated workflow files committed at repo creation time. Repo-level scaffolding fits Demo Builder's scope cleanly — no storefront code touched. | `src/features/eds/services/githubRepoOperations.ts` — commit `.github/workflows/*.yml` files |

**Removed (storefront-feature scope, template's responsibility):**

- ~~B3 — AEM Experimentation plugin install~~ → plugin lives in the storefront repo's JS; template's job.

**Effort per remaining item**: each is a focused `/rptc:feat` of 1-2 days.

---

## Tier C — Multisite-Ready Architecture (decisions, not implementation)

Goal: make sure today's code doesn't foreclose Repoless multisite support tomorrow.

The Adobe Repoless multisite pattern shares one Git repo across multiple aem.live sites (one per locale or environment), each with its own Config Service entry pointing at different content sources. Demo Builder currently encodes single-env assumptions in three places:

1. **Project state**: `componentInstances[EDS_STOREFRONT].metadata` holds one `daLiveOrg` + `daLiveSite`. Multisite needs a list keyed by env/locale.
2. **`buildSiteConfigParams`**: takes one org/site. Multisite needs one call per env, OR a list-aware variant.
3. **Mesh deployment**: one workspace per project. Multisite needs one workspace per env.

| ID | Item | Action |
|---|---|---|
| C1 | **Write an ADR for multisite architecture seam** | Add as `docs/architecture/adr/003-multisite-architecture-seam.md` (continues the existing sequence after 001-component-naming-standardization and 002-helix-bulk-api-fallback). Capture the three points above + decision criteria for when to break the single-env assumption. **Implementation deferred**; the ADR makes future scope concrete. |
| C2 | **Project state shape review** | While doing future work, prefer state shapes that *could* extend to a `{ environments: { [env]: {...} } }` keyed structure — without actually changing the schema today. Example: any new metadata field added now should default to "main" env, not be hardcoded as global. |
| C3 | **No multisite implementation in this roadmap** | Repoless multisite is a heavy lift (per-env Config Service, per-env mesh, per-env preview URLs, per-env state). Don't take it on until a demo actually needs it. The ADR + the discipline of C2 keep the door open. |

**Effort**: 1 day for the ADR. Ongoing discipline cost is negligible.

---

## Tier D — Substantial Demo Features (scope individually)

Filtered against the scope principle: only items that are infrastructure or services Demo Builder deploys (not storefront features installed into the repo).

| ID | Item | Why it fits | Effort |
|---|---|---|---|
| D1 | **Prerender service template + per-project deployment** | Makes Phase 2 BYOM plumbing actually useful. Provide a Cloudflare Worker / I/O Runtime starter wrapping `adobe-rnd/aem-commerce-prerender`; Demo Builder deploys it per project and writes the URL into `byomOverlayUrl`. Per-project deployment is the realistic path — no Adobe-shared service to point at. This is **deployed infrastructure**, not storefront code, so it fits Demo Builder's scope. | Large — new infra component |

**Removed (storefront-feature scope, template's responsibility):**

- ~~D2 — Live Search storefront widgets~~ → widgets ship in the storefront repo; template's job.
- ~~D3 — User Auth drop-in + Commerce Login block~~ → drop-ins ship in the storefront repo; template's job.

Dropped from earlier drafts (not scope-eligible):
- ~~Multi-environment Config Service entries~~ → moved to Tier C as architecture decision, not implementation.

---

## Tier E — Out of Scope for Demo Builder

Customer-owned infrastructure or paid Adobe services. Demo Builder can at best generate snippets/checklists, but shouldn't take responsibility:

- BYO CDN configuration (customer credentials)
- Custom domain + SSL (customer DNS + registrar)
- Adobe Analytics / Target / AEP wiring (customer Launch + Data Stream)
- APM integration (customer tooling)
- 24/7 synthetic monitoring (Adobe-side)
- DNS TTL pre-cutover changes (customer registrar)

These could surface as a future "Production Connect" UX — a separate flow customers run after demo handoff. **Not part of this roadmap.**

---

## Recommended Sequence

After scope filtering, the remaining items are:

1. **Tier A audit** (its own `/rptc:feat` cycle, all four items together) — anti-deprecated cleanup. Small.
2. **B1 sitemap + robots.txt** — closes A3, quick win.
3. **C1 multisite ADR** (`docs/architecture/adr/003-multisite-architecture-seam.md`) — write before D-tier work so multisite seams are documented.
4. **B2 Storefront Events config wiring** — runs only if Tier A item A5 confirms there's a per-project config file to write. Otherwise drops from the roadmap.
5. **B4 GitHub Actions workflows** — templated CI scaffolding.
6. **D1 Prerender service** — biggest lift but makes Phase 2 actually useful. Per-project deployment.

**Tier E items**: revisit only if customer-handoff UX becomes a priority. Not now.

---

## Resolved Decisions (user-confirmed)

- **Tier A** runs as its own `/rptc:feat` cycle (all four items together) — not folded into adjacent features.
- **ADR location** is `docs/architecture/adr/`. The multisite ADR will be `003-multisite-architecture-seam.md`, continuing the existing sequence.
- **D1 prerender** ships as per-project deployment. No Adobe-shared service to point at — Demo Builder owns the deploy.
- **Scope principle**: storefront features (widgets, drop-ins, blocks) belong to the template, not Demo Builder. This removed D2 (Live Search widgets), D3 (Auth drop-in/Login block), and B3 (Experimentation plugin) — all are template responsibilities.

## Open Questions

All earlier questions resolved. B2's scope decision is deferred to the Tier A audit cycle (item A5).
