# AEM SC first-run & the front door

**Filed:** 2026-06-02
**Status:** Design (the AEM-SC first-run / front door). Feeds the [commerce-connect roadmap](../plans/2026-06-02-commerce-connect-roadmap.md) and pairs with [federated-two-instance-demos](./2026-06-02-federated-two-instance-demos.md) + [commerce-connection-kit](./2026-06-02-commerce-connection-kit.md).
**Why this exists:** the extension is commerce-centric end-to-end. An AEM SC's *first action* — "pick a commerce demo package" — is an immediate mismatch. A good AEM connect flow doesn't fix a commerce-first front door. This doc designs the coherent AEM-SC first-run.

## Where commerce bites at cold-start (today)

1. **Open the extension** → projects list. New AEM SC = empty state ("+ New"). OK so far.
2. **"+ New"** → the wizard opens on **`WelcomeStep` = demo-package selection** (CitiSignal, commerce brands, storefront configs). An AEM SC has no model for this. ← **first hard mismatch, at the first action.**
3. **Onward:** component selection (commerce frontends/backends), **Connect Commerce** (ACCS/PaaS store discovery), **EDS/DA.live** setup, **API Mesh**. Entirely commerce vocabulary + decisions.
4. A "connect to a commerce demo" option dropped into this still reads as one commerce option among commerce options.

## What the AEM SC actually wants

Not "pick a commerce package." It's: *"I have an AEM Sites instance; I want to demo authoring a storefront in it that shows commerce content."* First questions: which AEM instance, what storefront, connected to which commerce backend — in **AEM / Universal-Editor** terms.

## The shape: a front door + a separate AEM flow

The AEM SC's flow (URL → discover → scaffold `xcom` → wire AEM → author) **does not reuse the commerce wizard** (demo packages, stacks, mesh). So we don't refactor the commerce wizard — we add:
- a **front door** ("what are you here to do?") that **routes**, and
- a **separate, AEM-framed flow** behind the AEM choice.

The commerce wizard stays untouched for Commerce SCs; the AEM flow runs in parallel.

### The router (minimal now, grows into a solution selector)
- **Placement:** at "+ New" (and/or the empty state) — *before* the wizard.
- **Two doors now:** **Commerce demo** (existing wizard) | **AEM Sites storefront** (new flow, "connect to a commerce demo").
- **Designed so a 3rd+ door is additive** (App Builder, …) → the seed of full product-selection (the "Option C" solution-family bet), without building it now.

### The AEM-framed flow (the AEM SC's wizard) — AEM vocabulary throughout
| Step | What | Slice |
|---|---|---|
| 1. Connect | paste the Commerce demo's storefront URL → **discover** the connection; show what was found | 1 |
| 2. AEM target | their AEMaaCS (author URL, IMS org, program/site) + GitHub org | input |
| 3. Build | scaffold `xcom` in their org + **apply** the connection (progress display) | 2–3 |
| 4. Wire (guided) | Code Sync, Cloud Manager EDS site, IMS roles, enable UE — checklist + verify | 4 |
| 5. Author | open Universal Editor on their AEM author | — |

Vocabulary: "AEM Sites," "Universal Editor," "your instance," "commerce data" — **not** "demo package," "ACCS/PaaS stack," "deploy mesh."

## Shared-surface adaptation (the part that *isn't* purely additive)

The AEM-storefront project lands on surfaces that assume commerce/EDS:
- **Project manifest** — add a **`kind`** field (`commerce-demo` | `aem-storefront`). **Load-bearing:** the dashboard/sidebar/actions branch on it. Plus AEM metadata (author URL, IMS org, the discovered connection, the storefront repo). (See ADR-003's state-shape discipline — additive field, default the existing projects to `commerce-demo`.)
- **Dashboard** (`ProjectDashboardScreen`/`ActionGrid`) — branch on `kind`: an AEM project shows **Author in AEM**, a **commerce-connection** status (it *consumes*, doesn't *own* the backend), and the storefront URL; it **hides** Author-in-DA.live, Sync Storefront, Deploy Mesh, and commerce Configure (the AEM SC owns none of those).
- **Sidebar** — AI + Utilities stay global; context labels may differ.

## Additive vs touches-commerce-code

- **Additive:** the router; the AEM flow (its own steps); the discover/scaffold/apply plumbing (slices 1–3).
- **Touches commerce-assuming code:** the **manifest `kind` field** + the **dashboard's project-kind branching**. Targeted, not a rewrite.

## Relationship to product-selection (the "Option C" line)

**The router *is* minimal product-selection.** Recommendation: build the **two-option router** now, designed to grow into the fuller "pick your Adobe solution(s)" selector — do **not** build the full selector or a solution-aware component/stack/pipeline up front. The deep refactor (the closed step-condition vocabulary, `COMPONENT_IDS`/`isEdsStackId` conventions, the fixed `executor` pipeline) is only needed when a product must run *through* the commerce-shaped wizard/pipeline — which the AEM flow doesn't.

## Roadmap impact

- Slices 1–4 are the AEM flow's **plumbing + UI**.
- This **front door + first-run + shared-surface adaptation** is a distinct piece that *wraps* them:
  - **Reframe the roadmap's Slice 4** → "AEM-SC front door + connect-flow UI + shared-surface adaptation."
  - Thread the **manifest `kind` prerequisite** in when the AEM project is first created (slice 2/3).
- The headless plumbing (slices 1–3) is unaffected; the front-door/UX/adaptation is the user-facing slice.

## Open questions

- **Router placement:** empty state vs "+ New" menu vs a dedicated first-run welcome.
- **Dashboard:** adapt the existing one via `kind`-branching, or build an AEM-specific variant?
- **AEM flow form:** a multi-step wizard (like commerce) or a lighter single-screen connect?
- **UI vs agent:** the connect flow as a UI wizard, an MCP skill, or both (the earlier fork).
