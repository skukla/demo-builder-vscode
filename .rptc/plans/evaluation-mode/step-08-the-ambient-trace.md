# Step 08 — Show the trace for the chat you are actually in

**Ships:** what the agent just did in YOUR chat, visible.
**Depends on:** step 02 (the recorder, which already captures it).
**Status:** the gap found by the owner while testing, 2026-08-25.

## The gap

Turn dry run on, chat normally, ask for something. You get the safety — nothing
changes, and the agent tells you what it would have done. **You get no trace and
no cost.**

Those live in the workbench, which spawns its OWN run of a prompt you type there.
Chatting normally gives you a guarantee and no visibility.

**The plan promised otherwise.** `overview.md:209` — *"Ambient mode (mode on, user
chats normally)… Its trace comes from the recorder above."* The recorder does
capture it: `extension.ts:324` passes `agentTrace` to the main server, so every
call in every chat is being recorded right now. The only thing that ever READS it
is `promptEvaluationService.ts:241`, for runs the workbench spawned.

So the data exists and nothing shows it. That is the whole step.

## What it can and cannot show

| | Ambient chat | Workbench run |
|---|---|---|
| Which tools, in order | yes | yes |
| Durations, response sizes | yes | yes |
| Repeated questions | yes | yes |
| Calls the dry run blocked | yes | yes |
| **Dollars and tokens** | **no** | yes |

Cost is missing because it comes from the run's own JSON output, and we do not
own the chat's process. **Do not fake it.** A per-call estimate would be a number
that looks authoritative and is not, in a feature whose entire purpose is
replacing guesses with measurements.

**Say so on the surface**: "Cost is not available for a chat session — try a
prompt out to measure it." That sentence is the honest version and it also points
at the thing that can answer.

## What would close even that

`claude_code.cost.usage` and `claude_code.token.usage` ARE emitted as OpenTelemetry
metrics — measured 2026-08-25, `.rptc/research/claude-code-telemetry/`. A local
sink would give ambient cost without owning the process.

That is the third time the telemetry sub-plan has turned out to be worth more
than it was filed as. Note it there rather than pulling it forward here.

## Shape

Cheapest thing that works, and probably the right one: **a command** —
"Demo Builder: Show What The Agent Just Did" — rendering the recorder's current
contents.

Where it renders is the only real decision:

- **An output channel** is nearly free and matches "Demo Builder: Debug Logs",
  which producers already know. Plain text, no new webview.
- **The workbench, in a second mode**, reuses the trace rendering and the
  waste analysis that already exist — but that view is built around a verdict for
  a prompt, and an ambient trace has no prompt and no cost. Fitting it in would
  mean weakening the thing it does well.

Start with the output channel. If producers reach for it often, the case for a
view will make itself.

## Traps

- **The recorder is a 500-entry ring across the WHOLE window**, not per chat. Two
  chats and a workbench run all write to it. Either say so on the surface, or
  segment by the `set_current_project` boundary the way step 02 suggested for
  project shape. Do not silently present one window's activity as one
  conversation.
- **It resets when the window reloads.** In memory by design. Say that rather
  than let someone think their history was lost.
- **It fills with reads**, because reads are recorded deliberately. Ordering by
  "interesting" (blocked, repeated, slow) beats a raw dump for a surface someone
  reads in a hurry.

## Tests

- The command renders calls made through the ordinary chat path, not only
  workbench runs.
- Repeats and blocked calls are called out, not just listed.
- Cost is absent and the absence is EXPLAINED, not shown as zero.
- An empty recorder says so rather than rendering an empty frame.

## Done when

A producer can chat with dry run on, then see what the agent actually did —
without going through the workbench.
