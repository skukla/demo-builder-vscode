# Can we control what the chat window shows about what's running?

**Question (2026-08-24).** When an agent works, it is not clear which MCP tool,
skill or hook is running. Could the user see "Demo Builder is running
`create_project`", then "now adding an App Builder runtime", as it happens?

**Short answer: yes for MCP tool progress, and the protocol half is proven. The
extension sends none of it today.**

## What is already true

**The chat already knows which server.** Tool calls arrive named
`mcp__demo-builder__get_current_project` — the server is in the tool name, so any
"which MCP is this" display is a rendering choice, not missing data. Verified in
every driven run today.

**The extension's visibility work goes to VS Code, not the chat.**
`agentOperationNotifier.ts` wraps every non-read tool with a `withProgress`
notification, a status-bar message on success and a warning toast on failure. All
of that lands in the VS Code window. A user reading the chat sees none of it.

**Zero MCP-level progress is sent.** `grep sendNotification|notifications/progress
src/` returns nothing. The capability below is entirely unused.

## Measured: Claude Code requests progress, and accepts it

MCP's `notifications/progress` carries `progressToken`, `progress`, optional
`total` and — the useful part — an optional **`message` string**
(`@modelcontextprotocol/sdk` `types.d.ts:955-960`). The spec notes a receiver "is
not obligated to provide these notifications", so this needed testing rather than
assuming.

Probe: a throwaway MCP server (`probe-server.mjs`, kept beside this file) with one
tool that reports what the caller sent and then emits three progress messages.
Driven with real Claude Code:

```
claude -p "Call the run_probe tool…" --mcp-config <probe> --strict-mcp-config \
        --allowed-tools mcp__probe__run_probe --permission-mode dontAsk \
        --output-format stream-json --verbose
```

Result:

```json
{"progressTokenPresent":true,"token":2,
 "sent_1":"Cloning repository…",
 "sent_2":"Subscribing Adobe APIs…",
 "sent_3":"Deploying to Runtime…"}
```

**Claude Code supplies a progress token on MCP tool calls, and all three
notifications sent without error.** So a long-running tool CAN stream
human-readable sub-steps to the client while it works. That is exactly the
"now it's adding a runtime" narration the question asks for.

## The one thing this does NOT establish

**Whether the interactive TUI renders those messages.** No
`notifications/progress` event appeared in the headless `stream-json` output —
but headless mode is not the chat window, and absence there says nothing about
the terminal UI.

This is cheap to settle and expensive to guess at (see the sidebar work the same
day, where four blind guesses at an unseeable surface cost hours). **Do not design
around an assumed answer.**

### How to settle it

From the repo root:

```bash
claude --mcp-config .rptc/research/agent-activity-visibility/probe-mcp.json \
       --strict-mcp-config
```

Then type: `Call the run_probe tool.`

`--strict-mcp-config` loads ONLY the probe server, so the usual servers stay out
of the way and the tool is easy to spot.

**Watch the chat WHILE the call runs.** The tool deliberately takes ~6 seconds,
pausing 2s before each message. The first version fired all three inside a few
milliseconds, which would have shown a flash even on a client that renders them
properly — and the test would have been recorded as a negative. A visual question
needs a call you can actually watch.

| What you see | What it means |
|---|---|
| "Cloning repository…", "Subscribing Adobe APIs…", "Deploying to Runtime…" appear as the call runs | The TUI renders progress. Build it — the phases already exist for the VS Code progress bar. |
| Only the final JSON result, no intermediate lines | The client accepts progress but does not display it. Nothing to build here; the answer is the VS Code notifier or a different surface entirely. |

The returned JSON says whether Claude asked for progress at all
(`progressTokenPresent`). It was `true` when measured; if a future version
returns `false`, the mechanism is gone and this whole avenue closes.

## What is NOT controllable from here

- **Skills, hooks and built-in tools.** Their display is Claude Code's, not ours.
  A PreToolUse hook can surface text when it BLOCKS (the repo's own rules do), but
  that is a refusal path, not narration.
- **The rendering itself.** We can supply richer data; we cannot restyle the
  client. A `title` is set on many tools already
  (`adobeTools.ts:140` and others) — whether the TUI prefers it over the raw name
  is the same unverified question as above.

## If it renders, what to build

The seam is the one every tool already passes through: `withToolLogging` in
`inExtensionMcpServer.ts`, which today wraps calls for logging, consent and the
VS Code notifier. It would gain a fourth concern — forwarding sub-step messages
over MCP — and the handler signature would need the SDK's `extra` argument to
reach `sendNotification`.

Cheapest useful version: emit one progress message at the START of every non-read
tool naming the operation ("Demo Builder: creating project…"), reusing the
`humanize()` already in `agentOperationNotifier.ts`. Long multi-phase tools
(`create_project`, `add_integration`) could then stream their real phases, which
are already tracked for the VS Code progress bar — the same strings, a second
destination.

That symmetry is the point: the phases exist, they are already computed, and they
currently reach only the window the user is not looking at.

## The other answer: own the renderer (tech-case-studio)

`app-builder/tech-case-studio` solves the same problem from the other end, and it
is worth knowing before investing here.

It drives the agent through the **Claude Agent SDK** in a Node sidecar, streams
NDJSON to a React frontend, and renders its own chat. So it does not ask what the
client will display — it *is* the client. `src/tool-call.ts` maps a raw `tool_use`
to `{ icon, label, target, body }`: Bash becomes "Ran command" with a terminal
line, Edit becomes "Edited" with a diff.

**But note where MCP tools land.** That mapping is a `switch` over built-in tool
names, and everything else falls to:

```ts
default:
  return { icon: "tools", label: name, body: prettyJson(input), bodyLang: "json" };
```

So `mcp__demo-builder__create_project` renders as its raw name plus a JSON dump —
exactly the unclear display this research started from. The studio has not solved
it either; the difference is that it *could*, in one file, because it owns the
renderer.

Two conclusions:

1. **A friendly MCP label is a small win available to the studio today** — teach
   that `switch` to split `mcp__<server>__<tool>` into a server badge and a
   humanised tool name. It needs nothing from this repo.
2. **For Demo Builder in Claude Code's terminal, we do not own the renderer.** We
   can only supply better data (name, `title`, progress messages) and hope it is
   shown. If presentation ever becomes important enough to control, the studio's
   architecture is the proven route — and it is already de-risked, per its Phase 0
   spike.

## Relationship to Evaluation Mode

Not a dependency either way, but related: Evaluation Mode records the PATH an
agent took for later inspection, while this shows it live. Same underlying facts,
different consumer. If both are built, they should read the same phase strings
rather than inventing two vocabularies.
