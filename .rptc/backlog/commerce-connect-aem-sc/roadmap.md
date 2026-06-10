# Build sequence — repoless with per-org content sources (the locked target)

> **Target (locked 2026-06-05):** **repoless** with per-org content sources — one shared code repo (the Commerce SC's xcom-based upstream), two `aem.live` sites pointing at it (Commerce SC's canonical + Content SC's repoless satellite), each with its own AEM-authored content. Architecture + decision trail + validation evidence: [storefront-topology](./storefront-topology.md).
>
> **Architectural unknowns are closed.** Cross-org repoless verified live 2026-06-05 (HTTP 201 from Admin API + 45-second runtime propagation). AEM Sites + xcom architecture verified via [`roberttoddhoven/citisignal-one`](https://github.com/roberttoddhoven/citisignal-one) as the worked example. The build proceeds without a gating spike.

## What to build, in order (each tagged EXISTS / PARTIAL / NET-NEW)

1. **Pick + register the shared upstream.** — **EXISTS.**
   `aem-boilerplate-xcom` is public, supported, and templates with `gh repo create --template adobe-rnd/aem-boilerplate-xcom`. The Commerce SC's GitHub org owns the repo; AEM Code Sync installed once. Their `aem.live` site auto-provisions as the canonical anchor (`org/site` matches `owner/repo`). The extension's existing repo-creation machinery covers this; the only new bit is the explicit "this is the upstream" framing.

2. **Repoless-satellite site creation.** — **NET-NEW (small).**
   The Content-SC wizard ends in a single Admin API call:
   ```
   PUT /config/{contentSC-org}/sites/{site}.json
   { code: { owner: <commerceSC-org>, repo: <upstream> },
     content: { source: { url: <content-source>, type: "markup" } } }
   ```
   `ConfigurationService.ts` already speaks this API. The new piece is the wizard step that gathers `{commerceSC-org, upstream-repo, content-source-url}` and emits the PUT.

3. **AEM Sites as a content source.** — **NET-NEW (the spine — but architecturally closed).**
   Teach the extension to wire a satellite site's content source to **AEM Sites** (Code Sync App on the canonical, tech account auth, Universal Editor) in the Content SC's own Adobe org. The extension is **DA.live-only** today (`fstabGenerator.ts`, `edsPipeline.ts` all assume DA.live). CitiSignal One is the worked example to mirror; no architectural risk, just wiring work.

4. **Config-as-content writer.** — **NET-NEW (replaces existing `config.json` writer).**
   Replace today's "write `config.json` to the repo root" with "author `configs`/`configs-dev`/`configs-stage` nodes in AEM via the Configuration Service" per the CitiSignal `paths.json` mapping pattern. The values Connect-Commerce already produces are the same shape; only the destination changes. Multi-environment from day one — three AEM environments map to three sites or three content sub-trees.

5. **Backend wiring.** — **EXISTS** (Connect-Commerce already produces the right config; the writer above changes where it lands).
   Both sites point at the Commerce SC's backend. The Commerce SC publishes their commerce values as content in their site; the Content SC's site mirrors or independently authors the same `tenantId` / `AC-View-ID` / `AC-Source-Locale`. **No CORS coordination needed** — Merchandising API requires no authentication, ACCS handles edge CORS. **No mesh required.** A mesh remains optional via the existing `configGenerator.ts` fallback.

## The constant

Both sites are **identical by shared code, differentiated by content and per-site config**. Each authors content in its own Adobe org; the Content SC's content lives in their AEM Sites. Both transact against the Commerce SC's backend. Two sites, one codebase — not by sync, by Configuration Service.

## What dropped from the prior roadmap

- ❌ **Fork-from-template per SC** — replaced by repoless satellite creation
- ❌ **Sync engine driving two forks** — not needed; both sites read the same upstream natively
- ❌ **Per-fork `config.json`/`fstab.yaml` preservation logic** — config is content; fstab is replaced by Configuration Service `ContentConfig`
- ❌ **CORS allow-listing as a coordination step** — Merchandising API is no-auth; ACCS edge CORS handles the storefront origin
- ❌ **Two-fork state model in `stateManager.ts`** — each SC's wizard creates one repoless site; no two-fork coupling

What survives from sync-engine code is its content-side utility (block libraries, feature packs) where appropriate; code-side sync is no longer used.

## Later (not first pass)

- **Content SC contributing to the shared codebase** — PRs against the upstream. Standard GitHub flow; no extension support needed.
- **Invite/handoff** between the SCs (vs. sharing the upstream URL manually).
- **Shared cart/session** across the two sites (deliberate shared auth).
- **Fork-and-own-your-code escape hatch** — when a Content SC genuinely needs code customization, they fork the upstream into their own GitHub org and switch their site's `code.owner` to the fork. Manual config change today; wizard support can come later if the case recurs.

## Open questions to resolve as we go

- The wizard model: today `currentProject` is a single-site state; the repoless satellite still creates one site per project, so the singular model holds. The two-SC collaboration is two separate projects in two separate extension instances, not one project with two states.
- Two GitHub accounts in one workflow — *only* relevant if a single human runs both wizards back-to-back. The Content SC's repoless satellite uses the Commerce SC's GitHub org as `code.owner`; their own GitHub org only needs the prerequisite anchor repo with Code Sync installed (one-time setup).
- Whether the Content SC's wizard should programmatically discover the Commerce SC's `tenantId`/view-id from the Commerce SC's published config, or have the SC paste them in (the values are public; discovery is convenience, not a security boundary).
- Long-running demos that need code stability: a `code.ref` (branch/commit) parameter on the Configuration Service `CodeConfig` would let satellites pin to a specific upstream commit. Verify the API supports it before relying on this.
