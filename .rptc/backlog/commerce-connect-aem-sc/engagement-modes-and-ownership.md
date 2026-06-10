# Engagement modes, ownership & access — design-session refinement

**Filed:** 2026-06-04 · Extends [storefront-topology](./storefront-topology.md). Captures decisions from the Slice‑1 planning/design session. **Status: principles settled; one determinant open** (see end). Where this revisits the locked topology it says so.

## Principle: access-driven, not role-prescribed

The extension is per‑user and acts only for *its* user. It should encode **capabilities + preflight checks**, not fixed archetypes. Roles **emerge from access**, they are not asked:

- "I have a commerce backend" → commerce party (the one hard, Adobe‑gated asymmetry — backends go to commerce SCs only).
- "I can author AEM Sites" → content authoring.
- "I started it / it lives in my GitHub" → host.

**Ownership** (whose GitHub account hosts the shared repo) is a **process choice**, *facilitated* (invite + verify), not enforced in code.

## Fixed division of labor (settled)

Independent of topology:

- **Commerce party** → owns/wires the commerce backend.
- **Content party** → does **all** content / AEM Sites authoring.
- Commerce SCs *can* be granted AEM, but are **not content experts and will not own/maintain Sites** — they expect the content party to handle it.
- **Consequence:** a "commerce SC does everything solo (incl. authoring)" unified mode is **real but rare** (a multi‑skilled individual only). It is **not** the realistic two‑party model.

## Engagement modes

| Mode | Backend | AEM Sites location | Authoring | Git topology | Complexity |
|---|---|---|---|---|---|
| **A — Solo** | own org | own org | self | 1 repo / 1 site | low (= today's flow + AEM content source) |
| **B — Co‑located collaboration** | Commerce org | **Commerce org** (content granted author access) | Content party | **1 repo / 1 site** | **low–med — no forks, no cross‑org transact, no CORS** |
| **C — Federated composition** | Commerce org | **Content's own org** | Content party | **1 upstream repo + 1 repoless satellite** (no fork) | med–high (cross‑org transact, CORS; **no fork, no sync engine**) |

- **B and C share the same labor division**; they differ *only* in **where the AEM instance lives**.
- **Mode B** (newly clarified): one org holds backend + AEM; the content party authors via a Cloud‑Manager / AEM author‑access grant. Satisfies the canonical site rule trivially (single org) and the labor division (commerce hosts the entitlement, content does the work). **Least brittle two‑party shape.**
- **Mode C** is the original locked target — needed only when the content party must use **their own** AEM tenant. Carries the cross‑org cost, but **repoless removes the fork/sync cost** (one upstream + a satellite registration). **Slice 1 builds its substrate.**

## Federation & ownership (Mode C)

- **"Federated" = one shared code source** (the **upstream**) that both parties' sites point at. It is *not* a master/downstream hierarchy; "master" language is retired in favor of **upstream** (the shared code) + **canonical** (the Commerce SC's anchor site) + **satellite** (the Content SC's repoless site).
- The canonical rule binds **content source** (`fstab` / Config Service `content.source`) and **backend config** to one site. Under **repoless**, the per-site differences (content source, commerce config) live in each site's **Configuration Service registration + AEM-authored content** — *not* in a second repo. So there is **one repo** (the upstream), referenced by both sites; the Content SC's site is a **satellite** with its own content source and its own config-as-content. (This replaces the earlier "two repos, byte-identical except `fstab`/`config` + sync engine" two-fork framing.)
- **Who hosts the shared upstream** = process choice (whoever starts), not a role. The other party joins it as a **repoless satellite** — no fork.

## UX entry (distinct up‑front move)

The first screen asks **what you're doing**, never **who you are**:

1. **Solo storefront** (Mode A) — content source: DA.live *or* your AEM Sites (AEM option gated on entitlement).
2. **Start a shared storefront** — *you host*; invite a collaborator. Resolves to Mode B or C by where AEM lives.
3. **Join a shared storefront** — *you were invited*; set up your side (resolve the link → connect your own content → register a repoless satellite).

Roles (commerce/content) are never asked; they **emerge** from "do you have a backend?" and "where will you author?" The extension's job is capabilities + preflight (entitlement/access checks) + satellite registration (one Config Service PUT) — **no invite/fork/sync dance**.

## Determinant — RESOLVED (2026-06-04): Mode C is the target

The content party authors in **their own AEM, in their own IMS org** — each content SC literally has their own org; that's how they work today.

- **Mode C (federated cross‑org composition) is the primary two‑party target.** Slice 1's repoless satellite plumbing is the correct substrate.
- **Mode B (co‑located) is possible but dispreferred** — content SCs want to own/author their own instances, not author in the commerce party's org. Keep only as a fallback.
- **Mode A (solo) is provided as an explicit niche option** in the extension (one user, one org; content source = AEM Sites or DA.live, entitlement‑gated). Cheap — it's the solo flow + the content‑source choice.

## Per-SC wizard flows (Mode C)

Mirroring (one shared package; mirror-by-shared-upstream — see [compositional-demo-builder](../compositional-demo-builder.md)) makes the two wizards diverge at **three touchpoints**; the joiner inherits the rest.

| Touchpoint | Starter (Commerce SC / Mode-A solo) | Joiner (Content SC) |
|---|---|---|
| Brand identity | Brand gallery → pick package (seeds the canonical upstream) | **No gallery** — accept join handoff `{upstream repo, endpoint, package id}`; brand inherited |
| Site creation | Generate repo from package boilerplate → **this repo is the canonical upstream** (Code Sync installed) | **No repo** — register a **repoless satellite** that references the upstream as `code.owner` (mechanism below) |
| Content seed | Package `contentSource` → their DA.live/AEM | Package id (from handoff) → brand starter content into **their own** AEM/DA.live |

The joiner inherits **by reference, not by copy**: backend endpoint + store codes come from the upstream's committed **`storefront-share.json`** descriptor (an owned schema, *not* parsed from Adobe's `config.json`); blocks + design come from the **upstream code itself**, which the satellite reads through the Configuration Service `code` reference (nothing is forked or copied into the joiner's account); CORS handled at the ACCS edge.

- **Starter** (≈ today's flow, tagged "start shared"): brand gallery → Connect-Commerce (their backend) → their content → generate repo (**= the canonical upstream**, AEM Code Sync App installed) → share upstream + emit handoff.
- **Joiner** (net-new): "Join a shared storefront" → accept handoff (resolve the public link, no sign-in) → *[skip prerequisites / mesh / adobe-IO / repo creation]* → backend **inherited** (endpoint + store codes from the upstream's `storefront-share.json`; confirm, no discovery) → connect **own** AEM/DA.live → **register a repoless satellite** (Configuration Service: `code.owner = upstream`; content = own DA.live) → optionally seed brand starter content → create. **No repo, no fork, no Code Sync App install, no sync engine.**

Up-front entry: **Solo / Start shared → gallery; Join shared → handoff.**

### Mechanism: "join the upstream" = register a repoless satellite via the Configuration Service (locked 2026-06-06; verified live 2026-06-05)

> **Supersedes the earlier two-fork-sync mechanism** ("fork the master = template-generate + sync"), retired by the 2026-06-05 repoless repivot. The joiner **does not fork, does not generate a repo, does not install the AEM Code Sync App, and runs no sync engine.** That mechanism survives only as the manual fork-and-own **escape hatch** for a Content SC who needs to customize code (see [storefront-topology § Escape hatch](./storefront-topology.md#escape-hatch-fork-and-own-your-code)).

"Join the upstream" is the **Adobe-native repoless mechanism** — a satellite is a Configuration Service entry that references the upstream's code, not a copy of it:

- **Site creation:** the **joiner's own extension** (authenticated to Adobe via their DA.live / IMS token) calls `ConfigurationService.registerSite` → `PUT /config/{joiner-org}/sites/{site}.json` with `code: { owner: <commerceSC-org>, repo: <upstream> }` and `content: { source: { url: <joiner's DA.live>, type: 'markup' } }`. **No GitHub repo is created in the joiner's account.**
- **Code propagation:** the satellite reads the upstream code through that `code` reference. **AEM Code Sync stays entirely on the Commerce SC's canonical repo** — the joiner installs nothing on the GitHub side. A code change pushed to the upstream propagates to the satellite through the canonical's Code Sync.
- **Org prerequisite (one-time, not per-site):** each `aem.live` org must have a matching `github.com` org with at least one Code-Sync-synced "anchor" repo (the `kukla-demos/anchor` pattern). This is an org preflight, separate from per-satellite creation.
- **Why a Config Service reference, not generate-and-sync:** repoless is Adobe's first-class "one codebase, many sites" capability. Referencing upstream code avoids copying blocks, avoids a Code Sync install the joiner shouldn't need, and avoids ever pushing to a repo the joiner doesn't own (commerce config travels as content — config-as-content — not committed code). A single PUT replaces fork-from-template + sync orchestration entirely.

**Verified live (2026-06-05):** cross-org repoless works at runtime — `PUT /config/{orgB}/sites/{site}.json` with `code.owner = orgA` returned HTTP 201, and a marker pushed to org A's upstream appeared on org B's satellite within one Code Sync cycle (45s). See [architecture-validation](../../research/2026-06-05-architecture-validation.md). **Not yet verified (spike-gated, not a Slice 1 gate):** the joiner authoring in **their own AEM** (fstab → their AEM — the spine) and **cross-org transacting writes**. **Slice 1 proves the satellite + inherit + content-source plumbing on DA.live — i.e., the joiner flow minus AEM.**

### Upstream visibility & joiner setup — DECISION (2026-06-04, repoless-updated 2026-06-06): public upstream

**Assume the upstream is public.** The satellite references the upstream's code via the Configuration Service `code` block; a public upstream is readable by the Config Service / Code Sync with no grant, so the **joiner needs no collaborator invite, no acceptance, no identity exchange, and no GitHub account interaction on the happy path** — only the upstream's repo identity (resolved from the public `storefront-share.json`). (Storefront is boilerplate + brand design; the descriptor holds only public-by-nature values: endpoint + public keys already served to browsers.) The joiner's only sign-in is **Adobe-side** (DA.live / IMS, for their own content and the Config Service PUT) — not GitHub. A **private upstream** would require the Commerce SC to grant the satellite's Config Service access per Adobe's repoless docs; it remains a documented **fallback** for repo-visibility-policy orgs, but the public upstream is the default.

### Joining — how it's communicated in the UI

With a public upstream, **"joining" is a single paste of a link**; the extension resolves the rest by reading the public upstream.

- **Starter side:** after creating a "start shared" storefront, the project dashboard surfaces a **"Share storefront"** action → a copyable **join link** (the public upstream repo URL, optionally wrapped as a `demo-builder` join code) to send out-of-band (Slack/email). No in-app account linking.
- **Joiner side:** the projects home screen carries a **distinct "Join a shared storefront"** entry (separate from "Create" — the flow starts from a link, not the brand gallery). It opens **one field: "Paste the storefront link"** → the extension reads a single repo-committed **`storefront-share.json`** descriptor from the upstream (package id + inherited commerce coords: endpoint, store codes) → shows a **confirmation preview** ("You're joining **CitiSignal**, shared by `<owner>` → backend `<endpoint>`; you'll author in your **own** AEM/DA.live") → into the gallery-less joiner wizard. The descriptor is an **owned schema**; resolve does **not** parse Adobe's `config.json` (decouples us from Adobe's file format).
- **`storefront-share.json` vs `.demo-builder.json`:** these are distinct. `storefront-share.json` is the **repo-committed, publicly-readable** share descriptor (the thing a joiner reads remotely). `.demo-builder.json` is the **local per-project manifest** on the operator's filesystem (per-project state, never committed to the shared repo). The naming keeps them from being confused.
- **Token:** the public upstream repo URL is the single join token; everything else is read from `storefront-share.json` in the public repo. **Build implication:** write the `storefront-share.json` descriptor (package id + commerce coords) into the upstream at creation.
- **Trust gate:** the confirmation preview (before any repo is created) is where the joiner verifies brand + backend.

Maps to the up-front entry: **Solo / Start shared → gallery; Join shared → paste link.** Refines **Slice 1 Step 2**: the content-SC entry is a **"Join" entry that takes a link, resolves it, then opens the gallery-less wizard** (buildable on DA.live; content-source-agnostic).

#### Joiner's auth touchpoints (decision A: anonymous preview, sign-in at commit) — repoless

Under repoless, the joiner's GitHub interaction **collapses to a single unauthenticated public read**; everything else is **Adobe-side** (DA.live / IMS). There is no fork, no GitHub App install, and no sync:

| Touchpoint | When | Auth |
|---|---|---|
| **Resolve** (read the upstream's `storefront-share.json` descriptor) | paste-link / preview | **none** — unauthenticated `raw.githubusercontent.com` read |
| **Adobe / DA.live sign-in** | at create (for own content + the Config Service PUT) | Adobe IMS (DA.live token) |
| **Satellite registration** (`ConfigurationService.registerSite`, `code.owner = upstream`) | at create | Adobe IMS (DA.live token) |
| **Content authoring** (own DA.live, AEM in Slice 2) | at create / ongoing | Adobe IMS (DA.live token) |
| ~~Repo generation / GitHub App install / sync~~ | — | **not performed** (satellite has no owned repo) |

**Sequencing (A):** previewing a storefront requires **no sign-in** (public read). The only sign-in is **Adobe-side** at create — for the joiner's own content and the cross-org Config Service registration; **no GitHub sign-in is needed on the happy path.** (GitHub auth re-enters only in the manual fork-and-own escape hatch.) The only net-new piece at the home screen is the unauthenticated *resolve*.

## Collaboration surfaces (Mode C)

Because each party works in their **own IMS org** and authors in their **own AEM**, the cross‑org surface is tightly bounded — three surfaces, only one of them cross‑org:

| Surface | Cross‑org? | What's needed | Automate vs process |
|---|---|---|---|
| **Code (GitHub)** | No (the satellite references upstream code via the Config Service) | Content party registers a **repoless satellite** pointing at the shared upstream (`code.owner = commerceSC`); **no fork, no Code Sync install, no sync** | **Automatable** — one `ConfigurationService.registerSite` PUT |
| **AEM (author)** | **No** | Each authors in their **own** AEM, own org | **Zero cross‑org work** — self‑contained per party |
| **Backend (transact)** | **Topology-dependent** | **ACCS-first + per-org mesh (recommended): CORS is set in each party's *own* mesh; the mesh reads ACCS server-side by URL + public key — no PaaS backend, no cross-org step.** Direct-backend allow-list is **PaaS-only** (no such knob on ACCS). On ACCS, **documentation indicates the edge handles CORS** (read path is browser-direct by design; CORS config is PaaS-only) → **mesh not required for CORS**; confirm the transactional endpoint live (spike). | Mesh is **optional**, not mandated. |

Key simplifiers from "own IMS org each":

- **No cross‑org AEM** — nobody authors in anyone else's instance (the Mode‑B access‑grant apparatus is not needed).
- **No cross‑org IMS auth for the content party** — storefront reads the backend by URL + public keys; store codes come from the shared package/config, not live discovery. The content party never signs into the commerce org.
- Cross‑org CORS is **topology‑dependent** (verified 2026‑06‑04 — see [research](../../research/2026-06-04-cross-org-cors-and-mesh.md)): with the recommended **ACCS‑first + per‑org mesh**, CORS is configured in **each party's own mesh** (their App Builder) and the mesh reads ACCS server‑side by URL + public key — **no PaaS backend, and the cross‑org handshake dissolves**. Only the no‑mesh **direct‑backend** fallback needs the commerce party to allow‑list the content domain (a bidirectional, sequenced handshake; a first‑class association/invite artifact can carry the domain back). **Same‑origin** (Adobe's global best practice) needs one shared domain → Mode A only.
- **Still to verify live:** cross‑org *transacting* (cart/checkout **writes**), not just CORS — the spike's deferred item. CORS is necessary, possibly not sufficient.

**Slice 1 touchpoint:** the DA.live content satellite also transacts, so its domain needs backend CORS too. Trivial in Slice 1's typically same‑org test, but the seam (publish domain → allow‑list) should be acknowledged so the Slice 2 cross‑org case slots into the same plumbing.
