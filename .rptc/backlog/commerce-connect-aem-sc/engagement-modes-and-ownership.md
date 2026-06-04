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
| **C — Federated composition** | Commerce org | **Content's own org** | Content party | **2 repos** (forks of a shared source) | high (cross‑org transact, CORS, sync) |

- **B and C share the same labor division**; they differ *only* in **where the AEM instance lives**.
- **Mode B** (newly clarified): one org holds backend + AEM; the content party authors via a Cloud‑Manager / AEM author‑access grant. Satisfies the canonical site rule trivially (single org) and the labor division (commerce hosts the entitlement, content does the work). **Least brittle two‑party shape.**
- **Mode C** is the original locked target — needed only when the content party must use **their own** AEM tenant. Carries the full two‑fork / cross‑org cost. **Slice 1 builds its substrate.**

## Federation & ownership (Mode C)

- **"Federated" = a shared code source** both parties sync from (and may contribute to via GitHub collaboration). It is *not* a master/downstream hierarchy; "master" language is retired.
- The canonical rule binds one repo's **`fstab.yaml`** (content source) and **`config.json`** (backend) to one site. Independent authoring ⇒ each party's repo differs **only in those two files** — exactly the files the sync engine already preserves. So "two repos, byte‑identical except `fstab`/`config`" is the *mechanism*, not a limitation.
- **Who hosts the shared source repo** = process choice (whoever starts), not a role. The other party forks it.

## UX entry (distinct up‑front move)

The first screen asks **what you're doing**, never **who you are**:

1. **Solo storefront** (Mode A) — content source: DA.live *or* your AEM Sites (AEM option gated on entitlement).
2. **Start a shared storefront** — *you host*; invite a collaborator. Resolves to Mode B or C by where AEM lives.
3. **Join a shared storefront** — *you were invited*; set up your side (verify access → fork/author).

Roles (commerce/content) are never asked; they **emerge** from "do you have a backend?" and "where will you author?" The extension's job is capabilities + preflight (entitlement/access checks) + invite/fork/sync.

## Determinant — RESOLVED (2026-06-04): Mode C is the target

The content party authors in **their own AEM, in their own IMS org** — each content SC literally has their own org; that's how they work today.

- **Mode C (federated cross‑org composition) is the primary two‑party target.** Slice 1's two‑fork plumbing is the correct substrate.
- **Mode B (co‑located) is possible but dispreferred** — content SCs want to own/author their own instances, not author in the commerce party's org. Keep only as a fallback.
- **Mode A (solo) is provided as an explicit niche option** in the extension (one user, one org; content source = AEM Sites or DA.live, entitlement‑gated). Cheap — it's the solo flow + the content‑source choice.

## Per-SC wizard flows (Mode C)

Mirroring (one shared package; mirror-by-fork-of-master — see [compositional-demo-builder](../compositional-demo-builder.md)) makes the two wizards diverge at **three touchpoints**; the joiner inherits the rest.

| Touchpoint | Starter (Commerce SC / Mode-A solo) | Joiner (Content SC) |
|---|---|---|
| Brand identity | Brand gallery → pick package (seeds the master) | **No gallery** — accept join handoff `{master repo, endpoint, package id}`; brand inherited |
| Repo creation | Generate from package boilerplate → **this repo is the master** | **Generate from the master** (mechanism below) |
| Content seed | Package `contentSource` → their DA.live/AEM | Package id (from handoff) → brand starter content into **their own** AEM/DA.live |

The joiner inherits via the generated copy: store codes (package `configDefaults` / master `config.json`), backend endpoint (master `config.json`), blocks (copied code); CORS handled at the ACCS edge.

- **Starter** (≈ today's flow, tagged "start shared"): brand gallery → Connect-Commerce (their backend) → their content → generate repo (**= the master**, flagged `is_template`) → share master + emit handoff.
- **Joiner** (net-new): "Join a shared storefront" → accept handoff (verify collaborator access) → *[skip prerequisites / mesh / adobe-IO]* → name the new repo → backend **inherited** (endpoint from master, store codes from package id; confirm, no discovery) → connect **own** AEM/DA.live → **generate from the master** (fstab → own content source; config inherited) → optionally seed brand starter content → create.

Up-front entry: **Solo / Start shared → gallery; Join shared → handoff.**

### Mechanism: "fork the master" = template-generate + existing sync (verified against GitHub docs, 2026-06-04)

"Fork the master" is implemented with **existing** code paths — **not** a GitHub-native fork:

- **Repo creation:** the **joiner's own extension** (authenticated as the joiner, with **collaborator read access** to the master) calls `createFromTemplate` (`POST /repos/{owner}/{repo}/generate`) with the **master** as `template_owner/template_repo` → a new repo **in the joiner's account**. GitHub docs confirm *anyone with read access to a template can generate from it*, and generate is *"for the authenticated user"* — exactly the per-user-extension model. The master must be flagged **`is_template: true`** (a toggle the starter's "share" step sets; a repo can be a template **and** a live repo at once).
- **Ongoing sync:** the existing `templateSyncService` (adds the source as a git remote and fetches — it does **not** rely on a GitHub fork connection) syncs the joiner's repo from the master via `templateOwner/templateRepo = master`; reset-to-upstream default (D2).
- **Why generate, not fork:** the sync engine already does its own remote + fetch, so the fork connection buys nothing; and a private personal-account fork leaks visibility to external collaborators. Generate (single-commit, disconnected) + metadata-driven sync is cleaner and reuses today's code. *(Resolves the earlier "fork vs template-generate" open mechanic → template-generate.)*

**Verified:** the GitHub mechanism (collaborator-read generate from a private `is_template` master into the joiner's own account) is feasible per GitHub's documented API. **Not yet verified (spike-gated):** the joiner authoring in **their own AEM** (fstab → their AEM — the spine) and **cross-org transacting writes**. **Slice 1 proves the repo + inherit + content-source + sync plumbing on DA.live — i.e., the joiner flow minus AEM.**

### Master visibility & joiner collaboration setup — DECISION (2026-06-04): public master

**Assume the master is public.** GitHub lets anyone read / generate from a public template, so the **joiner needs no collaborator invite, no acceptance, no identity exchange** — only the master's repo identity. (Storefront is boilerplate + brand design; `config.json` holds only public-by-nature values: endpoint + public keys already served to browsers.) The joiner needs **no Adobe-side collaboration** either (own AEM; backend read by URL; CORS edge-handled). A **private master + invite/accept handshake** (`PUT /repos/.../collaborators/{username}` → joiner `PATCH /user/repository_invitations/{id}`) remains a documented **fallback** for repo-visibility-policy orgs, but is not the default.

### Joining — how it's communicated in the UI

With a public master, **"joining" is a single paste of a link**; the extension resolves the rest by reading the public master.

- **Starter side:** after creating a "start shared" storefront, the project dashboard surfaces a **"Share storefront"** action → a copyable **join link** (the public master repo URL, optionally wrapped as a `demo-builder` join code) to send out-of-band (Slack/email). No in-app account linking.
- **Joiner side:** the projects home screen carries a **distinct "Join a shared storefront"** entry (separate from "Create" — the flow starts from a link, not the brand gallery). It opens **one field: "Paste the storefront link"** → the extension reads the master's `config.json` (endpoint, store codes) + a small **self-describing marker** written into the master (package id, flow) → shows a **confirmation preview** ("You're joining **CitiSignal**, shared by `<owner>` → backend `<endpoint>`; you'll author in your **own** AEM/DA.live") → into the gallery-less joiner wizard.
- **Token:** the public master repo URL is the single join token; everything else is read from the public repo. **Build implication:** write a small self-describing marker (package id, flow) into the master at creation.
- **Trust gate:** the confirmation preview (before any repo is created) is where the joiner verifies brand + backend.

Maps to the up-front entry: **Solo / Start shared → gallery; Join shared → paste link.** Refines **Slice 1 Step 2**: the content-SC entry is a **"Join" entry that takes a link, resolves it, then opens the gallery-less wizard** (buildable on DA.live; content-source-agnostic).

## Collaboration surfaces (Mode C)

Because each party works in their **own IMS org** and authors in their **own AEM**, the cross‑org surface is tightly bounded — three surfaces, only one of them cross‑org:

| Surface | Cross‑org? | What's needed | Automate vs process |
|---|---|---|---|
| **Code (GitHub)** | No (GitHub is org‑agnostic) | Content party forks the shared source + syncs | **Automatable** — invite / fork / sync |
| **AEM (author)** | **No** | Each authors in their **own** AEM, own org | **Zero cross‑org work** — self‑contained per party |
| **Backend (transact)** | **Topology-dependent** | **ACCS-first + per-org mesh (recommended): CORS is set in each party's *own* mesh; the mesh reads ACCS server-side by URL + public key — no PaaS backend, no cross-org step.** Direct-backend allow-list is **PaaS-only** (no such knob on ACCS). On ACCS, **documentation indicates the edge handles CORS** (read path is browser-direct by design; CORS config is PaaS-only) → **mesh not required for CORS**; confirm the transactional endpoint live (spike). | Mesh is **optional**, not mandated. |

Key simplifiers from "own IMS org each":

- **No cross‑org AEM** — nobody authors in anyone else's instance (the Mode‑B access‑grant apparatus is not needed).
- **No cross‑org IMS auth for the content party** — storefront reads the backend by URL + public keys; store codes come from the shared package/config, not live discovery. The content party never signs into the commerce org.
- Cross‑org CORS is **topology‑dependent** (verified 2026‑06‑04 — see [research](../../research/2026-06-04-cross-org-cors-and-mesh.md)): with the recommended **ACCS‑first + per‑org mesh**, CORS is configured in **each party's own mesh** (their App Builder) and the mesh reads ACCS server‑side by URL + public key — **no PaaS backend, and the cross‑org handshake dissolves**. Only the no‑mesh **direct‑backend** fallback needs the commerce party to allow‑list the content domain (a bidirectional, sequenced handshake; a first‑class association/invite artifact can carry the domain back). **Same‑origin** (Adobe's global best practice) needs one shared domain → Mode A only.
- **Still to verify live:** cross‑org *transacting* (cart/checkout **writes**), not just CORS — the spike's deferred item. CORS is necessary, possibly not sufficient.

**Slice 1 touchpoint:** the DA.live content fork also transacts, so its domain needs backend CORS too. Trivial in Slice 1's typically same‑org test, but the seam (publish domain → allow‑list) should be acknowledged so the Slice 2 cross‑org case slots into the same plumbing.
