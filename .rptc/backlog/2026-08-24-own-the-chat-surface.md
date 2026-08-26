---
id: AI-2b
kind: epic
area: ai
parent: AI-2
needs: []
value: low
status: spiked
layer: E
---
# Own the chat surface — render Claude Code's stream in our own UI

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**ACTIVE 2026-08-25 — a spike is planned at [`.rptc/plans/own-the-chat-surface/overview.md`](../plans/own-the-chat-surface/overview.md).** Read the plan first; this entry is kept for the correction it records and the prior art it names. The prerequisite it called for ("emit MCP progress from `withToolLogging`") SHIPPED with Evaluation Mode.

**Filed to record a correction, not to argue for the work.** A producer could not tell what was running mid-task — which MCP server, which tool, which phase. Research (`.rptc/research/agent-activity-visibility/`) measured the terminal's ceiling: MCP progress notifications carry a `message` string, Claude Code supplies a progress token, and **the interactive terminal DOES render those messages live** (confirmed by running `probe-server.mjs`). So a tool can narrate itself; what it cannot control is attribution, ordering, styling, or how any other server's lines look. The correction: an earlier read said owning the chat meant abandoning Claude Code, citing ADR-004 and a billing risk, and **both were wrong** — "own the chat" was conflated with "use the Agent SDK directly", when `claude --input-format stream-json --output-format stream-json` runs a real bidirectional session against the local binary. Render the stream and Claude Code is still the engine: skills load, hooks fire (including the `aio` guard), `.mcp.json` connects, `AGENTS.md` is read so `AI_CONTEXT_VERSION` keeps working. ADR-004 chose the ENGINE, not the pixels — it rejected VS Code Chat's separate skill model and MCP transport, none of which applies here. Billing was moot twice: Adobe provides the subscriptions and the CLI path never touches an API key. Prior art is `app-builder/tech-case-studio`, whose Phase 0 spike de-risked this exact seam (streaming + permission prompts + tree-kill) and whose `ClaudeCliProvider` is the subscription-riding path; its `src/tool-call.ts` tool→view mapping is directly reusable, though it does not yet handle MCP tools (filed in that repo's backlog). Real cost is a UI, not the harness: permission cards are the hard part, and Anthropic's stream format is the standing maintenance. **Do first either way:** emit MCP progress from `withToolLogging` — small, lands now, and a prerequisite rather than a detour, since a custom UI still needs the server to send what it renders. Filed 2026-08-24.

> **ACTIVE 2026-08-25.** A spike plan now exists:
> [`.rptc/plans/own-the-chat-surface/overview.md`](../plans/own-the-chat-surface/overview.md),
> built on the research pass in `.rptc/research/own-the-chat-surface/`. Read those
> first — this file is kept for the correction it records and the prior art it
> names, and the "do this first either way" prerequisite below has SHIPPED
> (MCP progress notifications, Evaluation Mode step 01b).
## Shipped so far

- 2026-08-25  Prerequisite shipped either way — MCP progress notifications + Evaluation Mode step 01b (authored tool phrases)
- 2026-08-26  Spike RUN — all four unknowns answered; see `.rptc/research/own-the-chat-surface/spike.md`

Feasible, and more so than assumed. NOT decided: the cost is the terminal's own affordances, and the surface would sit on an undocumented API.

## Provenance

Surfaced 2026-08-24, chasing a producer complaint: while an agent works you cannot
tell what is running. Not which MCP server, not which tool, not which phase of a
long operation. "Demo Builder is creating the project, now App Builder is adding a
runtime" is invisible.

Research: [`.rptc/research/agent-activity-visibility/research.md`](../research/agent-activity-visibility/research.md).
That work established what IS possible on the terminal — and by doing so, mapped
the ceiling.

**Measured, not assumed:**

- MCP progress notifications carry an optional `message` string, Claude Code
  supplies a progress token, and **the interactive terminal renders those messages
  live** (confirmed by the producer running `probe-server.mjs`).
- So a tool CAN narrate itself. What it cannot do is control attribution, ordering,
  styling, or how any OTHER server's lines look.

## The correction this item exists to record

An earlier read of this said owning the chat would mean abandoning Claude Code,
citing [ADR-004](../../docs/architecture/adr/004-claude-code-harness.md) and a
billing risk. **Both were wrong**, and the error is worth naming so it is not
repeated:

1. **"Own the chat" was conflated with "use the Agent SDK directly."** They are
   separable. `claude --input-format stream-json --output-format stream-json
   --include-partial-messages` runs a real bidirectional session against the local
   binary. You render the event stream; Claude Code is still the engine.
2. **Therefore nothing in the harness is lost.** Skills load. Hooks fire —
   including the `aio` guard shipped the same day. `.mcp.json` connects.
   `AGENTS.md` is read, so `AI_CONTEXT_VERSION` and the whole generated-bundle
   machinery keep working unchanged.
3. **ADR-004 chose the ENGINE, not the pixels.** It rejected VS Code Chat (a
   different skill model, a different MCP transport, a second adapter layer) and
   the Anthropic extension wrapper. Rendering Claude Code's own stream contradicts
   none of its reasoning.
4. **Billing was a non-issue twice over.** Adobe provides the subscriptions, and
   the CLI path never touches an API key.

## Prior art — this seam is already de-risked

`app-builder/tech-case-studio` does exactly this: Claude drives through a sidecar,
NDJSON to a React transcript, its own permission cards. Its Phase 0 spike existed
to de-risk this specific seam (streaming + permission prompts + process tree-kill)
and it passed. Its `ClaudeCliProvider` is the subscription-riding path; the Agent
SDK with a key is only its fallback.

Also directly reusable: `src/tool-call.ts::describeToolCall` maps a raw `tool_use`
to `{icon, label, target, body}` — Bash to "Ran command", Edit to a diff. Note it
does NOT yet handle MCP tools (they hit a JSON-dump default); that gap is filed
separately in the studio's own backlog as
`2026-08-24-mcp-tool-labels-in-chat.md`, and whoever picks this up should read
both.

## The strongest argument for it, added 2026-08-25

**Owning the stream is what makes Claude Code's OWN permission system available
to us**, and that covers every tool — not just ours.

Demo Builder shipped consent via MCP elicitation on 2026-08-25 (`consentViaChat.ts`).
It works, and it protects **our** tools only. Anything the agent does with Bash,
Write or Edit passes without Demo Builder knowing, and no amount of elicitation
closes that: elicitation is a mechanism our SERVER has, and it fires inside our
own tool calls.

The studio gets `control_request` / `can_use_tool` instead — the same message the
Agent SDK answers through `canUseTool` — because it drives the process with
`--permission-prompt-tool stdio` and `--input-format stream-json`
(`sidecar/src/claude-cli-provider.ts:243-252`). That message arrives for EVERY
tool, before it runs.

So the choice is not only about rendering. It is: does a producer's agent get to
run a shell command this extension never sees? Today, yes.

Comparison with what to borrow either way:
`.rptc/research/consent-in-the-chat/compared-with-tech-case-studio.md`.

## Research pass, 2026-08-25 — `.rptc/research/own-the-chat-surface/research.md`

Measured rather than argued. Headline: **less work than it looks, and the cost is
Claude Code's terminal UI rather than the rendering.**

- **~1,000–1,500 new lines**, against ~1,900 lines of EXISTING surfaces that fold
  in rather than being rebuilt: the Prompt Library becomes the composer's saved
  prompts (closing the "cannot load a prompt back" hole for free), the evaluation
  workbench is already a transcript view, and `toolNarration` / `agentAlertCopy` /
  `consentText` are a permission card's content already written.
- **No sidecar.** The studio needs a separate process because Tauri cannot spawn;
  a VS Code extension host IS node and already spawns `claude`. Most of its
  420-line provider becomes extension-side code.
- **The cost is real and is not rendering:** slash commands (the studio had to
  intercept five terminal-only built-ins that silently no-op headless),
  `--continue`/`--resume`, `@file`, image paste, ctrl-C, and any future TUI work
  Anthropic ships.
- **Four unknowns must be spiked first**, chief among them what is lost when
  `--setting-sources=` is empty — if the generated project bundle cannot survive
  it, our agent experience would be WORSE inside our own chat, which is fatal.

Recommendation: spike, do not commit — and do it after the three Evaluation Mode
holes, which are needed either way and produce pieces this reuses.

## Goal / Scope

**In scope:** a chat surface inside the extension that drives the local `claude`
binary over a streaming session and renders the result — tool calls with server
attribution and readable actions, live progress, permission requests as UI.

**Out of scope:** replacing Claude Code, the Agent SDK path, and any change to the
generated bundle. The bundle is what makes this work; it does not change.

**Explicitly NOT decided here.** This item captures the option, its real cost, and
why the earlier objection was wrong. It is not an argument that it should be built.

## Constraints

- **The terminal must keep working.** Whatever is built is an additional surface
  or a replacement chosen deliberately — not a silent swap. Producers who like the
  terminal keep it.
- **Permission handling is the hard part, not rendering.** A custom UI must show
  approvals and honour refusals. The studio solved this in Phase 0; read that
  before designing anything.
- **The stream format is Anthropic's, not ours.** It will change. That maintenance
  is the standing cost of this option and should be stated plainly to whoever
  decides.
- **Do not fork the tool-label vocabulary.** If the studio ships MCP labels first,
  take its mapping rather than writing a second one.

## Do this first, either way

**Emit MCP progress from our own tools.** It is small, it lands now, and it is a
prerequisite for the big option rather than a detour — a custom UI still needs the
server to send the notifications it renders.

The seam is `withToolLogging` in `inExtensionMcpServer.ts`, already wrapping every
call for logging, consent and the VS Code notifier. It gains a fourth concern, and
the handler signature needs the SDK's `extra` argument to reach `sendNotification`.
The phase strings largely exist — `create_project` and `add_integration` already
compute them for the VS Code progress bar. Same words, second destination.

Attribution is a prefix we choose, since the message is free-form text and the
server knows its own name (`SERVER_NAME` in `inExtensionMcpServer.ts`).

## Kickoff prompt

```
/rptc:feat "Decide whether Demo Builder should render Claude Code's stream in its own chat
surface instead of a terminal. Read .rptc/backlog/2026-08-24-own-the-chat-surface.md first —
it records a correction (owning the chat does NOT mean abandoning Claude Code or ADR-004)
and names the prior art in app-builder/tech-case-studio. Start with the smaller prerequisite
it identifies: emitting MCP progress notifications from withToolLogging."
```
