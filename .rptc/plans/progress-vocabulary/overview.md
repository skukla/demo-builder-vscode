# One progress vocabulary and structure for every flow

Owner, 2026-10-16 (release walk): "Everything should be consistent. Republish and project
creation. Every flow." Approved plan and order the same day.

Evidence: the inventory of 17 progress flows (this session; summarised below). Reset is
already converted (`1a208f515`, `src/core/utils/resetStages.ts`) and is the model.

## The structure (all surfaces)

Under a title fixed for the run ("Resetting My Commerce Demo", "Creating My Demo"):

1. **Line 1, the step.** A name from the stage table (`OPERATION_STAGES`, max 25 chars),
   with "(n of N)" ONLY when it is the step's position and N is known up front. Never a
   count of items, never a raw message.
2. **Line 2, what the step is doing now.** A job name from the vocabulary, or a short
   detail; counts of items go HERE as "32 of 64 pages". Never blank: the stage's `detail`.
   When the step IS the job (Reset's "Copying the content"), line 2 is the job's count
   or detail ("40 of 103 files"), never the name a second time.
3. **Line 3, the step's expectation and the run's clock** ("Usually about a minute ·
   3 minutes, 43 seconds"; the dot is deliberate, owner 2026-10-16).

The notification surface shows line 1 only (VS Code's one line). The wizard's creation
and storefront-setup screens render the same three lines.

## The vocabulary: one name per job

Each job is a stage-table entry (label, detail, expectation). Where a flow's step IS the
job, the label is line 1; where the job is part of a bigger step (Reset's groups), the
label is line 2. Counts are appended on line 2 as ": 32 of 64 pages".

| Job | Name | Replaces (examples) |
|---|---|---|
| Create repo from template | Creating the repository | "Creating GitHub repository from template" |
| Reset repo to template | Resetting the repository | "Resetting repository to template" |
| Publish code | Publishing the code | "Publishing code to CDN", "Syncing code to CDN", "Code published" |
| Site permissions | Setting site permissions | "Configuring site permissions", "Granting DA.live access" |
| config.json | Publishing the settings | "Publishing the config", "Pushing config.json to GitHub", "Regenerating storefront configuration", "Syncing to GitHub and CDN" |
| Configuration Service | Updating the site config | "Registering site with Configuration Service" |
| Clear DA.live content | Clearing DA.live content | "Clearing existing DA.live content", "Cleared N files" |
| Copy content | Copying the content | "Populating DA.live content", "Copying content from template", "Content populated" |
| Block library setup | Building block library | "Configuring block library", "Setting up the blocks" |
| DA.live settings | Applying DA.live settings | "Applying EDS configuration", "Configuring AEM Assets and Universal Editor" |
| Cache purge | Clearing the cache | "Purging stale cache", "Clearing the old cache" |
| Publish pages | Publishing the pages | "Publishing content to CDN", "Publishing to CDN (x/y)", "Making the content live" |
| Publish sheets | Publishing the sheets | "Publishing sheets" |
| Publish block library | Publishing the block list | "Publishing block library" |
| Leftover pages | Removing old pages | (already) |
| Page check | Checking copied pages | "Checking the copied pages" |
| Pre-warm | Warming product pages | "Pre-warming PDPs: x/y", "Pre-warming Catalog", "Loading the product pages so they are quick for visitors", "Publishing product pages" |
| Catalog menu add | Adding the catalog menu | "Writing Category Pages", "Adding category pages" |
| Catalog menu swap | Updating the catalog menu | "Updating category pages" |
| Catalog menu remove | Removing the catalog menu | (Reset's take-out) |
| Remove product pages | Removing product pages | "Removing the old product pages", "Removing the old store's product pages (N)" |
| Datapack | Installing the datapack | "Installing Datapack (n/N)", "Importing the sample data" |

Mesh, App Builder, ERP and AI-files steps already come from the table and keep their names.

## Slices (each: TDD, gate, one commit)

1. **Shared emitters** — `edsPipeline.ts`, `helixSiteContent.ts`, `catalogPrewarmService.ts`,
   `daLive` copy: emit the vocabulary names; counts as ": n of N <unit>". Every flow that
   runs the pipeline inherits it.
2. **Sync Storefront, Refresh Blocks, Project delete** — real steps from the table; line 2
   carries their messages (today the first message freezes as the step, or every message
   is a step).
3. **Republish (dashboard + agent)** — steps from the vocabulary, not one catch-all stage.
4. **Project creation + storefront setup (wizard)** — steps from the table (no Title Case,
   no counts on line 1), storefront setup's raw messages to line 2, setup groups reuse
   Reset's group names where the work is the same.
5. **Counts misused as positions** — store-change product pages, datapack watcher.
6. **Edit keeps Reset's position; generic project reset steps into the table.**
7. **Check for Updates / apply** — onto the shared progress routing.
8. **Enforcer** — a `tests/sop` suite: every step reported is a table label; no step
   carries a count that is not a position. Handbook convention + count bumps.

## Watch-outs

- Agent surfaces (MCP phases, `creationProgress`) carry these strings too; tool tests pin
  them. A wording change is a contract change there: audit mocks, not only callers.
- Log lines are not progress: leave `logger.*` text alone unless a test pins it for the UI.
- Labels max 25 chars; a duplicate label across the table is a test failure (BY_LABEL map).
