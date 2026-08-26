# Evaluation Mode

Simulate a prompt, see what it *would* do and what it would cost, refine it,
and only then run it for real.

## Why it exists

A producer asks an agent for something, watches tool calls scroll past, and four
minutes later something has happened. If it did the wrong thing they find out
afterwards. If it was slow they have no idea why. And the extension team has no
way to tell whether a change to the tool surface helped agents or hurt them.

Evaluation Mode answers both: what would this prompt do, and is that getting
better.

## Using it

The **Prompt Workbench** opens from the sidebar — **Prompts ⌄ → Prompt
workbench** — or from **Demo Builder: Prompt Workbench** in the palette. Type
what you would normally ask, press **Simulate**, and it reads back like a chat:

```
You
Set up Bodea with B2B

✓  Checking which project is open      2 steps · 1s
✓  Checking the API mesh               3 steps · 4s
⊘  Deploying the API mesh              1 step · 2s · simulated — nothing changed

Claude
I would deploy the mesh, then add the B2B package and republish…

───────────────────────────────────────────
Nothing was changed.
8 steps, $0.24 down from $0.31, 41s, 3 wasted.
```

Every step is the tool's own **authored phrase** from `toolNarration.ts`, never
its name; the raw name and its argument names are there when you open a band.
Consecutive calls to one tool fold into a single band, and a band says whether
anything failed or was simulated **without being opened**, because that is what
a person scans for.

Below the numbers: which steps were wasted, and suggestions carrying the trace
fact behind each — *"It looked up which project you meant 3 times."* Mechanical
fixes apply with a click, and a second run reports the delta. When the prompt is
right, one deliberately different button hands it to the chat to run for real,
and another saves it to the Prompt Library.

The composer sits at the BOTTOM, one box, the way a chat is laid out. The
workbench used to open as a form — a picker, a labelled text area, a row of
buttons, and output somewhere below — and read like a log for it.

Come back tomorrow and pick that saved prompt straight back up: **Open in
workbench** on its card in the Prompt Library loads it and **resumes its
history**, so the next result compares against the version you were happy with.
"Start fresh instead" in the line under the composer forks a new thread from the
same words, for when you want a clean comparison on purpose.

**The workbench has no picker of its own, deliberately.** Each surface does one
thing: the **library PICKS**, the **terminal RUNS**, the **workbench MEASURES**.
A saved-prompt dropdown inside the workbench duplicated the library's entire job
and was removed; the library's card now has two destinations instead — clicking
it launches the prompt in the terminal, and its kebab's "Open in workbench"
sends it here.

An agent can do the same on your behalf: *"evaluate this prompt"* reaches the
`evaluate_prompt` tool, which answers a summary rather than the whole trace.

There is also **Demo Builder: Toggle Agent Dry Run**, which puts your ORDINARY
chat into dry run — every change simulated — until you turn it off. While it is
on, "Agent dry run" sits in the status bar, because a mode you cannot see is a
trap.

**Demo Builder: Show What The Agent Just Did** answers the other half: it opens
the workbench on its trace mode, listing every tool call this window has seen,
with the failures, blocked writes, repeats and slow calls pulled out. Copy it or
save it to a file. **It shows no cost, and says so** — see below.

## How it works

Six pieces, each with one job.

### 1. The gate — mutation becomes impossible

`inExtensionMcpServer.ts` checks, before every tool call, whether this server is
in a dry run. If it is, any tool that is not read-only is stopped **before its
handler** and answers what it WOULD have done: the tool name and its argument
KEYS, never values.

Four properties are load-bearing:

- **It answers DATA, not an error.** An error teaches an agent to retry; data
  lets it keep going, so the rest of the path still gets measured.
- **It runs BEFORE consent.** A `confirm: true` call is stopped by the dry run
  and raises no dialog — approving something that will not happen is worse than
  not asking.
- **Reads pass through.** A dry run that also blinds the agent measures a path
  nobody would take.
- **It fails closed.** A tool that does not declare itself is treated as a write.

### 2. Tools declare what they are

The gate reads each tool's own `annotations.readOnlyHint` (descriptor rows spell
it `readOnly`, which the compiler requires). It used to be a regex over the tool
NAME, which cannot express "called `check_` and writes anyway" — `check_github_app`
is exactly that, and the guard holding it closed had to be found by a hand audit.

Annotations also reach the client in `tools/list`, so Claude Code learns which of
our tools are safe.

Full rules for adding a tool: `mcp-tool-authoring`.

### 3. The recorder — what actually happened

`toolTraceRecorder.ts` records every call on both registration paths: name,
argument keys, response size, duration, outcome, and whether the dry run blocked
it. **Reads are recorded exactly like writes** — every measured win so far has
been a read.

Each entry also carries a one-way hash of the argument VALUES. Argument names
alone cannot tell "asked about project A, then B" from "asked about A twice", and
only the second is waste. Values cannot be kept because arguments carry secrets,
so the hash gives repetition-detection without retaining anything readable.

It is a ring buffer of 500 in memory. No file, and it dies with the window.

### 4. The runner — one implementation, three doors

`promptEvaluationService.ts` spawns a headless `claude -p --output-format json`
and joins the CLI's own cost figures with the trace recorded while it ran. Two
halves answering different questions: the JSON says what it COST, the trace says
what it DID.

It also captures the run's **`result`** — the agent's own final message (verified
2026-08-25 against the CLI, which answers a top-level `result` string beside the
cost fields). That is what turns the workbench from a log of tool calls into a
conversation: the phases say what it did, the reply says what it would tell you.
It is deliberately NOT in `summariseForAgent` — unbounded prose, and an agent
that asked how a prompt performed wants the numbers.

Reached by the agent (`evaluate_prompt`), by a command, and by the workbench —
all through this one service, so the paths cannot drift.

Cost is reported in **dollars**. "$0.21" means something to a demo builder;
"47,550 tokens" does not.

**REVERSED 2026-08-26, not yet implemented (step 11).** The metric becomes
TOKENS: dollars measure our cost, tokens measure the producer's remaining ability
to work — they are on a quota, and losing it costs them the afternoon. A probe
also killed the premise behind the dollars line: 33,819 tokens to answer "pong",
of which the producer's words were 10. Wording is not the lever; ROUND TRIPS are,
because every extra turn re-reads the whole context. The headline becomes wasted
steps with their token consequence. See
`.rptc/plans/evaluation-mode/step-11-two-tools.md`.

### 5. History — "better" survives a reload, and survives an EDIT

Each evaluation stores five numbers against the project: cost, steps, wasted
steps, duration, and when — plus the prompt as it was run.

**Keyed by the THREAD, not the prompt text.** A thread is one piece of work:
"getting this prompt right". The first shipped version keyed on the text, which
broke the feature during the loop it was built for — improve a word and the
prompt had no past, so "down from $0.24" appeared only when re-running something
unchanged, the one case where nothing had improved.

Threads are DECLARED, never inferred. The workbench starts one on the first run,
keeps it while the producer edits and re-runs, resumes one when a saved prompt is
loaded, and forks a new one on "Start fresh". No similarity scoring: a producer
has to be able to say why two runs belong together.

Kept in `.demo-builder.json` under `Project.evaluationHistory`, matching the rule
`aiPrompts` already set — project-specific in the manifest, global in extension
state. History written before threads existed is migrated on first read: each
distinct prompt text becomes a thread of its own, which is lossless and needs no
decision.

**Bounded on two axes, and the first version got this wrong.** Ten runs PER
THREAD, and twenty-five threads tracked. A single global cap evicts by recency
across all prompts, so a producer alternating between five would keep four runs
of each and lose a trend to runs that had nothing to do with it — silently, since
an evicted history is indistinguishable from a prompt never run. When the thread
cap is reached the least recently run thread is dropped WHOLE: one surviving run
is not comparable against anything, so a stump costs bytes and buys nothing.

One refinement on top of pure recency: **the cheapest run is kept even when it
is the oldest.** That is the version a producer would come back for, and each run
stores its own text, so "go back to the cheapest wording" is a link rather than
an archaeology exercise. Evicting it for age would remove the reason to keep
history at all.

**There is deliberately no preference for prompts saved to the library.** One was
built and removed the same day (2026-08-25): it needed both prompt stores read
and threaded into the eviction, reaching across a feature boundary to do it, and
it could only change WHICH thread fell off past twenty-five. Real machinery,
invisible result — the owner called it correctly. If it returns it needs a
producer who noticed its absence.

Age is deliberately NOT an axis. A prompt untouched for three months is not worth
less than one untouched for three weeks, and time-based expiry would delete
somebody's best prompt over a holiday.

Worst case on disk is about 50KB per project, which is why the caps can be
generous.

**Not the trace.** That is the diagnostic read once, it is large, and keeping it
would recreate the unbounded-log concern the in-memory recorder was capped to
avoid.

Two rules that are easy to get subtly wrong, both pinned by tests: the past is
looked up BEFORE the new run is appended (otherwise a run finds itself and every
delta reads as zero), and a thread with no past reports NO delta rather than a
delta of zero — "no change" and "never run before" are different facts.

Two windows evaluating the same project can lose a run to last-writer-wins:
`saveProject` serialises writes but does not merge. Accepted rather than
discovered — evaluations are slow and deliberate, and a producer does not run the
same prompt from two windows at once.

A failed save never fails the evaluation. Losing a real result to a bookkeeping
problem would be the worse outcome.

### 6. The workbench — the loop

A webview (`features/ai/evaluation/ui/`) showing the transcript, the verdict, the
waste, and what was blocked. Running for real and saving to the library reuse the
Prompt Library's own handlers rather than reimplementing them.

**The transcript is `Transcript.tsx` over `transcriptPhases.ts`, and both views
share it.** The grouping and the words are pure and live in
`transcriptPhases.ts`, so the rules are testable without a panel:

- A **phase** is a run of consecutive calls to the SAME tool. That is the
  strictest useful rule, and it is chosen because it makes the label
  unimpeachable — every call in the band is the call the phrase describes.
  Category-level grouping would need a second vocabulary of phase labels that
  nobody has authored; the reference (`tech-case-studio`'s
  `transcript-groups.ts`) records that exact gap as its own worst failure.
- The label is `narrationFor(tool)` and **never derived from the tool's name**.
  `toolNarration.ts` exists to remove that derivation; a tool with no authored
  phrase gets a visibly generic "Working" instead, and `toolNarration.test.ts`
  asserts every registered tool has one, so it is defensive rather than expected.
- A band says failed / simulated **collapsed**. "Did something go wrong" is what
  a producer scans for, and opening eleven bands to find out is not scanning.
- A phase spans first-call START to last-call END, so four fast calls spread over
  a second read as the second of waiting they were.

It is also where a thread is DECLARED, because it is the only surface that knows
which one this is. `usePromptThread` owns that state:

- **A prompt handed over** by the library's "Open in workbench" loads its text
  and resumes whatever runs it has here, so the next result compares against the
  version the producer was happy with. A saved prompt with no runs here is
  normal, not an error. It arrives with the init payload on a first open and as a
  `workbench-open` push when the panel is already there.
- **The workbench has NO picker of its own.** One was built and removed
  (2026-08-25): it duplicated the Prompt Library's entire job — a second, worse
  picker beside the one that already works — and it went in because the workbench
  was designed as if the library did not exist.
- **Start fresh** keeps the words and drops the past — a fork. Without it the
  only way to start clean is to retype from memory, which is how history got lost
  before threads existed.
- **Save to library** sends a real `AiPrompt` and then stamps the runs ALREADY in
  the thread with its id (`anchor-evaluation-thread`). Saving happens after the
  refining, so anchoring only future runs would leave the thread unreachable from
  the library until it was run again.

Suggestions are given the prompt as well as the trace, so advice already taken is
not offered again — the workbench used to tell producers to name the project in a
prompt that already named it.

### 7. The trace mode — what the agent already did

With the dry run on, chatting normally gave a producer the safety and none of the
visibility: nothing changed, and there was no trace and no cost. Every one of
those calls was already being recorded — `extension.ts` hands the main server the
same recorder — and the only thing that ever read it was a workbench run. The
data existed and nothing showed it.

`agentTraceReport.ts` shapes the recorder's contents; `agentTraceHandlers.ts`
serves them; `AgentTraceView.tsx` renders them as the workbench's second mode.
Two commands, one panel — the opening arrives with the init payload on a first
open and as a `workbench-open` push when the panel is already there.

**Same phase bands, and deliberately nothing else the workbench has.** It renders
`TranscriptPhases` from the shared `Transcript.tsx`, so the two views cannot
drift on how a tool call reads. It has no "You"/"Claude" turns, because the
extension does not own the chat's process: there is no prompt to quote and no
reply to show, and growing them here would mean inventing them. `SpeakerTurn` is
a separate export the ambient view never calls, precisely so the two cannot
quietly converge into one surface implying we know more than we do.

Three things the surface has to say out loud, because all three are surprising:

- **No cost, and no estimate.** It comes from a run's own JSON output and the
  extension does not own the chat's process. A per-call guess would be a number
  that looks authoritative and is not, in a feature whose entire purpose is
  replacing guesses with measurements. What would close it honestly is the
  OpenTelemetry metrics Claude Code already emits — noted in the telemetry
  sub-plan, not faked here.
- **It is the WINDOW, not one conversation.** One ring buffer of 500, shared by
  every chat and every workbench run.
- **It resets on reload.** In memory by design; saying so beats letting someone
  think their history was lost.

The full list stays in the order things happened, because that is the story. What
is pulled out separately is the short list worth reading first — a raw dump of
500 reads is not something anyone scans in a hurry. That short list is drawn as a
FLAT list of steps rather than as bands: its calls are picked from across the
whole window and are not a run of consecutive ones, so a band would claim an
adjacency they do not have. Each row keeps the flag that put it there ("asked
again", "slow") — without it the list is a handful of ordinary-looking calls with
no explanation of why they were singled out.

## The two guarantees, and how they hold

### An evaluation cannot change anything

**It gets its own server.** When a run starts, the extension opens a SECOND
`InExtensionMcpServer` on its own socket with the dry run hard-wired on, and
launches the agent with `--mcp-config` pointing at it plus `--strict-mcp-config`.
The listener is disposed in a `finally`.

This replaced a module flag that forced the dry run window-wide, which had two
problems. It paused everything else the producer was doing for up to two minutes.
And it could be missed entirely: the agent finds a server via the proxy — pinned
socket if live, otherwise the newest one — so a reloaded window plus another open
window meant the run landed on a server whose flag was false, and **its writes
executed for real while the workbench said nothing was changed**.

Making it a fact about which socket you are connected to, rather than about which
window is running something, fixes both.

Two things to know if you touch this:

- **The config passed in keeps the project's OTHER MCP servers.**
  `--strict-mcp-config` ignores every other configuration, so a config naming only
  demo-builder would run the evaluation without Playwright and anything else the
  project declares — measuring a path the producer would never take.
- **It REFUSES when there is no `.mcp.json` to base the config on.** Running
  without the flag would reach the ordinary server. A refusal is the only safe
  answer.

### An evaluation cannot evaluate itself

That would bill in a loop. TWO independent guards: the service refuses while one
is in flight, and `runAsEvaluation` refuses to nest. The spawned run is also
launched with the tool disallowed, but a CLI flag is a string, and this repo has
shipped a string-asserted guard that never ran.

**Note for anyone testing this**: removing either guard alone leaves the test
green, because the other still refuses. It fails only when both are removed.

## What is deliberately NOT built

Recorded with reasons in `.rptc/plans/evaluation-mode/`:

| | Why |
|---|---|
| Suggestions written by Claude | Scheduled (step 09), blocked on a held-out set so the advice is not tuned on the prompts it is judged by |
| History across window reloads | Scheduled (step 07). The delta currently survives one session only |
| "Succeeded but changed nothing" as an outcome | Dropped — needs a change across the whole tool surface for a rare finding |
| Durable capture / OpenTelemetry | Sub-plan, and it starts by measuring whether the standard buys anything with no collector to send to |

A constraint worth carrying: **the cost of generating a suggestion is ours, not
the prompt's.** Folding them together would inflate the number a producer is
trying to reduce and break run-to-run comparison.

## Consent, and asking twice

Destructive calls raise a modal in the VS Code window. Since 2026-08-25 the
dialog also offers **"Allow for the rest of this session"** — but only for
`republish` and `sync_content`, the two tools that fire repeatedly in one flow
and are undone by running them again. Everything else asks every time. See
`agent-alerts.md` for the two tests that decide it.

**Consent is asked in the CHAT first**, since that is where the producer is
looking, with the VS Code modal as the floor when the client cannot be asked.
Anything that is not an explicit accept is a refusal — a server cannot tell
"nobody was there" from "the user said no", so the blunt rule is the honest one.
Record: `.rptc/research/consent-in-the-chat/`; details in `agent-alerts.md`.

## The limit worth knowing

The dry run makes **Demo Builder's** tools unable to change anything. It does not
stop an agent writing a file or running a command with Claude Code's own tools —
those never reach this extension, so neither the dry run nor the recorder sees
them.

An evaluation therefore measures the path through OUR surface accurately, and is
blind to the rest of what the agent did. For prompt efficiency that is mostly
fine, since the waste being hunted is in our round trips. For "was that safe", it
is not: read `agent-alerts.md`.

## Related

- `mcp-server.md` — the tool surface these run against
- `agent-alerts.md` — the five surfaces that speak to a producer, and their copy
- `.rptc/plans/evaluation-mode/` — the plan, the steps, and what each deferred
