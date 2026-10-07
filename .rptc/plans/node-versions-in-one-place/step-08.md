# Step 8: Clean up the shared fnm once; remove the own store on uninstall

**When.** After step 2's store has the Node the register needs and a command has run on it
successfully. Once per machine, recorded in `~/.demo-builder/` so it is never offered again.

**What is offered** (decided by the owner, 2026-10-07):

- every version in the user's shared fnm (`fnm list` with the default `FNM_DIR`) whose major is
  one Demo Builder has ever required: **18, 20, 22, 24**, a constant read from the catalogs' git
  history on 2026-10-07 and kept beside the cleanup code with that provenance;
- **ticked by default**, except the user's fnm default (`fnm default`, 20.19.6 on the owner's
  machine), which is listed but **not ticked**;
- nothing outside those majors, ever.

**One confirmation**, a modal naming each version and what goes with it: "Demo Builder now keeps
its own Node. Remove these versions it installed for itself before? You can untick any.
`fnm install <version>` brings one back." Cancel removes nothing.

**What runs:** `fnm uninstall <version>` on the shared fnm, per ticked version. A version's
global packages (the old Adobe CLI) live inside its folder (verified 2026-10-07: v18.20.8's
`installation/lib/node_modules/@adobe`), so they go with it. The result lists what was removed
and anything that failed, with the reason.

**Agent surface:** a read tool that lists what would be offered, and a confirm-gated tool that
runs it (the `mcp-tool-authoring` skill), so an agent can do it with the user's yes.

**Uninstall.** VS Code runs a package's `vscode:uninstall` script after an uninstall (not
present in `package.json` today). Add one that deletes `~/.demo-builder/node/`. When and whether
VS Code runs it is to be confirmed against VS Code's documentation before relying on it; if it
cannot be relied on, the cleanup is offered from the command palette instead.

**Tests:** the offer for the owner's machine shape (seven versions, default unticked, a `system`
entry and an unrelated major like 16 never offered); cancel removes nothing; a failed uninstall
is reported and the rest proceed; the once-only record.
