# Storefront topology — how the two SCs share one demo

**Filed:** 2026-06-04 · The **authoritative architecture** for this feature. Read after [overview](./overview.md).

## The rule everything bends around

Adobe EDS has a **canonical-site rule: one code repo serves exactly one org's site** — you cannot have one repo serving two Adobe orgs. The sanctioned cross-org move is **fork into your own org**. And **one site has exactly one content source** (DA.live *or* AEM, never both). *(grounded in [`configurationService.ts`](../../../src/features/eds/services/configurationService.ts); established in [commerce-connection-kit](./commerce-connection-kit.md).)*

**So a single neutral *live* storefront shared by both orgs is not possible.** Each live site is org-bound. This is the constraint the whole design bends around.

## What can and can't be shared across the two orgs

| Layer | Shareable? | How |
|---|---|---|
| **Content** (AEM-authored pages) | **No** | One site = one content source, org-bound. |
| **Code** (commerce dropins + custom blocks) | **Yes** | A neutral upstream that each org **forks**. |
| **Commerce backend** | **Yes** | Consumed by URL + public keys; org-agnostic. |

**The constant that falls out of this:** the combined customer-facing demo (AEM content + commerce) **always lives in the Content SC's org** — because only their AEM content can be that site's content source. The two shapes below differ only in *how the commerce code gets there and stays current.*

## The two shapes

### Shape 1 — one-off code drop (the first increment)
The Commerce SC adds the commerce dropins **directly into the Content SC's repo** (GitHub collaboration — a GitHub user pushing to a repo; **GitHub access ≠ Adobe org**) and hands over the backend URL. One combined site, in the Content SC's org. Simplest; **static** — improvements must be re-dropped.

### Shape 2 — neutral upstream + per-org forks (the target, full symmetry)
A neutral **upstream** holds the shared storefront *code* (**not a live site**). Each SC forks it into their own org; each fork syncs from the upstream; all forks point at the one backend.

```
              ┌───────────────────────────┐
              │   Neutral UPSTREAM (code)  │  shared GitHub org; NOT a live site
              │   commerce dropins +       │  seeded from the commerce boilerplate
              │   shared custom blocks     │  maintained by the Commerce SC
              └───────┬───────────┬────────┘
                 sync │           │ sync
          ┌───────────▼──┐   ┌────▼──────────────┐
          │ Commerce SC  │   │ Content SC         │
          │ FORK (org A) │   │ FORK (org B)       │
          │ DA.live      │   │ AEM Sites content  │ ← the combined demo
          │ content      │   │ (their content)    │
          └───────┬──────┘   └─────────┬──────────┘
                  │   both point at     │
                  └──► Commerce backend (by URL) ◄──┘
```

- The **upstream is the neutral shared repo you wanted** — legal because it's *code*, not a live site.
- Each fork is org-bound (satisfies the canonical-site rule) and keeps its **own** content source + backend config — the sync engine already **preserves** `config.json`/`fstab.yaml` per fork.
- **Content is per-fork, never shared:** the Content SC's fork (AEM content) is the combined demo; the Commerce SC's fork is their own commerce demo. What they share is **code + backend**, not content.
- Shape 1 is just shape 2 minus the upstream — a manual snapshot instead of a living link. **Same path, one step apart.**

## The upstream decision (settled 2026-06-04)

- **Neutral fresh repo, seeded from the commerce boilerplate** — *not* the Commerce SC's live demo. A live site makes a poor upstream: it carries org-specific config (its content source, its `config.json`) and that one site's noise. The upstream should carry only what's genuinely shared.
- **Hosted** in a neutral/shared **GitHub** org (GitHub isn't Adobe-org-bound, so this side-steps the two-org rule), both SCs as collaborators.
- **Maintained** by the **Commerce SC** (owner of commerce); changes flow to both forks via sync.
- **Full symmetry:** the Commerce SC's own demo is **also a fork** of the upstream — so their custom commerce blocks live in the upstream and reach both demos.
- **Per-scenario** upstream for now; a reusable customization layer across many scenarios is a later question.

## The mesh — optional, and not necessarily cross-org

**API Mesh** is a hosted gateway that presents several commerce services (core Commerce GraphQL + Catalog Service + Live Search) to the storefront as **one GraphQL endpoint**, holding the private keys server-side. It is a **convenience/integration layer, not a hard requirement** — the config generator **uses a mesh endpoint if one is deployed, else falls back to the backend URL directly** *([`configGenerator.ts`](../../../src/features/eds/services/configGenerator.ts)).* Rule of thumb: **PaaS** usually wants a mesh (multiple services to stitch); **ACCS / SaaS** often doesn't.

**"Cross-org mesh" is a design choice, not a necessity.** It only arises if both forks share the *Commerce SC's* one mesh:

| Option | Mesh setup | Cross-org call? |
|---|---|---|
| **A — one shared mesh** | Commerce SC's mesh; both forks call it | **Yes** — Content SC's storefront → Commerce SC's mesh (the item on the verify list) |
| **B — a mesh per org** (default) | Each SC deploys their own mesh pointing at the shared backend | **No** — each storefront calls its own org's mesh; only the *mesh→backend* hop crosses orgs, and that's the org-agnostic backend read we already trust |

**Default to B** — it removes the cross-org mesh question entirely (leaning only on org-agnostic backend consumption) at the cost of each SC deploying a mesh in their own org (which the extension already does). Option A is simpler operationally (one mesh) but puts the cross-org call on the critical path. Or skip the mesh on SaaS backends.

## Reuse vs net-new

| | Reuses today | Net-new |
|---|---|---|
| **Shape 1** | block/feature installers, Connect-Commerce, config preservation | AEM Sites content source; Commerce SC acting on a repo they don't own |
| **Shape 2** | + the **sync engine** (upstream→fork, 1:1, preserves per-fork config) | + the neutral upstream + **multi-fork orchestration** (today: single-project, one upstream per project, one active GitHub account) |

**Biggest shared net-new: AEM Sites as a content source.** The extension is **DA.live-only** today — the existing AEM author URL is only for Universal Editor punch-out on DA.live content. This is a **new integration**, not a config of what's there.

## Needs live verification

`aem-boilerplate-xcom` maturity; the AEM code-sync app; CORS on the commerce endpoint; **the cross-org mesh call — but only if we pick mesh option A** (option B / per-org mesh avoids it). (Adobe docs block programmatic fetch — verify in a live environment before code lands.)
