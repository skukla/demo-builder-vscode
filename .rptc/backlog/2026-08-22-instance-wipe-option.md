---
id: DI-2
kind: feature
area: data-installer
needs: []
value: med
status: backlog
layer: F
---
# Instance wipe option — remove as much data as the service allows

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**FULLY DESIGNED 2026-08-23, then TABLED the same day by decision — bugfixes take priority.** The complete design lives in [`../research/instance-wipe-api-audit/research.md`](../research/instance-wipe-api-audit/research.md): the ACCS per-entity removability matrix (spec-diff of the full published REST surface, 489 ops / 51 DELETEs), the four load-bearing verdicts (App Builder cannot exceed the public API — sourced; website deletion does not remove orders; sales documents are the permanent floor; instance replacement via support ticket, credits returned, is the true clean slate), the three-phase wipe (pack discovery via the activity endpoint's instance filter — live-verified cross-pack — then a REST residue sweep, then order-cancel hygiene), the assisted-manual-step layer (instruct with exact codes → admin deep link → verify by API re-read with auto-poll; ACCS admin's store-structure delete buttons confirmed first-hand), and the three-surface communication model (Business Structure inline card, dashboard remedy-dot on the Datapacks tile, Instance Hygiene panel with a measured "Demo ready" verdict; read-only `check_instance_hygiene` MCP tool). First build slice when picked up: the headless hygiene service + read-only probes — every surface hangs off it. Service is frozen (owner retired, questions-only); the design uses only capabilities proven live. Filed 2026-08-22; designed and tabled 2026-08-23.

**Filed:** 2026-08-22, as the successor to
[`../complete/2026-08-17-what-does-a-datapack-removal-actually-delete.md`](../complete/2026-08-17-what-does-a-datapack-removal-actually-delete.md).

> **DESIGNED 2026-08-23 — full API audit done, ready to build.** The per-entity
> removability matrix, the four load-bearing verdicts (App Builder cannot exceed
> the public API on ACCS; website deletion does not remove orders; sales
> documents are the hard floor; instance replacement via support ticket is the
> real clean-slate path, credits returned), and the two-tier design live in
> [`../research/instance-wipe-api-audit/research.md`](../research/instance-wipe-api-audit/research.md).
> Design questions 1–4 below are all answered there: Tier 1 = discover every
> pack that touched the instance via the activity endpoint's `commerceInstance`
> filter (live-verified: cross-pack, cross-caller) and loop the existing removal
> spine; Tier 2 (direct-REST supplements) deferred on YAGNI; surface = a Data
> Installer action + a confirm-gated MCP tool over one shared headless function.
> One question worth relaying to the retired service owner when convenient:
> what the service's `sources` delete type actually does, since MSI sources
> cannot be deleted by design (disable-only per Adobe KB).
>
> **Scope expanded 2026-08-23 — the hygiene layer.** ACCS admin's store-structure
> delete buttons were confirmed first-hand, which reframed the feature: the wipe
> plus ASSISTED manual steps (instruct with exact codes, deep-link to the admin,
> verify by API re-read — the Code Sync precedent). Pre-demo readiness check
> (scope structure vs config codes, catalog-index probe, sample-data presence)
> and post-demo checklist (wipe → assisted structure teardown → recreate cards →
> stated floor), plus a read-only `check_instance_hygiene` MCP tool. Full design
> in the research doc.

## Provenance

The predecessor asked whether a datapack removal could give a clean instance.
Answered 2026-08-22 by the Data Installer service owner: it cannot — removal is
pack-scoped, and hand-created data is out of its reach. The "clean slate" want
survives the answer, so it becomes its own feature: an explicit wipe option
that removes as much data from the Commerce instance as is possible.

## Goal / Scope

Give a user a deliberate way to clear a demo instance's data down to whatever
floor the service permits, as a distinct action — NOT folded into reset (reset
already means "put the storefront back, optionally clear the pack"; a wipe is a
different promise and must not share a button with it).

Open design questions, in dependency order:

1. **What CAN be removed?** The service's removal is pack-scoped per data type.
   The maximal wipe available today is therefore: for every datapack the
   instance has seen, remove every data type it carries. What the union of
   known packs leaves behind (hand-created records, data from packs the
   extension never saw) defines the floor — and the wipe's honesty depends on
   stating that floor, not implying zero.
2. **Whose packs?** The project records only ITS datapack. A wipe that wants to
   go further needs the service to enumerate what was imported to the instance
   (does the activity endpoint expose enough? `get_datapack_activity` exists on
   the MCP surface). If enumeration is impossible, the wipe is scoped to what
   this project knows, and says so.
3. **~~Whether the service should grow a true wipe.~~ SETTLED 2026-08-23 by
   circumstance:** the service's owner has retired and the service is
   effectively LOCKED — no new capability is coming, so a server-side true
   wipe is off the table and the client-side union (questions 1–2) IS the
   design. He remains reachable for QUESTIONS (how existing behaviour works),
   just not for changes — so question 2's "does the activity endpoint expose
   enough?" can still be asked directly as well as probed. Weigh before
   building: this feature rides `operation_mode: 'delete'` on an unmaintained
   service; if the service breaks, nobody fixes it. That risk is worth an
   explicit go/no-go before design work starts.
4. **Surface.** Candidates: a Data Installer surface action (beside import), a
   dashboard kebab item, and the MCP tool surface (`reset_datapack` exists —
   check whether it is already the per-pack removal and whether a wipe is a
   loop over it or a new tool).

## Constraints

- **No undo.** Every removal is irreversible; the confirm must name what will
  be removed AND what will survive.
- The predecessor's finding stands: hand-created data survives any
  client-driven wipe. Never promise "clean instance" unless the service grows
  a true wipe (question 3).
- A six-type removal was measured at 470 seconds — a multi-pack wipe is
  potentially a very long operation; surface duration honestly.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-22-instance-wipe-option.md` and its predecessor
> in `.rptc/complete/`. Answer the four design questions in order — question 1
> (what the maximal client-side wipe consists of) and question 2 (whether the
> service can enumerate imports beyond this project's) gate everything, and
> question 3 (a service-side true wipe) may obsolete the rest, so ask it early.
> Then design the surface and confirm copy before writing code.
