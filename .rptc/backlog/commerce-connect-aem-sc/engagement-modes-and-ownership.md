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

## Open determinant (gates build order)

**Does the content party author in an AEM that lives in the *Commerce* party's org (Mode B — single org, granted access) or in *their own* org (Mode C — cross‑org, two forks)?**

- **If Mode B is acceptable** for the common case → dramatically less brittle; the first composed‑mode build should target **single‑org collaboration** (one project + AEM content source + access‑grant management), *not* the two‑fork plumbing.
- **If Mode C is required** (content party insists on their own tenant) → the **two‑fork plumbing (Slice 1)** is the correct substrate.
- **Slice 1 (DA.live two‑fork plumbing) is unaffected as a substrate/learning exercise** either way — but the determinant decides whether it is the *primary* path or the *premium edge case*.
