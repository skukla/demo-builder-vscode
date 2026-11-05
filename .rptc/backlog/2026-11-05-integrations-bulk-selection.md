---
id: AB-86
kind: feature
area: app-builder
needs: []
value: med
status: backlog
---

# Bulk selection on the Integrations screen

Filed 2026-11-05 by the owner, during the beta.153 release walk, right after the projects
list gained Select Projects with Reset Selected and Delete Selected (`ca438f964`, and the
commit before it). The Integrations screen should get the same: pick several integrations
and act on them in one window.

**Reuse first, as the owner asked twice.** The projects list already has every piece; this
item is mostly pointing them at a second kind of row:

| Piece on the projects list | Where | What it would do here |
|---|---|---|
| Selection mode, Select All, the count | `useProjectSelection`, `SelectionActions` | the same, over the integration cards |
| One window that asks once, then runs a row each | `useProjectsBatch`, `ProjectsBatchModal`, `ProjectsBatchRunView` | the same window shape and run rows (`WorkRow`) |
| The confirm table: a row per item, a column per thing that can go, each column's header its Select All, each box naming what it deletes | `BatchDeleteQuestions`, `batchChoices.ts`, `projects-batch.css` | the same table |
| A long list scrolling under a fixed header, with the fade | `projects-dashboard/ui/styles/scroll-fade.css` | the same; a second feature using it moves it to `core/ui/styles` |
| A question paused mid-run (a sign-in) taking the window, one at a time | `OperationQuestion`, the per-operation question queue in `operationPrompt.ts` | unchanged |
| Work side by side, with a limit | `inParallel` in `projectsBatch.ts` | the same, if the per-integration runs can overlap |

Whatever is generic in the projects-dashboard pieces moves to a shared place rather than
being copied. Judge each piece by reading it, not by its name: the projects window carries
project-only things (IMS org grouping, the reset's datapack step) that may not belong in a
shared version.

## What is different about integrations

- **An ERP system and the integration bound to it go as one unit** (owner). A bound pair
  shares one App Builder workspace, and removing a pair already goes through the
  integration and takes its systems with it, so the shared workspace is released once
  (`appBuilderRemoveRun.ts`, `workspacesToRelease` in `core/state/appBuilderComponentState.ts`).
  Selection has to respect that: ticking either half ticks both, or the pair is one row.
  Never a state where one half is selected for removal and the other is not.
- **Which batch actions.** The projects list has Reset and Delete. Here the candidates are
  Remove and Redeploy. Not decided yet: the owner named the selection feature, and the set
  of actions is a design call to make with a mockup first.
- **Each removal is a cloud operation** (undeploy, workspace release), so the window asks
  before anything runs, as the projects window does, and nothing runs speculatively.

## Both surfaces

The batch is a new human action. Say in the plan whether an agent gets it too; the
per-integration remove already has its MCP tool, so an agent may only need the single one
called several times.

## Before building

Mockups of the selection mode on the cards, the confirm and the run, in the house style,
before any code (the owner's standing rule for design changes).
