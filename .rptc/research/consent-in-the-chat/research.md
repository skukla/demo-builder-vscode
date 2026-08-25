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

A server cannot tell "the user dismissed it" from "there is no user". Both arrive
as `action: "cancel"`, and **the payload carries nothing that separates them.**

### A design that rested on an untested assumption — CORRECTED

An earlier version of this file claimed the spec's three-way split saved us:
`decline` is a deliberate no, `cancel` is the absence of an answer, so route
`cancel` to the modal and treat `decline` as a refusal.

**The three actions are real** — `ElicitResultSchema` defines
`accept | decline | cancel`. **But we have only ever observed `cancel`.** Whether
an interactive decline returns `decline` or `cancel` is untested, so a design
branching on that distinction is built on a guess. Worse, both branches of it are
bad if the guess is wrong:

- If an interactive decline returns `cancel`, routing `cancel` to the modal means
  **declining in the chat pops a second prompt** — the user says no, and is asked
  again somewhere else.
- Routing `cancel` to the modal in a HEADLESS run means the operation waits on a
  dialog nobody is looking at. That is a hang, which is the thing this whole
  investigation was trying to avoid.

### What to do instead: cancel means NOT APPROVED

Simpler, and it depends on nothing untested:

| Action | Treat as |
|---|---|
| `accept` | approved |
| `decline` | not approved |
| `cancel` | **not approved** |

Anything that is not an explicit `accept` is a refusal. Consequences, all
acceptable:

- **Headless refuses every destructive operation.** Correct by default, and the
  existing escape hatch already covers deliberate unattended use:
  `demoBuilder.ai.requireAgentConsent` turned off.
- **Nothing ever hangs**, in either mode.
- **Nobody is ever asked twice.**
- The refusal message must say WHY and how to proceed, since in a headless run
  the user never saw a prompt at all.

The modal stays the path for clients that declare NO elicitation — which is what
it is for, rather than a second chance after a chat prompt.

## PARKED — the interactive question, and why it stopped mattering

**Whether an interactive Claude Code session renders a usable prompt is still
unmeasured.** Four attempts on 2026-08-25 failed for reasons that had nothing to
do with elicitation:

1. a relative `--mcp-config` path, run from `~/.demo-builder/projects` where it
   did not resolve (fixed by `probe-config.mjs`);
2. the same again;
3. `ENABLE_TOOL_SEARCH: true` hiding the probe's tool, so the session reported it
   did not exist while the server was connected (fixed by `--settings`);
4. run inside the extension's own Chat tab — a managed `claude --continue`
   session, not a clean one — where the settings override did not take.

**Parked deliberately, because the design stopped depending on it.** Once
"anything that is not an explicit `accept` is a refusal" replaced the
decline-vs-cancel branch, both answers lead to the same consent logic. The only
thing an interactive run still decides is whether elicitation is worth BUILDING —
a scheduling question, not a design one.

### If someone picks it up

Use a **plain terminal outside the Extension Development Host**. The extension's
Chat tab is a managed session and was where attempt 4 failed.

```bash
CFG=$(node <repo>/.rptc/research/probe-config.mjs \
        <repo>/.rptc/research/consent-in-the-chat/probe-elicit.mjs elicit-probe)
claude --mcp-config "$CFG" --strict-mcp-config \
       --settings '{"env":{"ENABLE_TOOL_SEARCH":"false"}}' \
       --allowedTools 'mcp__elicit-probe__ask_the_user'
# then: "call ask_the_user"      /mcp lists servers if the tool seems missing
```

Two things worth capturing while there: whether a prompt renders at all, and
**which action a deliberate decline produces**. The design needs neither, but the
second is one observation away and a future change might.

### The lesson that outlived the probe

Every one of the four failures was fixed at the INSTANCE — a new path, a new
flag — when the repo already held the answer. `ENABLE_TOOL_SEARCH` being
settings-only, and needing `--settings` to override per run, was written in the
battery README before this probe existed. Read what the repo knows about running
`claude` with overridden config BEFORE handing someone a command.
