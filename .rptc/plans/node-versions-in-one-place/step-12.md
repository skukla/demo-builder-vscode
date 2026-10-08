# Step 12: What the SC sees

**Owner rule (2026-10-07): every Node install, update and cleanup is shown to the SC, through a
surface Demo Builder already uses, so they can see what is happening and when.** No new screen,
no new kind of notice.

## The surfaces (all exist today)

| Surface | Where it lives |
|---|---|
| Wizard prerequisites step | `features/prerequisites/ui/steps` |
| Operation progress window, with "Run in background" to a progress notification | PL-59; `operationBackgroundNotice.ts`, `OPERATION_STAGES` |
| Progress notification for a long operation started outside a window | `core/vscode/progressRegister.ts` |
| Dashboard notice (inline, one sentence, one action) | `OrgContextNotice.tsx` pattern (`spectrum-webview-ui`) |
| Status-bar line on success | the same close path as `operationBackgroundNotice` |
| "Demo Builder: User Logs" (timestamped, the SC-facing log, NOT Debug Logs) | `debugLogger.ts` |
| Diagnostics | the Diagnostics command |

## Every Node event, and where it is shown

| Event | Shown in | What it says |
|---|---|---|
| First Node and Adobe CLI install (wizard) | Prerequisites step rows + their install progress | "Node 24, in Demo Builder's own folder"; "Adobe I/O CLI for Node 24" |
| First Node install outside the wizard (an agent or a dashboard action got there first) | That operation's progress window stage, else the progress notification | "Installing Node 24 and the Adobe CLI: a few minutes, the first time only" |
| An integration from the SC's own repo needs another Node | The add confirmation BEFORE it runs, then the add's progress window stage | "This integration needs Node 26. Demo Builder will install it, and the Adobe CLI, in its own folder" |
| A release moves the shared Node (24 to 26) | Progress notification right after the update, then a status-bar line | "Updating Demo Builder's Node to 26: a few minutes, one time" / "Demo Builder now runs on Node 26" |
| A component the post-update move could not reinstall (step 9) | Dashboard notice with a Retry action | "Could not move the storefront to Node 26; it still runs on 24. Retry?" |
| The post-update move itself | The same progress notification as the Node preparation, one line per project; a status-bar line when done | "Moving installed components to Node 26: citisignal (2 of 3)" |
| Reinstall or update moves a component | That operation's progress window stage | "Reinstalling on Node 26" |
| Cleanup removes an unused Node from the folder | Status-bar line + User Logs | "Removed Node 26 from Demo Builder's folder: no project uses it" |
| The one-time cleanup of the SC's own fnm | A confirmation listing each version, then a progress notification, then a result listing what was removed and anything that failed | as step 11 |
| Any install or removal fails | The surface that was narrating it turns into a warning with the reason and Debug Logs (the existing failure path) | the reason, in plain words |
| At any time | Diagnostics: Demo Builder's Nodes, what uses each, the last install and the last removal, with dates | |

Every row also writes one line to **User Logs**, so the order of events can be read back later.

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
few minutes, one time"). **Owner approved 2026-10-07**, as an exception to PR-1 D14 (no
activation-time checks): it runs only after an update that changed the Node, never on an ordinary
start. Three guards: it never blocks the SC (background, they keep working); offline or failed,
it warns through the usual failure path and the first thing that needs the Node tries again; and
it goes through the one ensure call (step 2), so an operation needing the same Node at the same
time waits for it instead of installing twice (test this: today's ensure has no lock).

**Start** asks nothing: it runs each component on its recorded Node (step 9 moves them ahead of time).

**Diagnostics** lists the SC's own fnm today, which says nothing about what Demo Builder runs on;
fixed here.

**PR-1 consequence.** With one shared Node, Node and the Adobe CLI become extension-wide tools in
PR-1's terms (Tier 1), not project-specific ones. PR-1's project tier shrinks to the Nodes outside
repos need, which the add door already handles. Note this on PR-1.

**Tests:** each row of the table above has a test that the event reaches its surface (and User
Logs); the prerequisites step lists one Node line and the CLI under it; the add confirmation
names the Node only when a new one is needed; the progress stage text for each case; the
post-update preparation runs only when the Node changed; Diagnostics lists the folder.
