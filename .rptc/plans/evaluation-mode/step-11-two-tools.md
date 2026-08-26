# Step 11 — Two tools: one narrates, one analyses

**Ships:** the trace split into the two surfaces its two jobs actually need — an
**Activity** view that narrates what the agent is doing while you work, and a
**Prompt Workbench** that helps you write a better prompt.
**Depends on:** step 10, whose renderer, vocabulary and doors all survive.
**Decided by the owner 2026-08-25**, in the exchange that produced this file.

## Priority, stated by the owner 2026-08-26 — build Activity FIRST

> *"The most important thing I wanted was number one. I'm sick and tired of not
> knowing what was happening when they ran a prompt."*

**Activity is the feature. The Workbench is the follow-on.** This step was
drafted with them as equal halves and that was wrong twice over:

- **Visibility is what was asked for**, and it is also the closest to done —
  `AgentTraceView` already renders phase bands in plain English with the waste
  flagged. What is missing is only WHERE IT LIVES and UPDATING AS IT GOES.
- **The Workbench's value is unproven**, and the owner said so plainly: *"what's
  really unknown for me is whether the advice panel will be genuinely useful or
  frustrating."*

**So Activity is also the EXPERIMENT that de-risks the Workbench.** It shows a
producer "11 steps — 3 were repeats" and offers to help. If nobody clicks that,
the advice panel answers a question nobody is asking, and that was learned for
the price of a link. If they click it constantly, we know what they wanted when
they arrived — which is a far better basis for a layout than a guess.

Build Activity. Watch the link. Then design the Workbench with evidence.

## The sentence this whole step comes from

> *"I still think the trace of a prompt through the system is valuable
> information that should be visible to the end user as they work with the AI.
> It narrates what's happening and it also points out potential opportunities for
> improvement."* — owner

Read it twice and it names **two jobs**, not one:

- **Narrating** is something you want WHILE you work. Chronological, plain
  English, following along. No editing, no cost, nothing to decide.
- **Spotting opportunities** is something you act on AFTERWARDS, deliberately, by
  rewriting a prompt and running it again to see if the number moved.

They want opposite layouts. Narration wants the CHAT shape — history in order,
newest last. Analysis wants the ARTIFACT shape — the thing you are editing on
top, with a verdict under it.

## What step 10 got wrong, stated plainly so it is not repeated

Step 10 applied the chat shape to BOTH, and the workbench came out as a
conversation viewer: the prompt quoted read-only, a large transcript, the reply,
the numbers, and the input parked in a footer "the way a chat reads".

The owner's correction: **"The goal of the workbench is prompt analysis. Help me
write the best prompt possible to get the builder to do what I want as
efficiently as possible."** Against that goal the shipped shape puts the wrong
things first — the loudest line is "Nothing was changed", which is the PREMISE of
the surface rather than a result, and the artifact under work is in the footer.

**Nothing about the narration was wrong.** The phases, the authored phrases, the
`Simulate` vocabulary, the doors — those were right and they stay. What was wrong
is the frame around them, on ONE of the two surfaces.

## Tool 1 — Activity: what the agent is doing

**Shape: the conversation.** This is where step 10's reading is correct and
should not be touched.

- Phase bands in time order, in the tool's own authored words.
- No cost, and the honest line about why (we do not own the chat's process).
- No prompt, no composer, nothing to edit. It is a READ.
- **It spots opportunities and hands them off** — when it sees waste ("It looked
  up which project you meant 3 times"), it offers a route into the Workbench with
  that observation attached. Noticing is Activity's job; fixing is not.

**It must be visible WHILE you work**, which it is not today — it lives behind a
tab in a panel you have to go and open. That is the half of the owner's sentence
the current build does not satisfy at all.

### Where it lives: a BOTTOM PANEL view — settled 2026-08-26

Beside Problems, Output and Terminal.

```
┌──────────┬────────────────────────────────────────────────┐
│  AI      │  [Project Dashboard] [Claude] [Workbench]      │
│ ┌──────┐ │  ┌──────────────────────────────────────────┐  │
│ │ Chat │ │  │ > set up Bodea with B2B                  │  │
│ └──────┘ │  │ Demo Builder · Deploying the API mesh…   │  │  editor
│ ┌──────┐ │  │ Done — the mesh is deployed.             │  │  group
│ │Prompts│ │  └──────────────────────────────────────────┘  │
│ └──────┘ │                                                │
│ ┌──────┐ ├────────────────────────────────────────────────┤
│ │Workb.│ │  ACTIVITY    Problems  Output  Terminal        │
│ └──────┘ │  ✓ Checking which project is open   2 · 1s     │  panel
│          │  ✓ Checking the API mesh            3 · 4s     │  ~200px
│          │  11 steps — 3 were repeats   Improve this ask →│
└──────────┴────────────────────────────────────────────────┘
```

**Why the bottom panel and not the alternatives**, each rejected for a concrete
reason rather than by taste:

| Placement | Rejected because |
|---|---|
| **Editor tab, split beside the terminal** | The Claude terminal is a tab in the ACTIVE EDITOR GROUP (`openInClaude.ts:246`, `ViewColumn.Active`, "chat-first"). Splitting halves its WIDTH, and Claude Code's output wraps badly in a narrow column. Width is the one thing the chat cannot spare |
| **Secondary sidebar (right)** | Off by default. A surface nobody knows exists cannot be the thing that starts the loop |
| **Primary sidebar, under the tiles** | Already on screen, which is genuinely attractive — but ~300px wide turns every band into two wrapped lines, and it converts a tidy launcher into a scrolling feed |

The bottom panel costs **height, not width**, so the conversation stays
full-width. It is also the region VS Code has already taught everyone means
"ambient status you glance at" — Problems, Output, Debug Console all live there,
so this teaches no new location.

### What is reused, and what is actually new

**The thing you look at already exists.** `AgentTraceView` renders the bands
today; it is just trapped inside an editor tab behind a mode toggle.

| Piece | Status |
|---|---|
| Trace content — bands, plain English, waste flags (`AgentTraceView.tsx`) | REUSED unchanged |
| Renderer (`Transcript.tsx`, `transcriptPhases.ts`, `workbench.css`) | REUSED unchanged |
| Data (`toolTraceRecorder`, `agentTraceReport`, `get-agent-trace`) | REUSED unchanged |
| Hosting pattern — `SidebarProvider implements vscode.WebviewViewProvider` | REUSED as the model |

New, and all of it small:

1. **A panel view container**, declared in `package.json`. Today there is exactly
   one container and it is on the activity bar:

   ```jsonc
   "viewsContainers": {
     "activitybar": [ { "id": "demoBuilder", … } ],
     "panel":       [ { "id": "demoBuilderActivity", "title": "Activity", … } ]
   },
   "views": {
     "demoBuilder":         [ { "id": "demoBuilder.sidebar",  "type": "webview" } ],
     "demoBuilderActivity": [ { "id": "demoBuilder.activity", "type": "webview" } ]
   }
   ```

   That declaration is what makes it a bottom-panel tab. VS Code owns the
   docking, resizing, collapsing and per-workspace persistence — none of that is
   ours to write.

2. **An `ActivityProvider implements vscode.WebviewViewProvider`**, modelled on
   `SidebarProvider`: resolve the view, set the HTML, register the handler map.
   It serves the `get-agent-trace` handler that already exists.

3. **A bundle entry** rendering `<AgentTraceView />`, the same three lines as the
   evaluation bundle's `index.tsx`.

### What changes about what exists

- **The Workbench loses its trace tab.** Today it is one editor tab with two
  modes; after this it is the prompt tool only. That IS the two-tools split
  arriving — one surface, one job — and the mode toggle goes with it.
- **`demoBuilder.showAgentTrace` stops opening an editor tab** and instead
  reveals the panel view. VS Code generates `demoBuilder.activity.focus` from the
  view id, so this is a one-line change, not a new command.
- **`WorkbenchMode` and the `workbench-open` push lose their `mode` field.** With
  one mode left there is nothing to switch, and an enum with one member is the
  accepted-but-ignored shape this project deletes rather than keeps.

### Making it live — the real work in this half

`AgentTraceView` fetches on mount and on a Refresh button. A panel you GLANCE at
while working has to update as calls land, or it is a stale list with a button on
it. The recorder already writes continuously in the extension host and the
webview already listens for pushes; what is missing is the push.

The parent overview has carried this as "hours, not days" since 2026-08-25, and
the parked chat decision named it as **the one missing piece** — the cheap fix
whose absence is the only thing that would justify revisiting owning the chat.

### Turning it on and off

Three levels, all wanted:

- **Automatic, once.** Clicking **Chat** opens the terminal AND reveals Activity,
  so one click arranges the workspace. It must **never steal focus** — the cursor
  stays in the terminal, ready to type. Reveal on the FIRST chat launch per
  workspace only; intrusive once, never again.
- **Manual, always.** It is an ordinary panel tab: click away to Problems,
  `Cmd+J` to collapse the region, drag it shorter. All existing muscle memory.
- **Sticky.** VS Code persists panel visibility per workspace. Close it and it
  stays closed; we do not fight the producer every session.

**And when it is closed, the hand-off moment is simply lost.** No toast, no
notification, no nagging — deliberately. This feature helps people who keep the
panel open, and that is the deal the parked chat decision already accepted. It is
also the thing to watch: if producers close it and the loop never starts, that is
the evidence that would revive the spike.

## Tool 2 — Prompt Workbench: make this prompt better

**Shape: the artifact on top.** You are editing a draft, and the surface should
look like it. The canonical layout is under "The layout" below — this section is
the WHY, that one is the WHAT.

1. **The prompt goes on top and stays editable.** In a chat the input is at the
   bottom because history scrolls up; on a workbench the artifact is at the top
   because you are working ON it.
2. **The verdict sits directly under it**, and it leads with what is WASTED —
   see the metric section: waste is the actionable, stable number, and it is what
   converts into the tokens a producer is losing.
3. **The suggestion comes BEFORE the trace.** The advice is the product; the
   trace is the receipt. Step 10 had this backwards.
4. **The reply is reframed as "it understood you as…".** Not "here is the chat" —
   a COMPREHENSION CHECK. If the agent misread the ask, that is a prompt defect
   the producer can fix, which is the only reason this field earns space. It sits
   inside the disclosure, because it is a check you make when suspicious.
5. **Attempts become visible**, as a six-character history in the prompt's own
   frame. Iteration IS the feature and today you cannot see you are on your third
   try. The data already exists — threads, and the cheapest run kept deliberately
   against eviction — so this is rendering, not plumbing.

**"Nothing was changed" demotes** from headline to a quiet line beside the
actions, where it does its real job: reassuring someone immediately before the
one button that is not simulated.

## The metric changes: tokens, not dollars

**Owner decision 2026-08-26, and it REVERSES a decision written in five places.**
Every one of them says the same thing — *"Report cost in DOLLARS. '$0.21' means
something to a demo builder; '47,550 tokens' does not."* That was reasoned from
what is legible. The reversal is reasoned from what is SCARCE:

> **Dollars measure OUR cost. Tokens measure the producer's remaining ability to
> work.** They are not paying per run; they are on a quota, and when it is gone
> they lose access to the AI mid-task. Seven cents is not a motivator. Losing the
> afternoon is.

### The measurement that changed the story (2026-08-26)

A trivial probe — `claude -p "Reply with exactly: pong"` — returned:

| Field | Tokens |
|---|---|
| `input_tokens` | 10 |
| `output_tokens` | 43 |
| `cache_creation_input_tokens` | 15,626 |
| `cache_read_input_tokens` | 18,140 |
| **total** | **33,819** |

**Thirty-four thousand tokens to say "pong", of which the producer's own words
were ten.** Context — system prompt, tool definitions, AGENTS.md, skills —
is 99.9% of the spend.

So the story this feature had been telling is **false**: *"write a tighter prompt,
spend fewer tokens"* saves nothing measurable. Shortening wording is not the
lever.

**The real lever is ROUND TRIPS.** Every extra turn re-reads the whole context —
18,140 tokens in that probe just to re-read what the model already had. A prompt
that takes eleven steps instead of eight does not cost three steps; it costs
three full re-reads of everything.

That is why "name the project" is good advice — **not because it is shorter, but
because it deletes a round trip.** The advice was right for the wrong reason, and
now the surface can say the right one.

### So: wasted steps lead, tokens are the consequence

Steps and wasted steps are STRUCTURAL and stable. Tokens are what the producer
actually loses. The headline pairs them:

    3 steps wasted — about 54k tokens, and again every run.

### Token deltas must be suppressed when cache state differs

**Non-negotiable, and it is a correctness rule, not a polish one.** The battery
measured the same prompt swinging **55,236 → 8,959** on cache state alone, and two
runs with near-identical token counts costing $0.34 and $0.11. A delta that is
really cache luck teaches the producer something false about their own wording,
which is worse than showing nothing.

`cache_read_input_tokens` and `cache_creation_input_tokens` come back on every
run, so the two states are distinguishable. **Steps and time always get a delta;
tokens only when the runs are comparable.** Otherwise say so.

## The layout, and the editorial rule that produced it

**One sentence says how it went, one says what to do, one quiet row carries the
numbers, and everything else is behind a disclosure.**

A bad run:

```
┌─ attempt 1 ──────────────────────────────────────────┐
│ Set up Bodea with B2B                                │
└──────────────────────────────────────────────────────┘
                                            [ Simulate ]

  3 steps wasted — about 54k tokens, and again every run.
  → Name the project. It looked up which one you meant 3 times.  [Add]

  11 steps · 74s · ~204k tokens                    What it did ▸

  Nothing was changed.        [ Save ]  [ Run for real in the chat ]
```

A good one, two attempts later:

```
┌─ attempt 3 ───────────────────────────── 11 → 9 → 8 ─┐
│ Set up Bodea with B2B for bodea                      │
└──────────────────────────────────────────────────────┘
                                            [ Simulate ]

  Nothing wasted. Down from 3.

  8 steps ↓3 · 41s ↓33s · ~150k tokens             What it did ▸

  Nothing was changed.        [ Save ]  [ Run for real in the chat ]
```

Five moves, each collapsing something that had grown its own block:

1. **The verdict is a SENTENCE, not a stat block.** One line does what a
   headline, a sub-line and a token explanation were fighting over.
2. **The attempt history is six characters** — `11 → 9 → 8`, inside the prompt's
   own frame, because it is a version history OF that prompt. No strip, no
   section, and the trend is legible without being read.
3. **ONE disclosure holds everything diagnostic** — the trace, the blocked
   writes, and "it understood you as…". All three are checks you make when
   suspicious, not things you read every run.
4. **The suggestion is the verdict's second line**, indented with `→` and
   carrying its evidence inline. There is usually one, and it is the point; a
   titled section was overhead.
5. **Absolute tokens are third in the quiet row, rounded, with a `~`.** Never the
   headline: ~150k is a big number that is 99% not the producer's fault, and
   leading with it reads as "this tool is expensive". Rounding matters too —
   five digits claims an accuracy the cache swing does not support.

**Show the total, do not hide it.** It is their quota; withholding the one number
that explains why they ran out is worse than showing a large one.

> **CORRECTED 2026-08-26 by the chat-surface spike.** This paragraph used to end
> "there is no honest relative form — the CLI's JSON carries no quota or limit
> field, so '3% of your allowance' cannot be computed and must not be invented."
> **That is wrong.** The CLI emits a `rate_limit_event` carrying
> `utilization`, `resetsAt` and both windows (`five_hour`, `seven_day`) — a live
> run reported `seven_day: 0.85`. It was missed because it is **streaming-only**:
> it does not appear in `--output-format json`, which is the shape
> `promptEvaluationService` reads.
>
> This matters more than a correction. The whole argument for tokens over dollars
> is that **the quota runs out and the producer loses access**. "You are at 85% of
> your weekly limit, resetting Thursday" turns that from an abstraction into a
> number they can act on. Reaching it means consuming the stream.
> Record: `.rptc/research/own-the-chat-surface/spike.md`.

## The hand-off: the Workbench opens with YOUR words in it

Activity sees tool calls. It does NOT see what the producer typed — `TraceEntry`
holds `tool`, `argumentKeys`, a one-way hash of the VALUES, bytes, duration and
outcome, and nothing else. We do not own the terminal process either. So
"Improve this ask" has no prompt to hand over, which breaks the loop at the exact
moment it is supposed to start.

**Settled 2026-08-26: read it from Claude Code's own transcript.**
`~/.claude/projects/**/*.jsonl` holds every user message — that is how the
48-session survey was derived — so the producer's last ask is recoverable from
disk.

**The property this buys, and the ONLY reason to do it: the producer never
retypes.** The alternative (open the box empty and ask them to write it again)
loses most people at the one moment we are asking for effort, and the loop dies
there.

Two objections, both real and both answered:

- **It couples us to an undocumented file format.** Accepted, and bounded: a
  failure to parse means no offer, never a wrong offer.
- **It contradicts a written decision** — *"there is deliberately no transcript
  parser here; duplicating `scripts/trace/transcript.mjs` inside `src/` is the
  thing this repo fixes rather than files."* That decision was about getting COST
  out of transcripts, and cost has a better source (the CLI's own JSON). Prompts
  do not. The reasoning does not transfer, so this is a judgement rather than a
  rule being broken — recorded here so the next reader sees it was considered.

Three things the story demands, all about trust rather than mechanism:

1. **It must be THEIR words.** With two chats open we could attribute the wrong
   one, and a sentence the producer never wrote destroys confidence in the whole
   panel. **Check before building:** does the newest transcript for a project
   reliably correspond to the terminal they are looking at? Cheap to test against
   real sessions, and it decides whether this is viable at all.
2. **The offer appears ONLY when we have them.** An "Improve this ask" that opens
   an empty box teaches the producer the button is a lie.
3. **Say where the words came from** — "from your chat, 2 minutes ago". Quoting
   someone's sentence back without saying how you got it is unsettling even on
   their own machine, and the line doubles as a check that we grabbed the right
   thing.

**When we are not sure, stay silent.** No offer on that run. The entire value is
not retyping; an offer that lands in an empty box is worse than no offer.

## Deferred until it can be measured: the payback line

This was designed and **held back by the owner (2026-08-26)**:

```
  Tuning cost ~430k · saves ~54k a run · worth it after 8 uses
```

It is the best idea in the design and the least proven. It gives a producer a
STOPPING RULE — nothing else here tells them when to quit refining, which is
exactly what someone watching a quota deplete would ask. It also justifies the
Prompt Library, since the payback only lands if the prompt is saved and reused.

**But `54k` is arithmetic from ONE probe, not a measurement.** Shipping a
fabricated payback would undermine the honesty the rest of the panel is built on.

**Its gate:** the battery measures the real per-round-trip cost. That is the
first concrete job for `measurement/`, and it is small — the number is the
difference between an n-step and an (n+1)-step run of the same prompt, at matched
cache state. Add the line when the number is real.

## What is NOT in this step

- **The ambient dry-run switch.** It is a different feature: it makes your
  ORDINARY chat safe, and it does not help you write a prompt. It has its own
  open design question (recorded in the overview) and must not be attached to
  either of these tools on the way past.
- **Making Activity live.** Placement first; a live feed into a surface nobody
  can see is wasted work.

## What survives from step 10 — do NOT rebuild these

| Piece | Status |
|---|---|
| `transcriptPhases.ts` — grouping, authored phrases, spans | Unchanged. Both tools use it |
| `Transcript.tsx` — bands, steps, speaker turns | Unchanged. Activity uses the bands; the Workbench uses them under "WHAT IT DID" |
| `workbench.css` — the left rule, the quiet hierarchy, tabular numerals | Unchanged, and it is what makes both readable |
| The `Simulate` vocabulary | Unchanged, everywhere |
| The doors — sidebar tile, `Open in workbench` on a prompt card | Unchanged |
| `usePromptThread` — threads, resume, fork, save | Unchanged; attempts render FROM it |
| Capturing the run's reply | Unchanged; it is reframed in the UI, not re-fetched |

## Tests

- The Workbench renders the prompt ABOVE the verdict, and it is editable there.
- The verdict leads with WASTED STEPS and their token consequence, not with cost
  and not with "Nothing was changed".
- Steps and time always show a delta; the token delta is SUPPRESSED when the two
  runs' cache states differ, and says so.
- Absolute tokens are rounded and never the headline.
- The attempt history renders in the prompt's frame (`11 → 9 → 8`).
- The trace, the blocked writes and the reply are all behind ONE disclosure.
- The suggestion renders as the verdict's second line, carrying its evidence.
- No payback line until the per-round-trip cost is measured.

Activity:

- The panel view registers, and `demoBuilder.showAgentTrace` reveals it rather
  than opening an editor tab.
- The Workbench renders NO trace tab and no mode toggle — one surface, one job.
- Activity renders no prompt, no composer, no cost (the existing pins, kept).
- A call landing while the view is open updates it without a Refresh press.
- Clicking Chat reveals the panel on the FIRST launch in a workspace and not
  afterwards, and never takes focus from the terminal.
- Nothing pops up when the panel is closed — asserted, because "helpfully"
  adding a toast later is exactly how this becomes nagging.
- Activity renders no prompt, no composer, no cost — the existing pins, kept.
- Activity offers a route into the Workbench when it has waste to report, and
  that route carries the observation.
- "Run this for real" keeps its distinct wording and styling (existing test).

## Done when

A producer with a prompt that costs too much can see WHY on the Activity view
while they work, click through to the Workbench, rewrite, simulate, and watch the
number fall — with the attempts visible so they can go back to the best one.
