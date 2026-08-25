# Spike — should Demo Builder render its own chat?

**Status:** planned, not started. Written 2026-08-25, immediately after the three
Evaluation Mode holes closed.

**This is a SPIKE, not a build.** Nothing it produces ships. Its whole job is to
turn four opinions into four measurements, and then to put a decision in front of
the owner with numbers attached. If the spike is written in a way that tempts
anyone to keep it, it was written wrong.

## Read first

- `.rptc/research/own-the-chat-surface/research.md` — the research pass. It says
  **yes, probably**, and it already killed the objection an earlier pass called
  fatal (settings sources; see unknown 2 there, ANSWERED).
- `.rptc/backlog/2026-08-24-own-the-chat-surface.md` — the correction that owning
  the chat does NOT mean abandoning Claude Code or contradicting ADR-004.
- `app-builder/tech-case-studio` — prior art that already did this. Its Phase 0
  spike de-risked exactly this seam and passed.

## Why now, and not before

The three holes are closed, and closing them is what made the case concrete
rather than theoretical:

- **Step 08 exists because the trace cannot live where the work happens.** We
  built a second surface to show what the agent did, because the chat's own
  rendering is Claude Code's and a JSON dump is what a producer sees when they
  expand a tool block.
- **Step 08 cannot show cost, and says so on screen.** Not a limitation of our
  code — we do not own the chat's process. Owning it removes the caveat rather
  than wording it better.
- **Our consent gate sees only OUR tools.** An agent running `rm -rf` through
  Bash is invisible to Demo Builder, and the owner has decided Claude Code's own
  permission checks stay off. Today nothing asks.

Every one of those is a wall something hit this month, and every one of them
points at the same place.

## What the spike must answer

Four measurements. Each names the command, what a pass looks like, and what the
answer changes — because an unknown with no pass line is a discussion, not a
spike.

### 1. Does `--permission-prompt-tool stdio` work when the host is an extension?

**The load-bearing assumption.** It is what gives a permission card EVERY tool,
including Bash — the single strongest argument for the whole idea, and the one
thing MCP elicitation cannot do.

- **Do:** spawn `claude` from the extension host (not a terminal, not a script)
  with `--input-format stream-json --output-format stream-json
  --include-partial-messages --permission-prompt-tool stdio`, and ask it to run
  one Bash command.
- **Pass:** a `control_request` / `can_use_tool` arrives carrying the tool name
  and its input, BEFORE the command runs, and a reply of "deny" stops it.
- **Fails if:** the request never arrives, or a denial does not actually prevent
  execution. Either kills the strongest argument and the answer becomes no.

### 2. Can a webview render a stream at speed?

Our messaging is request/response behind a handshake. Partial-message streaming
is a different shape, and the research flagged this as one of two things that
could still kill it.

- **Do:** push `stream_event` deltas straight through `comm.sendMessage` into a
  scratch webview and render them as they land. Ask for something that produces a
  long answer.
- **Pass:** text appears progressively, the extension host stays responsive, and
  nothing is dropped or reordered.
- **Fails if:** it needs batching to keep up. Not automatically fatal — measure
  the batch interval it needs and report it, because "streams fine at 50ms
  chunks" is a different answer from "cannot stream".

### 3. What happens to `--continue`?

Session continuity IS the producer's work history — 45 conversations on this
machine. A chat that cannot resume them is a downgrade wearing better paint.

- **Do:** start a session, end it, then start a new spawn with `--continue` and
  ask something that depends on the earlier turn.
- **Pass:** the context is there, and the transcript we render can be
  reconstructed from what the stream replays.
- **Partial pass worth naming:** the session resumes but the earlier transcript
  is NOT replayed, so our view starts blank against a model that remembers. That
  is a real product decision, not a bug, and it should be reported as such.

### 4. Which consent wins — ours or the card?

New, and not in the research. Evaluation Mode shipped a consent gate with
authored copy for 16 tools (`agentAlertCopy.ts`), a modal floor, and session
grants. A permission card would ask about the same calls.

- **Do:** run one of our own destructive tools through the spike with both paths
  live.
- **Pass:** the answer is a clear rule — most likely *our* tools are pre-trusted
  at the card and keep our gate, because our copy names the target and the
  consequence and a generic card does not, while everything else goes to the
  card.
- **Fails if:** a producer gets asked twice. Two dialogs for one action is worse
  than either alone, and shipping that would undo the work that made the first
  one readable.

Note the flag hazard the studio documents and the research repeats:
**`--allowedTools` is ADDITIVE, not an exclusive whitelist**, and
`--setting-sources=` must be empty so a user's `permissions.allow` entry cannot
short-circuit the card. Copy both with their reasoning, not just their values.

## What the spike must NOT do

- **Not touch the terminal path.** Whatever exists keeps working, untouched, for
  the whole spike and after it.
- **Not reuse a real surface.** A scratch webview. The moment it renders through
  the Prompt Library or the workbench, it stops being throwaway and starts being
  a migration nobody agreed to.
- **Not fold in the pieces it would eventually reuse.** The research lists them
  (`toolNarration.ts`, `agentAlertCopy.ts`, `consentText.ts`, the recorder, the
  Prompt Library, the workbench's trace rendering). That list is an argument
  about COST, and it stays an argument until the decision is made.

## The question only the owner can answer

The spike answers feasibility. It cannot answer this, and it should be asked
BEFORE anyone builds rather than discovered after:

**How much do the terminal's own affordances matter?** Owning the surface loses,
at minimum:

| Lost | Why it cannot be cheaply replaced |
|---|---|
| Slash commands (`/login`, `/config`, `/model`, `/permissions`, `/mcp`) | They open interactive dialogs and **silently no-op** headless. The studio had to intercept them — 106 lines — because forwarding them looks broken |
| `@file` references, image paste | TUI input features, not stream features |
| ctrl-C interrupt, plan mode, the TUI's scrollback | Ours to rebuild, each one |
| Anthropic's future work on that TUI | Whatever they ship next, we would not get |

That list is the real cost of the idea. It is a producer judgement, not a
technical one.

## Shape, and how long

A day or two. One throwaway command, one scratch webview, one spawn wrapper. The
deliverable is a writeup — `.rptc/research/own-the-chat-surface/spike.md` — with
the four measurements answered, the flags that worked recorded verbatim, and a
recommendation.

**Redact before committing it.** `.rptc/` is tracked and this repo is PUBLIC: no
absolute home paths, no session ids, no colleague names, no internal endpoints
quoted out of a stream.

## Done when

Four measurements have answers, the owner has been asked the affordance question,
and the decision is either "build it" with a scope, or "no" with a reason that
will still make sense in three months.
