# Can the consent prompt appear in the chat?

Measured 2026-08-25, as task one of step 06. Two probes in this directory, both
runnable again.

## The question

Demo Builder's consent dialog opens in the VS Code window. The producer is
looking at the TERMINAL. A blocking prompt in a window nobody is watching is
worse than no prompt — the agent hangs until it happens to be noticed.

MCP has a mechanism for this: **elicitation**, where a SERVER asks the USER
something (`server.elicitInput()`). The SDK in this repo exposes it. Whether
Claude Code accepts one was unverified, and it decides the whole step.

## Answer 1 — it is DECLARED

`probe-capabilities.mjs`, run against `claude -p`:

```json
"clientInfo": { "name": "claude-code", "version": "2.1.245" },
"capabilities": {
  "elicitation": { "form": {} },
  "roots": { "listChanged": true }
}
```

So: **elicitation yes** (the `form` variant), roots yes, sampling no.

## Answer 2 — headless, it auto-cancels in 4ms

`probe-elicit.mjs` actually calls `elicitInput`. Headless (`claude -p`, no human
at a terminal):

```json
{ "outcome": "answered", "ms": 4, "result": { "action": "cancel" } }
```

**It does not hang and it does not throw.** That was the fear — a consent gate
that blocks a headless run forever — and it is not what happens.

## The problem this uncovered, which is the real finding

A server cannot tell "the user dismissed it" from "there is no user". Both would
arrive as a cancelled elicitation, and treating a cancel as a refusal would mean
**every destructive operation silently refuses in any headless run**.

**What saves it: MCP defines THREE outcomes, not two.**

| Action | Means | What we should do |
|---|---|---|
| `accept` | the user said yes | allow |
| `decline` | the user deliberately said no | refuse — and it is a real answer |
| `cancel` | dismissed, or nobody was there | **fall back to the VS Code modal** |

Claude Code returns `cancel` for the no-human case, not `decline`. So the
distinction the spec already draws is exactly the one needed: a decline is an
answer, a cancel is the absence of one.

## The design that follows

1. If the client declares `elicitation`, ask in the CHAT.
2. `accept` → allowed. `decline` → refused, and say the user declined.
3. `cancel` → **fall back to the modal**, because nobody answered. In a headless
   producer run that means the operation waits for the VS Code window — which is
   correct, since our server lives there and `demoBuilder.ai.requireAgentConsent`
   remains the escape hatch for genuinely unattended use.
4. If the client declares no elicitation, the modal is the only path, exactly as
   today.

The modal never stops being the floor. A consent gate that silently stops working
is the worst available outcome.

## STILL UNVERIFIED — needs a human

**Whether an interactive Claude Code session actually RENDERS a usable prompt.**
Declared and works are different questions, and this is the same shape the
progress research hit: the protocol allowed it, the declaration was there, and
what settled it was a producer running the probe in a real terminal and watching.

To check it — **run this from wherever you actually are**, which for a probe is
usually a demo project, not the repo:

```bash
# generates an absolute-path config in the temp dir and prints where
CFG=$(node <repo>/.rptc/research/probe-config.mjs \
        <repo>/.rptc/research/consent-in-the-chat/probe-elicit.mjs elicit-probe)
claude --mcp-config "$CFG" --strict-mcp-config \
       --allowedTools 'mcp__elicit-probe__ask_the_user'
# then: "call ask_the_user"
```

**`--allowedTools` is not optional, and this cost a round trip.** With
`ENABLE_TOOL_SEARCH: true` in `~/.claude/settings.json` — which is the setting
here — MCP tools are DEFERRED: the model does not see them until it searches by
name. Run without it and an interactive session answers *"There's no tool named
ask_the_user"* while the server is connected perfectly well. The headless runs
above worked only because they passed the full tool name.

Two ways to tell the difference, since "no such tool" reads identically to a
server that failed to start: type `/mcp` to list connected servers, or name the
tool in full — `use mcp__elicit-probe__ask_the_user`.

The tracked `probe-elicit-mcp.json` beside this file uses RELATIVE paths, because
this repo is public and a committed home path is forbidden. That config therefore
only works from the repo root. `probe-config.mjs` exists to bridge exactly that
gap — twice on 2026-08-25 a probe command was handed over that failed with
"config file doesn't exist" because the producer was in
`~/.demo-builder/projects`, which is where they should have been.

Watch for a prompt in the chat. Whatever comes back — `accept`, `decline`, or a
cancel because no prompt appeared — is the answer. The design above holds either
way, because `cancel` already routes to the modal; but if no prompt renders at
all, elicitation is not worth building and the step reduces to the session-grant
work.
