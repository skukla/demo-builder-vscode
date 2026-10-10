# Step 11: Cleanup

**First, before any cleanup:** move the Demo Builder connection and the git-sync hook off the
SC's PATH Node onto Demo Builder's Node folder (see step 10's note): every `resolveNodePath`
caller, including the `~/.claude.json` entry and its activation repair (`refreshGlobalMcpEntry`).
Otherwise the one-time cleanup can delete the Node the connection launches with.

**Unused Nodes in the folder, automatically.** After an extension update, a project delete, or
an integration removal: keep the register's Node, every installed component's recorded Node,
and every outside integration's recorded Node, across EVERY project Demo Builder knows about;
`fnm uninstall` the rest from the folder (the Adobe CLI inside goes with it). No prompt:
everything there is Demo Builder's and comes back when needed. Shown as a status-bar line and a
User Logs line, and listed in Diagnostics (step 12).

Three rules (owner walk-through, 2026-10-07: an outside repo needs Node 26, the project is
deleted):

- **After the teardown, never before.** Deleting a project or removing an integration tears its
  cloud resources down first, and that teardown runs on the integration's own Node. Cleanup runs
  only once the teardown has finished, or the teardown has no Node to run on.
- **Every known project, not one folder.** "Projects on disk" means `~/.demo-builder/projects`
  AND every project in Demo Builder's known-projects list (an imported project can live
  elsewhere: verify where, while building). A project cleanup cannot see must never lose its Node.
- **Shared use keeps it.** A Node another project still records is kept; it goes when the last
  one does. Adding the integration again later reinstalls it.

**The SC's own fnm, once** (owner, 2026-10-07): one confirmation listing every version there of
majors 18, 20, 22, 24 (the majors Demo Builder ever required, from the catalogs' git history),
ticked, with the SC's fnm default listed but not ticked. `fnm uninstall` per ticked version with
the default `FNM_DIR`. Cancel removes nothing; recorded in `~/.demo-builder/` so it is offered
once. A read tool lists the offer; a confirm-gated tool runs it (`mcp-tool-authoring`).

**Uninstall.** A `vscode:uninstall` script deletes `~/.demo-builder/node/`, after confirming
against VS Code's documentation that it runs; otherwise a palette command does it.

**Tests:** the keep set across several projects, including one outside `~/.demo-builder/projects`;
an outside integration's Node kept until its last project goes, and removed only after the
teardown completes; the shared-fnm offer for the owner's machine (default unticked, `system` and other
majors never offered); cancel removes nothing; a failed uninstall is reported and the rest go on.
