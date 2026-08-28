# Spike result — owning the chat surface

**Run 2026-08-26** against Claude Code **2.1.246**, after the owner reopened the
decision parked on 2026-08-25.

**Verdict: technically FEASIBLE. All four unknowns answered, three pass outright
and the fourth confirms a rule we must adopt.** The remaining question is the one
the spike said it could not answer — how much the terminal's own affordances
matter — and that is still the owner's call.

## Why it was reopened

Not by the recorded revival conditions, but by DRIFT: the "cheap path" grew into
the expensive one while being designed. The companion panel had accumulated the
producer's prompt (read from Claude's transcript), the agent's reply, the full
tool trace including Bash, a summary and a clickable hand-off — which is a chat
transcript, reconstructed from a file, rendered beside the real conversation.

The objection that parked it was also already conceded: *"there is deliberately
no transcript parser here"* stopped being true when step 11 chose to read the
transcript for the hand-off.

## The four measurements

### 1. `--permission-prompt-tool stdio` from a node host — **PASS**

The load-bearing unknown, and it works.

**The flag is UNDOCUMENTED.** It does not appear in `claude --help` on 2.1.246
(`--permission-mode` does; this does not). It parses and functions. Treat it as
an unsupported surface that can change without notice — that is a real risk to
carry, not a footnote.

Request envelope, verbatim:

```jsonc
{
  "type": "control_request",
  "request_id": "45300e1e-…",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "display_name": "…",
    "input": { "command": "echo ran > /tmp/spike-probe-ran.txt", "description": "…" },
    "description": "…",
    "permission_suggestions": [
      { "type": "addRules", "rules": [ { "toolName": "Bash", "ruleContent": "echo ran *" } ],
        "behavior": "allow", "destination": "localSettings" },
      { "type": "addDirectories", "directories": ["/tmp"], "destination": "session" }
    ],
    "blocked_path": "/tmp/spike-probe-ran.txt",
    "tool_use_id": "toolu_01CbLGzQ…"
  }
}
```

Reply:

```jsonc
{ "type": "control_response",
  "response": { "subtype": "success", "request_id": "…",
    "response": { "behavior": "allow", "updatedInput": { … } } } }
// deny: { "behavior": "deny", "message": "…" }
```

**Verified by execution, with both controls** — this is the part that makes the
answer trustworthy rather than plausible:

| Reply | Marker file | Meaning |
|---|---|---|
| `deny` | ABSENT | the command did not run; the deny `message` reached the agent as the tool result |
| `allow` | PRESENT, contents `ran` | the command ran |

Without the allow arm, "it didn't run" would be indistinguishable from "the reply
channel is broken".

**`permission_suggestions` is a bonus nobody predicted.** The CLI pre-computes
the allow-rules a card would offer ("always allow `echo ran *`", "trust `/tmp`
for this session"). That is a permission card's buttons, already written.

**Trap: stdin must stay OPEN.** Ending it produces
`Tool permission request failed: AbortError: Stream closed`. The good news is the
failure direction: the tool is **denied**, not allowed. It fails closed.

### 2. Streaming into a webview — **PASS, comfortably**

The research flagged this as one of two things that could still kill it. It does
not come close.

| | |
|---|---|
| events | 50 |
| bytes | 30,074 |
| wall clock | 9.6s |
| **events/sec** | **5** |
| median inter-chunk gap | 298ms |
| p90 gap | 335ms |

Five events a second through `comm.sendMessage` needs no batching, no throttling
and no special handling. Even with `--include-partial-messages` the CLI is
already chunking; it is not per-token firehose.

### 3. `--continue` — **PARTIAL PASS, exactly as the plan predicted**

- **Context carries.** Session 1 was told to remember `4271`; session 2 with
  `--continue` answered `4271`.
- **Same `session_id`** is reused and is announced in the `system/init` event.
- **The transcript is NOT replayed.** A `--continue` stream carries 2 messages —
  identical to a fresh session. Our view would start blank against a model that
  remembers everything.

The plan called this "a real product decision, not a bug", and it is. It is also
**solvable**: `system/init` gives the `session_id`, which names the transcript
file under `~/.claude/projects/**/`, so history is reconstructable — at the cost
of the transcript-read dependency step 11 already accepted.

### 4. Which consent wins — **BOTH FIRE. A rule is mandatory.**

**Our MCP tools DO go through the permission card.** Calling
`mcp__demo-builder__get_current_project` produced its own `can_use_tool` request,
alongside one for `Bash`.

So for any of our `confirm: true` tools, a producer would meet **the card AND our
own consent gate** — the "asked twice" failure the plan named as disqualifying.

**The rule the plan predicted is confirmed as necessary:** pre-trust our own
tools at the card via `--allowedTools`, and keep our gate. Our copy
(`agentAlertCopy.ts`) names the target and the consequence for 16 tools; a
generic card does not. Everything else — Bash, Write, Edit, WebFetch — goes to
the card, which is precisely the surface we have never been able to see.

Flag hazards, copied with their reasoning:

- **`--allowedTools` is ADDITIVE, not an exclusive whitelist.**
- **`--setting-sources` must be empty** so a user's `permissions.allow` cannot
  short-circuit the card. (Note: emptying it does NOT break `--mcp-config`; M4
  loaded all 105 demo-builder tools with `--strict-mcp-config`.)

## Beyond the four — the owner asked for everything spikeable

*"You need to spike absolutely everything possible to understand what we can
build."* Six further probes. Two of them change the decision.

### 5. Slash commands MOSTLY WORK — the headline cost is largely wrong

The research's central cost claim was that slash commands *"open interactive
dialogs and **silently no-op** headless"* and that *"forwarding them looks
broken"*. **On 2.1.246 that is not what happens.**

| Command | Result through `stream-json` input |
|---|---|
| `/model` | **Works, read AND write.** `/model sonnet` → *"Set model to Sonnet 5 for this session only"*, and a follow-up `/model` confirms it |
| `/cost` | **Works.** Session %, week %, and reset times in plain prose |
| `/context` | **Works.** Full context breakdown — tokens used, by category |
| `/clear` | **Works**, and emits a distinct `conversation_reset` event |
| `/mcp` | **Works** (summary: connected / not connected counts) |
| `/compact`, `/doctor`, `/agents` | **Work** |
| `/help`, `/status`, `/login`, `/permissions`, `/export` | Unavailable — but answer **one clear sentence**: *"/help isn't available in this environment."* |

Nothing was silent. Nothing looked broken. The genuinely lost set is five
commands, and only **`/login`** is serious — and a Demo Builder producer signs in
to Adobe through our own flow, not Claude's.

### 6. Interrupt works

`{"type":"control_request","request":{"subtype":"interrupt"}}` is acknowledged
with `{"still_queued":[]}` and **aborts the turn** — the run came back
`subtype: error_during_execution` with output truncated mid-answer. ctrl-C is not
a loss.

### 7. The control protocol is far richer than assumed

Probed by sending each subtype and reading the response:

| Subtype | Result |
|---|---|
| `initialize` | **success** — a full capability handshake (below) |
| `set_model` | **success** — the model can be changed at RUNTIME |
| `set_permission_mode` | **success** — `{"mode":"plan"}`; permission mode changeable at runtime |
| `interrupt` | success |
| `mcp_message` | success |
| `hook_callback` | Unsupported |
| anything unknown | Clear error naming the subtype |

`set_model` and `set_permission_mode` mean a model picker and a mode switch are
ours to build directly — we would not even need to forward `/model`.

### 8. `initialize` hands us a whole client's worth of metadata

```
commands (48, each with a description)   agents (5)
models (5, with displayName + description)
output_style + available_output_styles (5)
account { email, organization, subscriptionType: "Claude Max", apiProvider }
current_permission_mode · session_state · pid · fast_mode_state
```

Nothing has to be hardcoded or guessed. A slash-command menu, a model picker with
human names and one-line descriptions, the subagent list, the account's plan —
all supplied.

### 9. Permission cards are EFFECT-based, not tool-based — and quiet

M1 saw `Bash` raise a card; probe 3 saw `Bash` run free. The difference is not the
tool, it is the **effect**: M1's command wrote to `/tmp`, outside the working
directory, and its request carried `blocked_path`. Inside the cwd, Bash passed
without a card.

| | |
|---|---|
| Ran WITHOUT a card | `ToolSearch`, `Read`, in-cwd `Bash` |
| Raised a card | `Write`; anything touching a path outside cwd |

**So a permission card UI would be quiet, not nagging** — it fires on genuinely
consequential things. That removes the "producers will drown in dialogs" worry.

### 10. The STREAM, not the card, is the complete visibility source

Every tool call appears in the stream as a `tool_use` block **whether or not it
raised a card** — probe 3 saw all five (`ToolSearch, Read, Bash, Bash, Write`)
while only one carded.

This matters for the gap-finding idea: the card shows what is *risky*; the stream
shows what *happened*. Owning the stream is what makes an agent reaching for
`curl` visible — the exact signal that produced `get_commerce_endpoints`.

### 11. Progressive rendering works, thinking included

`stream_event` wraps standard Anthropic streaming: `message_start`,
`content_block_start`, `content_block_delta`, `content_block_stop`,
`message_delta`, `message_stop`. Text deltas reassemble correctly. **Thinking
arrives too**, as `thinking_delta` — ours to render or hide.

## The unplanned finding, and it matters more than one of the measurements

**The stream carries rate-limit state.** Every run emits:

```jsonc
{ "type": "rate_limit_event",
  "rate_limit_info": {
    "status": "allowed_warning",
    "rateLimitType": "seven_day",
    "utilization": 0.85,
    "resetsAt": 1787752800,
    "unifiedWindows": {
      "five_hour": { "utilization": 0.04, "resetsAt": … },
      "seven_day": { "utilization": 0.85, "resetsAt": … }
    } } }
```

**This contradicts a claim made during step 11's design** — that no quota or
limit field exists, so "3% of your allowance" could not be computed and must not
be invented. It CAN be computed. It is in the stream.

It does not appear in `--output-format json` (the shape the evaluation service
reads today), which is why it was missed: it is a **streaming-only** event.

The consequence is direct. Step 11's whole metric argument is that tokens matter
because **the quota runs out and the producer loses access**. This turns that
from an abstraction into a number they can act on — *"you are at 85% of your
weekly limit, resetting Thursday"* — and it is only reachable if we consume the
stream.

## What this cost

Six `claude` runs on haiku, roughly $0.25 total. The harnesses are throwaway and
live in the session scratchpad, not the repo — per the plan's rule that a spike
which tempts anyone to keep it was written wrong.

## Residual risk not measured

- **Ran from a node script, not the extension host.** The plan asked for the
  extension host specifically. The mechanism is `child_process.spawn` with piped
  stdio, which is identical in both, so the residual risk is low — but it is not
  zero and it is not measured.
- **The permission flag is undocumented** and can change without notice.
- **Slash commands were not tested.** They are a known loss, not an unknown.

## What we could build, concretely

Not "a chat window". With the protocol above, a first-class client:

- **A transcript** with phases, our 103 authored phrases for MCP calls, and
  Claude's own tools rendered beside them — the complete picture the trace
  recorder structurally cannot see.
- **Permission cards** carrying our authored copy for our tools and the CLI's
  pre-computed `permission_suggestions` for everything else.
- **A model picker** from `initialize.models`, switched live via `set_model`.
- **A command menu** from `initialize.commands` — 48 entries with descriptions.
- **Quota, visible** — `rate_limit_event` utilisation and reset time, which is
  the number step 11's whole metric argument rests on.
- **Interrupt**, natively.
- **Mode switching** via `set_permission_mode` — plausibly how "simulate" should
  work rather than our own global flag.

## Recommendation

**The technical case is now substantially stronger than when this was parked**,
and the change is not marginal. Three of the four cost items were overstated:

- Slash commands **mostly work**; the ones that do not say so in a sentence.
- **Interrupt works.**
- **Model switching works**, at runtime, without forwarding a command at all.

And three capabilities nobody had counted arrived for free:
`permission_suggestions` (a card's buttons, pre-computed), `initialize` (a whole
client's metadata), and `rate_limit_event` (the quota number step 11 rests on).

**The real risk moved.** It is no longer "can we?" — it is that
`--permission-prompt-tool` is **undocumented**, and the control protocol around it
is undocumented. We would be building a primary surface on an unsupported API
that can change in any release. That is a genuine standing cost and it should be
the thing weighed, not feasibility.

**The decision is still not technical.** The spike cannot price this, and it is
the whole cost:

**The revised loss column, measured rather than assumed:**

| Lost | Severity |
|---|---|
| `/login` | **The only serious one.** Interactive auth. Mitigable: a producer signs in to Adobe through our flow, and Claude auth is rare and can be sent to a terminal |
| `/permissions`, `/status`, `/help`, `/export` | Minor. `/permissions` is partly replaced by owning the cards; `/status` and `/cost` overlap and `/cost` works |
| `@file`, image paste | TUI input features; ours to rebuild if wanted |
| Plan mode UI, TUI scrollback | Ours to rebuild — though `set_permission_mode: plan` works, so the MODE is available even if the UI is not |
| Anthropic's future TUI work | Unchanged, and real |

`/model` is no longer in this column — it works, and `set_model` makes it native.

**Suggested next step, unchanged by the new findings and arguably reinforced by
them:** do NOT start with the chat. Start with `rate_limit_event` — a small,
independent win that needs streaming but not ownership, and it makes step 11's
headline honest.

The reason is the undocumented-API risk. Consuming the stream for one number
exercises the same seam at a fraction of the commitment, and if the format shifts
we lose a badge rather than the primary surface.
