# Spike — should Demo Builder render its own chat?

**Status: SPIKE RUN 2026-08-26.** The owner reopened the decision and the spike
executed. **All four unknowns are answered — see
`.rptc/research/own-the-chat-surface/spike.md`.** Three pass outright; the fourth
confirms that our tools must be pre-trusted at the permission card or a producer
is asked twice.

The owner then asked for everything spikeable, and eleven findings came back.
**Three of the four cost items were overstated and one capability set was
undercounted:**

- **Slash commands mostly WORK.** `/model` reads AND sets, `/cost`, `/context`,
  `/clear`, `/mcp`, `/compact`, `/doctor` all function; the five that do not
  answer one clear sentence rather than silently no-op. `/login` is the only
  serious loss.
- **Interrupt works** — acknowledged, and it aborts the turn.
- **`set_model` and `set_permission_mode` work at RUNTIME**, so a model picker and
  a mode switch are ours to build natively.
- **`initialize` returns a whole client's metadata** — 48 commands with
  descriptions, 5 models with display names, agents, output styles, the account's
  plan, the current permission mode.
- **Permission cards are effect-based and QUIET** — reads and in-cwd Bash pass
  free; only writes and out-of-cwd paths card.
- **The stream shows EVERY tool call**, carded or not — which is what would make
  an agent reaching for `curl` visible.
- Plus `permission_suggestions` (a card's buttons, pre-computed) and
  `rate_limit_event` (quota utilisation — the number step 11 rests on, and which
  that step wrongly recorded as uncomputable).

**The risk moved from "can we?" to "should we build on an undocumented API?"**
`--permission-prompt-tool` is absent from `claude --help`, and the control
protocol around it is undocumented. That is the standing cost now, not
feasibility.

**Still not decided.** The spike answered feasibility; the cost is the terminal's
own affordances, and that remains the owner's judgement. The original parking
note follows, unchanged.

---

**Status: PARKED 2026-08-25, the day it was written.** Do not run it without
re-opening the decision below.

The owner read it and chose the smaller path instead: **keep Claude Code's
terminal, keep narrating into it, and render anything we want to control in a
companion panel beside it.** Most of that was already built — narration ships,
the workbench renders evaluation runs, and the trace mode renders ordinary chat
activity. The only piece missing is making that panel update live rather than on
refresh, which is hours of work against this spike's day or two plus a permanent
second chat to maintain.

A setting to pick between two chats was considered and rejected in the same
conversation: it does not halve the work, it doubles what has to stay correct,
and whichever surface is not the default stops being tested.

### What parking this costs, stated plainly

One thing, and it is the spike's strongest argument: **a permission prompt for
tools that are not ours.** Claude Code's own checks are off by owner decision
(the interruption cost is real), so nothing asks before an agent runs a shell
command.

A shell guard was considered on 2026-08-25 and **declined on evidence**:

- The 37-session survey (`.rptc/backlog/2026-08-25-agents-barely-use-the-tool-surface.md`)
  found the work in these projects is Commerce consulting — query shapes, Postman
  collections, catalog questions. No destructive shell in the sample.
- Every irreversible action here is REMOTE — delete repo, delete Console project,
  wipe DA.live, unpublish, reset — and all fifteen already stop and ask through
  `agentAlertCopy.ts`. The guard would cover the recoverable half.
- Nothing in the fifteen generated skills instructs a destructive command. The
  only shell command any of them names is `npm run dev`.
- A local mistake costs a checkout and an `.env`; code is on GitHub, content on
  DA.live, and the project rebuilds.

**The one shape still worth a rule** is a force-push or hard reset over unpushed
work — plausible, genuinely unrecoverable, and it has already caused one alarm
(investigated, disproven). If anything is built, build that narrow rule as a
`PreToolUse` hook, not a general guard. We already ship such a hook for three
commerce tools, so the mechanism is proven and stays native.

### What would revive this spike

- A real incident where nothing asked and something was lost.
- Producers saying the terminal's rendering is blocking them, after the live
  panel exists — i.e. the cheap fix was tried and was not enough.
- Anthropic making the stream a supported embedding path, which would cut the
  standing maintenance cost that made this expensive.

---

*Original plan below, unchanged. It is still the right plan if the decision
reopens.*

**Written:** 2026-08-25, immediately after the three Evaluation Mode holes
closed.

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
