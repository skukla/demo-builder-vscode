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

## Collaboration surfaces (Mode C)

Because each party works in their **own IMS org** and authors in their **own AEM**, the cross‑org surface is tightly bounded — three surfaces, only one of them cross‑org:

| Surface | Cross‑org? | What's needed | Automate vs process |
|---|---|---|---|
| **Code (GitHub)** | No (GitHub is org‑agnostic) | Content party forks the shared source + syncs | **Automatable** — invite / fork / sync |
| **AEM (author)** | **No** | Each authors in their **own** AEM, own org | **Zero cross‑org work** — self‑contained per party |
| **Backend (transact)** | **Topology-dependent** | **ACCS-first + per-org mesh (recommended): CORS is set in each party's *own* mesh; the mesh reads ACCS server-side by URL + public key — no PaaS backend, no cross-org step.** Direct-backend allow-list is **PaaS-only** (no such knob on ACCS); on ACCS the only options are a per-org mesh or ACCS auto-allowing storefront origins (unverified — see spike). | Mesh path = self-contained per org (auto). Mesh is **verify-then-decide**, not mandated. |

Key simplifiers from "own IMS org each":

- **No cross‑org AEM** — nobody authors in anyone else's instance (the Mode‑B access‑grant apparatus is not needed).
- **No cross‑org IMS auth for the content party** — storefront reads the backend by URL + public keys; store codes come from the shared package/config, not live discovery. The content party never signs into the commerce org.
- Cross‑org CORS is **topology‑dependent** (verified 2026‑06‑04 — see [research](../../research/2026-06-04-cross-org-cors-and-mesh.md)): with the recommended **ACCS‑first + per‑org mesh**, CORS is configured in **each party's own mesh** (their App Builder) and the mesh reads ACCS server‑side by URL + public key — **no PaaS backend, and the cross‑org handshake dissolves**. Only the no‑mesh **direct‑backend** fallback needs the commerce party to allow‑list the content domain (a bidirectional, sequenced handshake; a first‑class association/invite artifact can carry the domain back). **Same‑origin** (Adobe's global best practice) needs one shared domain → Mode A only.
- **Still to verify live:** cross‑org *transacting* (cart/checkout **writes**), not just CORS — the spike's deferred item. CORS is necessary, possibly not sufficient.

**Slice 1 touchpoint:** the DA.live content fork also transacts, so its domain needs backend CORS too. Trivial in Slice 1's typically same‑org test, but the seam (publish domain → allow‑list) should be acknowledged so the Slice 2 cross‑org case slots into the same plumbing.
