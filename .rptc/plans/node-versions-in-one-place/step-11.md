# Step 11: Cleanup

**Unused Nodes in the folder, automatically.** After an extension update, a project delete, or
an integration removal: keep the register's Node, every installed component's recorded Node,
and every outside integration's recorded Node, across all projects on disk; `fnm uninstall` the
rest from the folder (the Adobe CLI inside goes with it). No prompt: everything there is
Demo Builder's and comes back when needed. Logged.

**The SC's own fnm, once** (owner, 2026-10-07): one confirmation listing every version there of
majors 18, 20, 22, 24 (the majors Demo Builder ever required, from the catalogs' git history),
ticked, with the SC's fnm default listed but not ticked. `fnm uninstall` per ticked version with
the default `FNM_DIR`. Cancel removes nothing; recorded in `~/.demo-builder/` so it is offered
once. A read tool lists the offer; a confirm-gated tool runs it (`mcp-tool-authoring`).

**Uninstall.** A `vscode:uninstall` script deletes `~/.demo-builder/node/`, after confirming
against VS Code's documentation that it runs; otherwise a palette command does it.

**Tests:** the keep set across several projects; an outside integration's Node kept until it is
removed; the shared-fnm offer for the owner's machine (default unticked, `system` and other
majors never offered); cancel removes nothing; a failed uninstall is reported and the rest go on.
