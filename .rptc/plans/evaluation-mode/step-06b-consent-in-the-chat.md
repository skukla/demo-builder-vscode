# Step 06b — Ask in the chat, when the chat can answer

**Ships:** the consent prompt appears where the producer is actually looking.
**Depends on:** step 06 (shipped — session grants), and ONE observation below.
**Status:** designed in part, gated, not started.

## Why this is its own step

Step 06 held two halves. The session grants shipped. This half did not, because
it waits on something that is not code, and leaving a step half-open hides which
part is real. Same split as 01b.

## What is already DECIDED — do not re-litigate

**The decision rule**, settled 2026-08-25 after the owner corrected an earlier
design that branched on `decline` vs `cancel`:

> Anything that is not an explicit `accept` is a refusal.

The reasoning, in one line each — the full record is
`.rptc/research/consent-in-the-chat/research.md`:

- A server **cannot** tell "nobody was there" from "the user said no". Both
  arrive as `cancel`, and the payload carries nothing that separates them.
- The three actions exist in the spec, but only `cancel` has ever been observed.
  Branching on the difference is a guess dressed as a fact.
- Both ways of being wrong are bad: route `cancel` to the modal and a user who
  declined in chat is asked again elsewhere; do it in a headless run and the
  operation waits on a dialog nobody is watching.
- So: headless refuses every destructive operation, which is correct by default
  — `demoBuilder.ai.requireAgentConsent` is the deliberate unattended escape
  hatch. Nothing hangs. Nobody is asked twice.

**Also settled:** the modal stays for clients that declare NO elicitation. It is
the floor, not a second chance after a chat prompt.

**Measured, not assumed:** Claude Code declares `elicitation: { form: {} }` and
genuinely answers the request — headless, in ~5ms, with `cancel` and no prompt
shown to the operator.

## THE GATE — one observation, and it decides whether to build at all

**Does an interactive Claude Code session render a usable prompt?**

Everything above holds either way. What is unknown is whether this is worth
building: if no prompt renders, there is nothing to move into the chat and this
step closes as ANSWERED rather than built.

### Where to run it, and why the answer is not "the chat tab"

**The target surface IS the extension's Chat tab** — a VS Code editor-area
terminal running `claude --continue` (`openInClaude.ts:245`,
`location=editor-active`). That is where producers work and where consent needs
to appear. Nothing below contradicts that.

But the PROBE cannot run there. The Chat tab launches `claude` with fixed
arguments, so a throwaway probe server has no way to attach — `--mcp-config`
cannot be injected into a session the extension spawns. That is a limitation of
the PROBE, not a statement about where consent belongs.

**Use a VS Code integrated terminal** (Terminal → New Terminal, not the Chat
tile). Same machine, same binary, same interactive TUI — the only difference is
that you control the arguments. A separate Terminal.app window works equally
well; an earlier draft of this step said "plain terminal outside the Extension
Development Host", which was about escaping the fixed arguments and read as
though the chat tab were the wrong environment. It is not.

**And the flags disappear in the real thing.** They exist only to attach a
throwaway server. The shipped path needs none of them: the Chat tab's session
already connects to the extension's own MCP server through the generated
`.mcp.json`, and that server is the one that would call `elicitInput`.

```bash
CFG=$(node <repo>/.rptc/research/probe-config.mjs \
        <repo>/.rptc/research/consent-in-the-chat/probe-elicit.mjs elicit-probe)
claude --mcp-config "$CFG" --strict-mcp-config \
       --settings '{"env":{"ENABLE_TOOL_SEARCH":"false"}}' \
       --allowedTools 'mcp__elicit-probe__ask_the_user'
# then: "call ask_the_user"       /mcp lists servers if the tool seems missing
```

Capture two things while there: whether a prompt renders, and **which action a
deliberate decline produces**. The decision rule needs neither — but the second
is one observation away and a future change might.

## What is NOT yet designed

Naming these so nobody reads "designed" and finds a blank:

1. **The prompt's own text and shape.** `elicitInput` takes a message and a
   requested schema. The modal's three lines — action, consequence, target — are
   authored in `AGENT_ALERT_COPY` and should feed this too, but a chat prompt is
   not a modal: it has no title/detail split, and the schema wants a shape
   (a boolean? an enum?). Decide against the rendered result, not on paper.
2. **Whether a chat prompt can offer a SESSION GRANT.** The modal's third button
   works because a modal has buttons. An elicitation schema would have to express
   it — a three-way enum, or a second boolean — and a clumsy rendering is worse
   than not offering it. Grants already work through the modal; this is an
   improvement, not a requirement.
3. **What happens if `elicitInput` throws or never returns.** Headless it answers
   in 5ms; a hung interactive client is untested. Whatever is built needs a
   timeout that fails CLOSED (refuse), and the refusal must say the prompt was
   never answered.

## Tests

- With a client declaring elicitation, the request goes to the client; with one
  that does not, the modal opens. Both by execution.
- `accept` allows; `decline` refuses; `cancel` refuses. Assert all three — the
  point is that two of them agree.
- A refusal caused by no answer says so, and names
  `demoBuilder.ai.requireAgentConsent` for unattended use. A headless user never
  saw a prompt, so a bare "not approved" is baffling.
- Session grants keep working unchanged through whichever path is taken.

## Done when

The prompt reaches the producer where they are working, or this step closes as
ANSWERED with the observation recorded. `gate` clean.
