# PL-59, phase 2 — one progress model for the whole extension

Phase 1 (`overview.md`) gave the integrations screen a progress modal that hands over
to a VS Code notification on "Run in background". The owner reviewed it live on
2026-09-19 and asked for the same approach everywhere. This plan says which surface
every long operation reports to, **and why**, so each row can be checked against the
code rather than believed.

Source: a read-only inventory of the extension on 2026-09-19 (about 40 long operations,
16 different progress patterns). Four of its claims were spot-checked the same day and
held; every other `file:line` below is **the inventory's**, and each slice re-reads its
own rows before changing anything.

## The rules

Each row in the routing table cites one of these. A row that cannot cite one is a
finding.

| Rule | When | Surface | Why |
|---|---|---|---|
| **R1** | The SC starts it with a button on a webview, and it usually takes more than 10 seconds | **The progress modal.** "Run in background" hands it to a notification with the same title | The SC is looking at that screen; the modal is the extension's accepted way to show detail (owner, 2026-09-18). The handover keeps the operation visible once they look away (owner, 2026-09-19: "the end user loses context") |
| **R2** | Started from the command palette | **A notification**, same title and stage names as the modal would show | There is no screen to host a modal |
| **R3** | Started by an agent (MCP tool) | **The agent notification only**, with the operation's stages as its steps | Nothing should pop up that the SC did not click. One notification: the operation must not open a second one of its own |
| **R4** | Runs inside the wizard's own progress screen (project creation, storefront setup) | **That full-page display**, fed from the same stage list | The wizard step already is a dedicated progress screen; a modal on top of it would be a second one |
| **R5** | A button whose operation is short (usually under 10 seconds) | **The button's own busy state** | A modal that opens and closes in a few seconds is noise |
| **R6** | Any operation, when it ends | Success: the modal closes itself / the notification closes with a status-bar "— done". Failure: the modal stays, or a warning with the reason and "Open Debug Logs" | The end must be as visible as the start. `withProgress` is never used as a success message on a timer |

### Wording (applies to every surface)

- **Title:** "-ing verb + object", fixed for the whole run: "Resetting Bodea",
  "Deploying API Mesh". The notification and the modal carry the same title.
- **Message:** the stage name only, at most 25 characters, no trailing "…" (the spinner
  already says it is working). The longer detail belongs in the modal's second row.
- **Counts:** "(1 of 2)" after the stage, and only when the total is known before the
  operation starts. Never "Step n/N:", never a count that can jump.
- **Failure title:** "Couldn't reset Bodea". The reason follows in plain words.
- One stage list for everything (`operationStages.ts` today), with the 25-character cap
  and a detail line on every stage enforced by tests.

## The routing table

"Today" is what the inventory found. "Planned" is what this plan changes it to.

| # | Operation | Started from | Today | Planned | Rule |
|---|---|---|---|---|---|
| 1 | Integration add / deploy / redeploy / update / install / remove | Integrations screen button | Modal + handover (phase 1) | unchanged | R1 |
| 1a | same | Agent | Agent notification | unchanged | R3 |
| 2 | Deploy API Mesh | Integrations screen mesh card; dashboard button | Notification "Deploying API Mesh" + card line | **Modal + handover** | R1 |
| 2a | same | Palette; Configure "Redeploy Mesh" prompt | Notification | Notification, new wording | R2 |
| 2b | same | Agent `deploy_mesh` | Agent notification | unchanged | R3 |
| 3 | Reset EDS project (~3 min) | Dashboard kebab; projects-list kebab | Notification "Resetting EDS Project", `Step n/N:` + a success notification on a timer | **Modal + handover**; counts only where the total is fixed; no timed success notification | R1, R6 |
| 3a | same | Agent `reset_eds_project` | reportPhase `(n/N)`; skips the UI's pre-checks | Agent notification with the same stages | R3 |
| 4 | Reset headless project | Dashboard kebab; projects-list kebab | Notification "Resetting Project" + timed success | **Modal + handover** | R1, R6 |
| 5 | Delete project (with cloud cleanup) | Dashboard kebab; projects-list kebab | Notification titled "Demo Builder" | **Modal + handover**, titled "Deleting {project}" | R1 |
| 5a | same | Palette | Notification "Deleting project", no steps; separate implementation | Notification, same stages as 5 | R2 |
| 5b | same | Agent `delete_project` | Agent notification, no steps. **Local only by design**: `deleteProjectFiles` stops the demo and deletes the folder; the tool's description says it does not touch cloud resources, which the agent removes with `delete_github_repo` / `cleanup_dalive_site` (read 2026-09-19) | The steps it does run, with the button's stage names | R3 |
| 6 | Republish content | Dashboard "Republish" | Notification `Republishing {name}` | **Modal + handover** | R1 |
| 6a | same | Agent `sync_content` | Agent notification with phases | unchanged | R3 |
| 7 | Sync storefront (commit + push) | Dashboard tile | Notification with steps + input box | **Modal + handover** (the commit-message input stays a VS Code prompt, before the modal opens) | R1 |
| 7a | same | Palette | Notification | Notification, new wording | R2 |
| 7b | same | Agent `sync_storefront` | Agent notification, no steps | Agent notification with steps | R3 |
| 8 | Refresh block library (~2 min) | Dashboard kebab | Notification with steps | **Modal + handover** | R1 |
| 8a | same | Palette | Notification | Notification, new wording | R2 |
| 8b | same | Agent | Agent notification, no steps | With steps | R3 |
| 9 | Change deploy destination (moves integrations; minutes) | Integrations screen | Notification `Changing destination to …` | **Modal + handover**, with "(n of N)" per integration moved | R1 |
| 10 | Apply Console APIs | Manage APIs modal | Button reads "Applying…" | **The Manage APIs modal shows the progress rows itself** (it is already a modal; no second one) | R1 |
| 11 | Datapack import / remove (minutes) | Data Installer modal | Its own progress modal; nothing once closed | Same modal, **plus the handover** when closed | R1 |
| 12 | Datapack export | Export modal | Button reads "Exporting…" | Measure first: R5 if short, else the export modal shows progress rows | R1/R5 |
| 13 | Regenerate AI files | AI Capabilities modal | Its own progress rows | Same, **plus the handover** when closed | R1 |
| 13a | same | Agent `regenerate_ai_files` | Agent notification, no steps | With steps | R3 |
| 14 | Project creation / edit | Wizard | Full-page progress screen | Same screen, shared stage list and wording | R4 |
| 14a | same | Agent `create_project` | Agent notification, no live steps | With live steps | R3 |
| 15 | Storefront setup | Wizard | Full-page progress screen with per-phase durations | Same, shared stage list | R4 |
| 16 | Start / stop / restart demo | Dashboard, projects-list | Notification "Starting demo" etc. | **The button's busy state**; the tile already shows starting/stopping. Short (owner, 2026-09-19) | R5 |
| 16b | same | Palette | Notification | Notification, new wording | R2 |
| 16a | same | Agent | Agent notification **plus** the command's own notification | One notification: `BaseCommand.withProgress` learns to stand down under an agent, as `withProgressRegister` already does | R3 |
| 17 | Create Adobe project / workspace | Wizard destination stage | In-stage progress rows | unchanged (already R4-shaped) | R4 |
| 18 | Delete Adobe project | Project picker | Notification with `Step n/N:` | Notification, new count wording (the picker is inside a larger flow; a modal on top would stack) | R2 wording |
| 19 | Install prerequisite | Wizard prerequisites step | Per-row progress bar | unchanged; agent path gains steps | R4, R3 |
| 20 | Check for updates; update extension; apply project updates | Palette / update prompt | Notifications; fork-sync and add-on updates show **nothing** | Notifications with the wording rules; the silent two get one | R2 |
| 21 | Sign in (Adobe, DA.live); switch org; site access; repair site config; migrate names; clean up sites/repos; diagnostics | Palette / guards | Notifications of varying style | Notifications with the wording rules; no change of surface | R2 |
| 22 | Open live site in a private browser; detect store structure; check GitHub App | Buttons / wizard | Short notification or inline spinner | unchanged | R5 / R4 |

## Order of work

Each slice is its own commit series on `feature/operation-progress`, tested, and shown
to the owner before the next.

0. **Foundation.** Lift the phase-1 modal and its handover out of the integrations
   feature into a shared component any screen can host, keyed by an operation id rather
   than an integration id. One extension-side helper (`withOperationProgress`) that
   routes to modal / notification / agent by R1–R3, so a handler cannot pick the wrong
   surface. `BaseCommand.withProgress` stands down under an agent (row 16a). A wording
   test over every progress title and message in the source.
1. **API Mesh deploy** (row 2) — finishes the integrations screen.
2. **Resets** (rows 3, 4).
3. **Delete project** (row 5), after the owner answers 5b.
4. **Dashboard storefront buttons** (rows 6–8).
5. **Destination move** (row 9).
6. **Modals that already exist** gain the handover (rows 10, 11, 13); export measured (12).
7. **Agent paths without steps** (rows 3a, 5b, 7b, 8b, 13a, 14a, 19).
8. **Wizard screens** share the stage list and wording (rows 14, 15).
9. **Palette notifications** follow the wording rules; the silent updates get one (rows 20, 21).
10. Start/stop/restart (row 16): the busy state on the button, and the palette wording.

## How this is validated

- **A routing test, table-driven from this file's rows 1–13**: for each operation's
  handler, a webview request with `progress: 'modal'` pushes to the modal and opens no
  notification; the same handler without it opens exactly one notification; under an
  agent's phase sinks it opens none of its own.
- **The wording test** (slice 0) fails on a title without an "-ing" verb, a message over
  25 characters, a trailing "…", or a `Step n/N` count.
- **Live, per slice:** the owner runs the operation from each place in its rows and
  checks the surface against the "Planned" column.
- This table is updated in the same commit as any change to a row, so it stays the
  thing to check against.

## Outside this plan, raised with the owner

- **An agent's delete leaves the cloud side to the agent** (row 5b). A person's delete is
  one action that also unpublishes the CDN content and removes the DA.live site and the
  GitHub repo; an agent needs three tool calls and must remember two of them. No agent
  tool for the CDN unpublish was found in a quick look (not a thorough search). Whether
  an agent should get the one-call full delete is a reversibility question, not a
  progress one.

## Decided

- **Start, stop and restart demo are short** (row 16): no modal, the button's busy state
  (owner, 2026-09-19).
- **The line between R1 and R5 is 10 seconds** (owner, 2026-09-19).
