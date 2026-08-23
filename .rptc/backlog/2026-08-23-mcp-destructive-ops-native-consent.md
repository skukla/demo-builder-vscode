# Native consent for destructive MCP operations

**Filed:** 2026-08-23
**Origin:** Live warm-path test on the bodea demo — the user watched the agent
publish path and said "This is concerning for an AI-only publish path."

## The gap

Once a DA.live session is live, the extension-side gate on destructive MCP
tools (`publish_page`, `delete_page`, `sync_storefront`, `republish`,
`reset_eds_project`, …) is the `confirm: true` parameter — which is supplied
**by the agent**. The convention (AGENTS.md, tool descriptions) says "ask the
user, then pass confirm", but nothing verifies the asking happened.

The consent model today is two layers:

1. **Sign-in needs a human** — the agent cannot mint a DA.live token; the IMS
   flow completes in the user's browser. Real, but it gates only the FIRST
   operation. The token then lives in the extension for its lifetime.
2. **The harness permission prompt** — Claude Code prompts before an MCP tool
   call in default mode. Real, but user-configurable away: a user who
   allowlists the demo-builder MCP tools to reduce friction is left with only
   the honor-system `confirm` parameter between an agent and their live CDN.

## Proposed hardening

Extension-side native consent for live-CDN writes invoked via MCP: the handler
raises a VS Code confirm dialog ("Agent requests publish of /products/x —
Allow?") before executing, in the window that owns the socket. This converts
the honor system into consent that survives allowlisting.

Trade-offs to decide at pickup:

- **Breaks fully headless use** — a cron/CI agent can never complete the
  dialog. Options: a per-project setting (`demoBuilder.ai.requireNativeConsent`,
  default on), or scope the dialog to only the truly destructive subset
  (delete/reset) while publish/sync stay confirm-gated.
- **Which tools?** Derive the list from the same read-only allowlist logic
  `mcp-live-probe` uses (names not matching `list_*`/`get_*`/`read_*`/… are
  gated) rather than hand-enumerating — the probe's denylist→allowlist history
  (its SKILL.md) is the argument.
- **Dialog fatigue** — batch operations (bulk publish during reset) must not
  raise N dialogs; the pipeline-level confirm covers its steps.

## Not in scope

- Changing the sign-in flow (the human-completes-IMS checkpoint is correct).
- The Claude Code permission classifier (harness-owned, not ours).

## The other half (added same day): the route must be agent-traversable

Walking the publish path live surfaced the counterweight (user: "we need to
make sure an LLM can travel this route without user interaction (or
minimal)"). The design target is BOTH at once: **one auth touch, then
agent-traversable end-to-end — consent is a policy the user sets, not friction
the plumbing accretes.** Concrete gaps found on the walk:

1. **`sign_in(provider:"dalive")` hangs silently.** It opens a QuickPick in
   the VS Code window and blocks; a probe/agent sees only a 60s timeout, and a
   user watching the terminal sees "nothing happens" (the QuickPick can also
   dismiss on focus loss). Fix: return immediately with instructions ("sign-in
   prompt opened in the VS Code window — complete it there"), raise attention
   on the window (status bar / notification), and let the agent poll
   `get_auth_status` for completion.
2. **Auth checks belong BEFORE multi-step flows.** The `needsAuth:"dalive"`
   refusal mid-flow was correct and well-shaped; skills/AGENTS.md should tell
   agents to run `get_auth_status` up front so the one human touch happens at
   the start, not as a mid-pipeline stall.
3. **The IMS browser sign-in is the only irreducible interaction** — DA.live
   has no headless grant. Everything downstream of a live token should need
   zero interaction beyond the consent policy above.

When picked up, design the native-consent dialog and the traversability fixes
together — a dialog that fires per-operation on an agent loop recreates
exactly the friction this half exists to remove (the batch/pipeline-scope
consent in the trade-offs section is the reconciliation).

## The third leg (added same day): long agent-triggered operations must be VISIBLE

Found during the pipeline rewrite's live validation: `refresh_block_library`
invoked via MCP ran for ~2 minutes against the live site — DA.live copies,
CDN publish — with **zero VS Code surface**. The user watched the extension
and saw nothing; the probe client had timed out; the only evidence the
operation ran (and succeeded) was the CDN's `last-modified` header.

The dashboard button for the SAME operation shows a `withProgress`
notification. The MCP path runs fully headless — and this repo has already
recorded why that is wrong: `deployAppHeadless` was retired with the note
that being UI-free "turned out to be the wrong goal for an agent-triggered
deploy, which is precisely when the user needs telling"
(`src/features/CLAUDE.md`, app-builder section).

Fix shape: the MCP handlers for long-running mutating tools
(`refresh_block_library`, `sync_storefront`, `republish`, `sync_content`,
`reset_eds_project`, datapack import/export) raise the same
`vscode.window.withProgress` notification their button counterparts show, in
the window that owns the socket. Derive the list the same way as the consent
gate above (non-read-only names); a completed operation's outcome belongs in
the notification too, since the agent's own report may never reach the user
(disconnected client, long-gone chat).

Together the three legs are one design: **sign-in needs a human, destructive
ops need consent, long operations need to be seen.** Design them as one
surface when this item is picked up.
