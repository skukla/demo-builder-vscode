---
id: DI-3
kind: question
area: data-installer
parent: EDS-13
needs: []
value: low
status: spiked
---

# Spike: export a pack to the service through the item APIs, end to end

Filed 2026-09-11 by the owner, at the head of the [[EDS-13]] program: prove that a
datapack can be exported from a Commerce instance to the datapack service using only the
API calls already proven to work, without the bulk export action's store step.

## The route to prove (from the research, not from memory)

`.rptc/research/data-installer-service-docs/research.md` ("The Postman collections") and
`.rptc/research/data-installer/stage-3-export-probe-2026-08-14.md` (root cause) together:

1. `get-export-items` reads the instance's rows per data type. A pure read; "no database
   involved"; measured working.
2. `create-datapack` creates a pack the SC owns (`datapack_name`, `display_name`, `owner`,
   `version`, `shared: false`). Measured 201.
3. `add-data-item` (or its batch/upsert siblings) writes each row into that pack's working
   version. Measured working on stage.
4. `POST /datapacks/{name}/promote` makes the version the atomic commit.
5. Import the new pack into a scratch instance (the dry run first) to confirm the round
   trip.

The bulk `process-datapack` export action's store step is what fails on stage; this route
does not call it. [[DI-1]] names the same route as "Route B, works on the shared deployment
TODAY", and the service author's design conversation is the source for the pack-first
model.

## What the spike answers

- Are the rows `get-export-items` returns the complete payloads `add-data-item` accepts,
  for every data type the extension exports today, or does a shape differ per type?
- Volume: a pack of realistic size (the Bodea instance is the acceptance target) through
  per-item writes, with the async variants where they exist. Time and call counts,
  measured.
- Where the client code lives: the existing `dataInstallerWriteClient.ts` gains the
  pack-lifecycle and item calls (the reuse map, section J); `exportHandlers.ts` composes
  them behind the same `start-datapack-export` door so the dashboard and the MCP tool are
  unchanged.
- The credential path is unchanged (ADR-014 broker).

## Measured 2026-09-11 (first session; reads only)

`.rptc/research/data-installer/spike-di3-item-api-export-2026-09-11.md`. Step 1 of the route
does not hold: `get-export-items` returns an index (`{id, display_name}` and the like, `metadata`
null on every type), never the entity, so it is not a row source. Steps 2–4 stand: a pack is
written per data type, one call per type, the whole list as a JSON string in the processors'
wrapper shapes. The open question is now where the rows come from: the export action's own
response with `verbose: "full"` (one call, owner-gated), the client fetching Commerce REST per
type (a build), or the service (the Postman collections, not in this repo, are where to look).

## Measured 2026-09-11 (second pass; one owner-approved export attempt)

The export action with `verbose: "full"` returns no rows; it reaches the store step and
fails there ("MongoDB connection URI required. Provide MONGO_URI in params or environment
variable"). Nothing was created. So the service's API today has no read of an instance's
rows in pack shape: the picker index is names only, and the exporter's fetch never leaves the
action. The item APIs remain a working WRITE path (one call per data type).

Owner's call the same day: not a gate on the program. The service's own documentation
(read 2026-09-12; eight Confluence pages the owner supplied) confirms the design: export
fetches from Commerce, transforms, validates, and its last step is "Store: Save exported
data to MongoDB datapack"; no documented mode returns rows without storing. "No database
content required" in that page is about the read side. So the row source is the service's
export path working (a fix in the service's deployment or code) or a rows endpoint the
service adds; neither is built here. Until one exists, "Publish it now?" in Share warns.
Research: `.rptc/research/data-installer/spike-di3-item-api-export-2026-09-11.md`.

2026-09-12, the Postman collections: a `datapack_type` field (`accs` / `aco`) the docs never
mention and the extension never sends; the promote route is `promote-datapack-version`; the
item write's `data` is the list of wrapped rows; an async export exists. Tested the one
hypothesis the field raised (store step keyed by type): falsified, same store error, nothing
created. The async export was then tested too (2026-09-12): 202, polled to terminal, `status: "fail"`,
same all-zero counts, nothing created. DI-3 is closed on three measurements: no export path
on this deployment stores what it fetches; the fix is in the service and belongs to its
owner; the program does not wait on it.

## Done when

A pack exported from a real instance through this route imports cleanly into another
instance, with the measurements recorded in `.rptc/research/data-installer/` (redacted:
no instance ids, no names of people). Then [[DI-1]]'s Route A/Route B split collapses to
one route, and [[EDS-13b]]'s "Publish it now?" has its implementation.

## Shipped so far

- 2026-09-11  Filed at the head of EDS-13 (1d0248ac1)
- 2026-09-11  Spiked: service cannot export rows today (17b0509ee)
- 2026-09-12  Closed on three measurements (aafc547d9)
- 2026-09-12  docs(research): cross-reference the data installer docs and collections against the spike (`39b9e8dc3`)
