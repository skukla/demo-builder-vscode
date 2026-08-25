# Should Demo Builder render its own chat?

Research pass, 2026-08-25, asked after Evaluation Mode steps 01–07 shipped and
the owner hit the limit directly: expanding a tool block in the chat showed a raw
JSON object, and the readable trace they wanted had nowhere to live.

**Short answer: yes, probably — and it is much less work than it looks, because
we already own most of the pieces and the studio already de-risked the hard one.
But it is not free, and what it costs is Claude Code's terminal UI.**

## What we would GAIN, stated as things blocked today

Not speculation — each is a wall something already hit this month.

| Gain | The wall it removes |
|---|---|
| **Permission coverage for EVERY tool** | Our consent gate sees only OUR tools. An agent running `rm -rf` through Bash is invisible to Demo Builder, and the owner has decided Claude's own checks stay off. Today nothing asks |
| **A durable, readable trace** | What persists in the chat is Claude Code's rendering. Our narration is live and vanishes; the record is a JSON dump. Step 08 exists only because the trace cannot live where the work happens |
| **We control what a producer reads** | Two rounds of copy work this month improved the text of our results; the layout around them stayed Claude Code's. Own the surface and "this reads badly" becomes fixable |
| **One place instead of four** | Prompt Library, evaluation workbench, chat tile, and Manage Prompts are four entries for one activity |

## What we would LOSE — the honest column

Everything Claude Code's terminal gives free:

- **Slash commands.** The studio had to intercept them (`chat-commands.ts`, 106
  lines) because `/login`, `/config`, `/model`, `/permissions` and `/mcp` open
  interactive dialogs and **silently no-op** headless. Forwarding them looks
  broken.
- **`--continue` / `--resume`**, `@file` references, image paste, ctrl-C
  interrupt, plan mode, the TUI's own scrollback.
- **Anthropic's future work on that TUI.** Whatever they ship next, we would not
  get.

That list is the real cost. It is not a rendering question.

## What we ALREADY have — this is the part that surprised me

Nine webview surfaces, and the machinery under them is exactly what a chat needs:

    wizard · dashboard · configure · sidebar · projectsList
    aiOverview (the Prompt Library) · integrations · dataInstaller
    evaluation (the workbench)

Directly reusable:

- **The Prompt Library** (`aiSurface/`, 754 lines) — saved prompts, edit dialog,
  pin/scope routing. In a chat surface this stops being a separate screen and
  becomes the composer's history and its saved-prompt picker. It also closes the
  "cannot load a saved prompt back" hole for free.
- **The evaluation workbench** (`ui/`, 364 lines) — verdict, trace rendering,
  suggestions, waste analysis. This IS a transcript view already; it renders a
  list of tool calls with plain-language labels.
- **The trace recorder** — every call, with argument keys, sizes, durations and
  a repeat fingerprint. A custom chat would render this LIVE instead of
  after the fact.
- **`toolNarration.ts`** — 103 authored phrases. The studio's `tool-call.ts`
  (87 lines) is the same idea for Claude's built-ins; ours covers the MCP half
  they explicitly lack. **The two are complementary and neither duplicates the
  other.**
- **`agentAlertCopy.ts`** — authored action/consequence/target for 16 tools, plus
  the session-grant rule. That is a permission card's content, already written.
- **`consentText.ts`** — already vscode-free and shared by two surfaces.
- The webview command machinery: `BaseWebviewCommand`, the handshake protocol,
  `comm.sendMessage` for pushes.

## What we would BUILD, measured against the studio

The studio's chat is roughly:

    useAgentChat.ts     446    the loop
    events.ts           266    stream → view events
    chat-history.ts     200    transcript state
    tool-call.ts         87    tool → friendly view
    chat-commands.ts    106    slash-command interception
    permission-allow.ts  51    session allow policy
    operations.ts        84
    claude-cli-provider 420    spawn + stream-json + permission bridge
    ------------------------
    ~1,660 lines, plus its App.tsx chat UI

**And ours is simpler in one important way: no sidecar.** The studio needs a
separate process because Tauri's frontend cannot spawn. A VS Code extension host
IS node — it already spawns `claude` today (`openInClaude.ts`). So
`claude-cli-provider`'s 420 lines mostly become extension-side code we can host
directly, and the webview talks to it over the messaging we already use.

Realistic estimate: **1,000–1,500 new lines**, most of it stream parsing and
transcript rendering, against ~1,900 lines of existing surfaces that fold in
rather than being rebuilt.

## The mechanism that makes it worth it

`--permission-prompt-tool stdio` alongside `--input-format stream-json`
(`claude-cli-provider.ts:243-252`). Permission requests arrive as
`control_request` / `can_use_tool` carrying the tool name and its input —
**for every tool, before it runs.** That is the one thing elicitation cannot do,
and it is the strongest single argument here.

Two flags in that spawn are security-critical and must be copied with their
reasoning, not just their values:

- **`--setting-sources=` empty.** `--allowedTools` is ADDITIVE in the CLI, not an
  exclusive whitelist, so loading the user's settings lets a `permissions.allow`
  entry short-circuit approval before the card ever sees the call. This is the
  same hazard measured here on 2026-08-24 (`defaultMode: auto`, no allowlist).
- **`--allowedTools` pre-trusts connected MCP servers** plus Read/Glob/Grep, so
  research fetches do not each hit a card. That is a judgement about what is
  worth asking about, and ours would differ: our own destructive tools already
  have a consent gate, so they should NOT be pre-trusted twice.

## The unknowns a spike must answer BEFORE committing

1. **Does `--permission-prompt-tool stdio` behave the same when the host is a
   VS Code extension rather than a Tauri sidecar?** Nothing suggests otherwise —
   it is stdio either way — but it is the load-bearing assumption.
2. **What is lost when `--setting-sources=` is empty?** The producer's own
   CLAUDE.md, their MCP servers, their settings. The studio re-injects model and
   MCP deliberately. We would need to decide about the generated project bundle,
   which is the whole basis of our agent experience.
3. **Streaming into a webview at speed.** Our messaging is request/response with
   a handshake; partial-message streaming is a different shape. Measure before
   designing.
4. **What happens to `--continue`?** Session continuity is the producer's work
   history — 45 conversations on this machine. A custom chat must resume them or
   it is a downgrade.

## Recommendation

**Spike it, do not commit to it.** Answer the four unknowns with a throwaway —
spawn `claude` from the extension host with the studio's flags, render the stream
into a scratch webview, and prove a permission request round-trips. That is a day
or two and it converts every remaining question from opinion into measurement.

**And do it AFTER the three holes.** `prompt-threads` and step 08 are needed
whether or not this happens — a saved prompt must load back, and a trace must be
readable — and both produce pieces this would reuse. Building them first is not a
detour; it is the same work in the order that keeps it useful either way.

**What would change the answer to "no":** if the spike shows the generated
project bundle cannot survive `--setting-sources=`, the agent experience we ship
would be worse inside our own chat than outside it, and that is fatal.
