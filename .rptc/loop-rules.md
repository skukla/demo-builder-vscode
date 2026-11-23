# Demo Builder's rules for the unattended loop

The loop itself is the plugin's `dev-pipeline:unattended-loop` skill. It reads this file before
the first item. This file holds only what is specific to Demo Builder. It came from
Demo Builder's own loop skill (2026-08-27), which was deleted when the loop moved to the plugin on
2026-11-22.

## Off limits

The loop never writes to, or opens, any of these while the owner is away:

- **Adobe, GitHub and DA.live resources**: nothing that deploys, publishes, creates or deletes
  them. That covers App Builder deploys, API Mesh, Console projects and workspaces, storefront
  publishes and resets, and repository creation and deletion (CLAUDE.md property 5).
- **Commerce stores**: no live write to any store, including datapack installs, removals and
  Clear Demo Data. Each engine change ends with a live cycle on the test store, and that cycle
  waits for the owner (`src/features/data-installer/CLAUDE.md`).
- **Demo Builder MCP tools that ask for consent** (those in `AGENT_ALERT_COPY`), and every
  tool that writes.
- **Sign-ins**: Adobe, GitHub and DA.live. An expired session puts the work off.
- **Tools that open a window**: settings panels, browser tabs, `open_view`, `open_url`,
  `open_erp_screen`.

Allowed: pushing the loop's work branch (`loop/<date>-<slug>`) to this repo's GitHub remote
for backup (owner, 2026-11-22). Never `develop` or `master`.

## Done scans

The checks prove the code works. These look for the same job done twice.

**Every item that touched `src/`**: run all three and capture each exit code.

    bash .claude/skills/dead-code-scan/scan.sh src
    bash .claude/skills/circular-dependency-scan/scan.sh src
    bash .claude/skills/code-duplication-scan/scan.sh <the folder touched, or src>

**When the shape of the work calls for it**: these are guided reviews, so invoke the skill.

- `architecture-duplication-scan`: the item added an implementation (a service, client,
  walker or resolver). Did the job already have one?
- `call-path-audit`: the item added or changed a way a user action reaches what it does.
  Does the action still have one path?
- `component-extraction-scan`: the item added UI markup.

**Once, when the loop closes**: `rptc-hygiene-scan`.

## Live check

After a change to the extension or its MCP tools: `npm run compile`, then the `reload_window`
tool, then the `mcp-live-probe` skill to call the changed tool on the running server and read
which build answered. A read-only call only. A tool that writes is checked by the owner.

## Read-only lists

Unattended runs of the evaluation battery use only the read-only tools in
`.rptc/plans/evaluation-mode/battery/readonly-tools.txt`, which is generated from the live
server (see that folder's README). Never widen it for a run.

## Design questions in this repo

Before building a feature item, the plan's design section answers the loop skill's questions
in Demo Builder's terms:

- **What is it in the extension's model?** A catalog entry (`components.json`), a component
  instance (`componentInstances`), a dependency of another component, a demo package, a
  datapack, or a new kind? Name the one it maps to, or say why none fits.
- **What owns it and where does it live?** Which config file, which state map, which feature
  folder, and which pattern it extends.
- Example, 2026-08-27: "is the starter kit a catalog component like the blank shell, or a new
  entity?" changes what users see. Writing the catalog entry before answering it would have
  built a guess.
