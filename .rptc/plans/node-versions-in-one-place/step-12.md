# Step 12: What the SC sees

Every Node and Adobe CLI install is said on screen at the moment it happens, in the surface the
SC is already using. No new screen.

**The wizard's prerequisites step stays** (PR-1 D4: it always renders). It shows ONE Node line,
"Node 24, in Demo Builder's own folder", and the Adobe CLI with its mesh plugin under it. Because
everything Demo Builder ships shares that Node, this step prepares everything a project can ever
need from the catalog, integrations added later included. A catalog integration added later
needs no prerequisite work.

**Adding an integration** (wizard, dashboard and agent share the add door). Only an SC's own repo
can need another Node.

- Before anything runs, the add says so: "This integration needs Node 26. Demo Builder will
  install it, and the Adobe CLI, in its own folder (a few minutes, the first time only)."
- The add's progress window has that stage. Today's "Preparing Node: up to 30 seconds, the first
  time only" understates it: installing the Adobe CLI under a new Node takes minutes (measured
  2026-10-07). Two expectations: the Node alone, and the Node with the CLI.
- An agent gets the same fact in the add tool's result: which Node was installed.

**When a release moves the shared Node** (24 to 26), the first thing that needs it would wait
minutes, possibly mid-demo. After an extension update that changes it, Demo Builder prepares the
new Node in the background with a progress notification ("Updating Demo Builder's Node to 26: a
few minutes, one time"). Owner to confirm against PR-1 D14 (no activation-time checks): this is
not a check on every start, only after an update that changed the Node.

**Start** shows the reinstall notice from step 9.

**Cleanup** has no pop-up (step 11). Diagnostics lists Demo Builder's Nodes, what uses each, and
what was removed last. It lists the SC's own fnm today, which says nothing about what Demo Builder
runs on; fixed here.

**PR-1 consequence.** With one shared Node, Node and the Adobe CLI become extension-wide tools in
PR-1's terms (Tier 1), not project-specific ones. PR-1's project tier shrinks to the Nodes outside
repos need, which the add door already handles. Note this on PR-1.

**Tests:** the prerequisites step lists one Node line and the CLI under it; the add confirmation
names the Node only when a new one is needed; the progress stage text for each case; the
post-update preparation runs only when the Node changed; Diagnostics lists the folder.
