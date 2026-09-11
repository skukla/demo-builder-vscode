---
id: DI-3
kind: question
area: data-installer
parent: EDS-13
needs: []
value: high
status: open
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

## Done when

A pack exported from a real instance through this route imports cleanly into another
instance, with the measurements recorded in `.rptc/research/data-installer/` (redacted:
no instance ids, no names of people). Then [[DI-1]]'s Route A/Route B split collapses to
one route, and [[EDS-13b]]'s "Publish it now?" has its implementation.

## Shipped so far

- 2026-09-11  Filed at the head of EDS-13 (1d0248ac1)
