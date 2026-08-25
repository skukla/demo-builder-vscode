# Evaluation Mode — a dry run for agent work

## Step 0: RPTC re-initialization (ALWAYS FIRST)

If starting fresh (context was cleared), re-invoke the workflow before executing
any step:

```
/rptc:feat "Continue Evaluation Mode. Steps 01-07 are SHIPPED and pushed on feature/evaluation-mode-dry-run. Read .rptc/handoff/2026-08-25-evaluation-mode-shipped.md FIRST - it says what exists, what is known-broken, and what to do next. The next work is the prompt-threads sub-plan; do not start a numbered step."
```

## ONE feature. Read this before the step table means anything.

Rewritten 2026-08-25 after the owner said, correctly: *"I was/am expecting an
ENTIRE feature. Not one-off little tools."*

The step table below made every part look optional, and the sessions that
executed it inherited that framing — building a panel here, a toggle there, and
answering "is the panel the feature or a test affordance?" as though those were
separate products. They are not. **This is one feature with two views, and
everything flows between them.**

### What the feature IS

A producer works with an agent. At every moment they can see what it is doing,
stop it changing anything, look at what it would have done, make the ask better,
and keep the version that worked.

    THE CHAT — the live view
      · every call narrates, in words a person wrote
      · dry run makes changes impossible, not discouraged
      · destructive calls ask, where the producer is looking
      · and it can show its own trace

    THE PANEL — the considered view
      · the SAME trace, plus cost, plus what was wasted
      · suggestions carrying the evidence behind them
      · refine, re-run, and watch the number move
      · save what worked; load it back to keep working on it

    BETWEEN THEM — nothing is stranded
      · a prompt from the panel runs for real in the chat
      · a trace from the chat opens in the panel
      · a saved prompt returns to the panel with its history intact

### The three holes — CLOSED 2026-08-25

These were the places a producer hit a wall. All three are now built; the row is
kept because the reasoning is what the next hole should be measured against.

| Hole | What a producer experienced | Now |
|---|---|---|
| The chat cannot show its own trace (**step 08**) | Dry run kept them safe and showed them nothing. The recorder HAD the data and nothing read it | ✅ The workbench has a second mode, and "Demo Builder: Show What The Agent Just Did" opens it |
| Refining a prompt loses its history (**`prompt-threads/`**) | The improvement loop forgot every improvement. "Down from $0.24" fired only when nothing changed | ✅ History is keyed by THREAD; editing the wording keeps the comparison |
| A saved prompt cannot be loaded back (**`prompt-threads/`**) | Coming back to good work meant retyping it, which started the history over | ✅ A picker loads a saved prompt and resumes its thread; "Start fresh" forks deliberately |

### What the feature is FOR — both answers are true

The owner's original ask was measuring the path an agent takes through the
extension, so the surface stays efficient. That is a TEAM concern and it is real:
`measurement/` serves it.

The producer story is also real, and the panel serves it. An earlier draft of
this section argued the producer story was unvalidated and the panel should be
treated as our instrument instead. **That was carving one thing in half again.**
The same trace, the same narration and the same suggestions serve both readers;
what differs is who is looking and why. Build one feature, and measure with it.

## The parts, and the order they were built

**Each was independently shippable — that is a delivery property, NOT a statement
that any of them is optional.** Read the section above first; the table below is
a build log, not a menu.

| Step | File | Ships |
|---|---|---|
| 01 | `step-01-dry-run-gate.md` | ✅ SHIPPED `f40a7a954` — the server-enforced gate; mutation is impossible |
| 01b | `step-01b-tool-self-description.md` | ✅ SHIPPED `dce810b0d`+`0c4cb2950`+`7de43fdf9`+`219d305c9`+`e9dab5afe` — tools declare read/write, carry an authored phrase, and the consent dialog names its target |
| 02 | `step-02-trace-recorder.md` | ✅ SHIPPED — What was called — reads included — blocked, and how big the answers were |
| 03 | `step-03-runner-and-tool.md` | ✅ SHIPPED — one runner, two doors live (`evaluate_prompt` + command); door 3 is the step-04 view |
| 04 | `step-04-workbench.md` | ✅ SHIPPED — the view, the refine loop, run-for-real, save |
| 05 | `step-05-scope-the-dry-run.md` | ✅ SHIPPED — an evaluation gets its own dry-run server; it stops pausing the user's other work, and can no longer escape to a window that does not know |
| 06 | `step-06-consent-where-you-are-looking.md` | ✅ SHIPPED — per-tool session grants, offered only where repeating is recoverable and nobody else is reached |
| 06b | `step-06b-consent-in-the-chat.md` | Ask in the chat instead of the VS Code window. Decision rule settled; GATED on one observation |
| 07 | `step-07-evaluation-history.md` | ✅ SHIPPED — "Better" survives a window reload |
| 08 | `step-08-the-ambient-trace.md` | ✅ SHIPPED — the workbench's second mode plus `demoBuilder.showAgentTrace`; cost is stated as unavailable rather than estimated |
| — | `prompt-threads/overview.md` | ✅ SHIPPED — history keyed by THREAD, saved prompts load back and resume, the cheapest run survives eviction, anchored threads outlive abandoned ones |
| — | `measurement/overview.md` | Sub-plan: the held-out set, and proof the surface is improving |
| 09 | `step-09-suggestions-from-claude.md` | The advice is written by a model that read the trace |
| — | `opentelemetry/overview.md` | Sub-plan: the durable home for this data |

## Steps 05–09: decided 2026-08-25

The owner reviewed everything steps 01–04 chose not to build and settled it:

| Item | Decision |
|---|---|
| Suggestions written by Claude | **BUILD** (step 09). "The value of the feature is to aid the end user in creating better prompts" — three rules is not that |
| Held-out set / the battery | **BUILD, and put it in the plan** → promoted to the `measurement/` sub-plan |
| OpenTelemetry | **BUILD, needs its own sub-plan** → `opentelemetry/` |
| The window-wide dry run during an evaluation | **DESIGN A FIX** (step 05) |
| Consent in the chat + session grants | **BUILD**, after measuring the capability (step 06) |
| History across reloads | **BUILD** (step 07) |
| `projectShape`, built but never supplied | **DELETE** — an optional field nothing fills is the accepted-but-ignored shape this project forbids |
| "Succeeded but changed nothing" as an outcome | **DROP** — needs a change across the whole tool surface for a rare finding, and the one real instance is guarded |

### What to build next, and why that order

**The three holes are closed** (2026-08-25) — `prompt-threads/` first because it
rewrote storage step 07 had shipped, then step 08 on top of it.

What remains, in order:

1. **Make the trace panel live.** It updates on open and on Refresh; the record
   is already being written continuously in the extension host and the panel is
   already listening for pushes. Hours, not weeks. This is the whole of what the
   owner chose over owning the chat surface.
2. **The spike is PARKED** — `.rptc/plans/own-the-chat-surface/overview.md`
   records the decision and what would revive it. Keeping Claude Code's terminal
   and rendering beside it was chosen deliberately, not deferred.
3. Then, and only if the surface is being used: `measurement/`, step 09,
   `opentelemetry/` (now a local sink, not an exporter).

**The open question above all of these** is the 37-session survey's:
`.rptc/backlog/2026-08-25-agents-barely-use-the-tool-surface.md`. Agents in demo
projects are barely asked to use the extension at all. More efficiency work on a
surface nobody reaches for is the wrong target, and no amount of it changes the
answer.

**One step per session** still holds, and the reason is not context — it is that
a fresh session READS the plan instead of remembering it. Two plan-vs-reality
drifts on 2026-08-25 were both caught that way, and both were introduced by
working from memory.

Everything after the three holes is genuinely schedulable. The holes are not.

### When something becomes a sub-plan rather than a step

Two grounds, and the second was learned on 2026-08-25 rather than planned:

- **It needs something outside this extension's code** — a collector to receive
  telemetry, held-out prompts written by real producers. `opentelemetry/` and
  `measurement/` qualify this way.
- **It changes a MODEL that shipped steps depend on, and its real content is
  POLICY.** `prompt-threads/` qualifies this way: entirely inside the code, but
  it rewrites storage that step 07 shipped, and what it actually decides is when
  a thing begins, when it may be dropped, and what happens when someone returns
  to it. A step would bury those in an implementation.

The tell for the second: writing the step reveals you are choosing rules rather
than writing code.

### Open tasks that are NOT code, and must not be lost

Each of these gates a step, and none of them lives in a step's implementation.
They are listed here because a task that exists only inside a sub-plan is a task
nobody reads until they open that sub-plan — which is after they needed it.

| # | Task | Gates | Why it is not code |
|---|---|---|---|
| A | ~~Read what a `claude_code.tool` span contains~~ **DONE 2026-08-25 — the sub-plan PROCEEDS** | `opentelemetry/` | There are no spans at all: events and metrics only. For Claude's OWN tools they carry names, sizes, durations and whether it was auto-approved — the set our recorder is blind to. Our tools arrive anonymised as `mcp_tool`, so it complements the recorder rather than replacing it. And we need a SINK, not an exporter: Claude Code already emits everything. Record: `.rptc/research/claude-code-telemetry/` |
| B | ~~Log the client capabilities and read whether Claude Code declares `elicitation`~~ **DONE 2026-08-25** | step 06 | It declares `elicitation: { form: {} }` and answers the request; headless it returns `cancel` in ~5ms with no prompt shown. A follow-on — does an INTERACTIVE session render a usable prompt — is PARKED, because the design stopped depending on it. Record: `.rptc/research/consent-in-the-chat/` |
| C | Decide what to do about the tool surface barely being used | nothing here — it is bigger than this plan | Filed as a backlog item; see `2026-08-25-agents-barely-use-the-tool-surface.md` |

Both are done. Each took under an hour and each changed the work it gated — A
turned the telemetry sub-plan from "instrument our own spans" into "receive what
Claude Code already sends", and B settled step 06's shape. That is the argument
for doing this kind of task first rather than after.

**Nothing on this plan is waiting on the owner.** Both questions that were —
where telemetry lives, and where the held-out prompts come from — were answered
on 2026-08-25 and are recorded in their sub-plans. A summary that says otherwise
is stale; check here.

**Added 2026-08-25, after step 01 shipped.** Step 01b was not in the original
plan. Two things put it there, and they turned out to be the same thing:

1. **The dry run trusts a regex.** It classifies read vs write by the tool's
   NAME. An audit of all 43 read-shaped tools found the surface clean and one
   genuine write-in-a-read (`check_github_app`) held closed by a forced argument
   — but a name cannot express "called `check_` and it writes", so that guard had
   to be found by hand.
2. **Step 04 needs authored tool names** for its plain-language trace, and would
   otherwise become the FOURTH surface transforming a tool's name into English —
   the exact mistake `agentAlertCopy.ts` was written to correct.

Both are fixed by putting the truth in the tool definition, using MCP's own
`annotations` block. The same migration also fixes a live usability bug: the
permission dialog prints every argument the schema declares, so deleting an
Adobe project leads with a 19-digit id instead of the project's name.


## What this plan is, and what it is not

**This plan builds one feature: Evaluation Mode.** A way to ask for something,
see what the agent *would* do, see what it costs, refine the prompt, and only
then run it for real.

**It does not execute the optimisation findings.** Those are separate work,
listed at the end, to be filed as backlog items. They do not depend on this
feature and should not wait for it. The relationship runs the other way: today
those fixes are measured by hand with `scripts/trace-session.mjs`; this feature
makes that loop repeatable and puts it in a user's hands.

## Context

**The goal** (owner): an LLM should do anything an end user can, with human-only
steps handed back cleanly — and we should *measure* efficiency rather than guess.
The surface should feel like the data pack installer's dry run.

**Where the user actually works.** The chat window (a terminal Claude session the
extension launches) is the authoring surface. The Prompt Library is a
convenience — saved shortcuts, not where prompts are written. So this attaches to
normal chatting, not to a new command and not to the library.

**Decisions taken** (owner, this session):
- **Evaluation Mode**, enforced by the MCP **server**, toggled from the **status
  bar**. `/evaluate` follows later as sugar over the same switch.
- An **LLM must be able to run the workflow headlessly** on a user's behalf.
- Trace shown in **plain language, tool names on expand**.
- Fix policy is **measure → fix → re-measure**, one candidate at a time.

**Why server-enforced.** A dry run that occasionally is not dry is worse than
none, because it gets trusted. Guidance loses to competing signals — the reason
this morning's `aio` guard is a blocking hook, not a skill. Mutation must be
*impossible*, not discouraged.

**Why the status bar.** A mode you cannot see is a trap: you would ask for a
deploy, be told "done", and believe it. The indicator must be visible while you
are in the terminal — exactly where the sidebar is not.

## Phase 1 — The mode (server-enforced)

- Add a `dryRun` gate to `withToolLogging`
  (`src/features/ai/server/inExtensionMcpServer.ts`), **injected exactly like
  `consentGate`** so the module stays vscode-free. That seam already proves the
  pattern: it short-circuits a call and returns its own answer.
- Read-shaped tools execute normally — the path is only realistic if they do.
  **They are still recorded and still reported.** Letting reads run is about
  keeping the path honest; it is not a decision to leave them out of the
  feature's output. An inefficient read costs the same as an inefficient write,
  and in every measurement so far it has been the read that cost more (owner,
  2026-08-25).
  Everything else returns a synthetic "would have run X" naming the argument
  KEYS, and never reaches the handler. Classify with the existing
  `isReadOnlyToolName`; do not invent a second classification.
- The result reads as **data, not an error** — the rule the datapack dry run
  states: "a refusal comes back as `valid:false` with a reason, not as an error."
- Toggle: status bar item (precedent: `src/core/build/buildStampUi.ts`), a
  command, and a setting read **live** per call — same shape as
  `demoBuilder.ai.requireAgentConsent`.

## Phase 2 — The trace recorder

The server already sees every call; it should record them.

- Extend `withToolLogging` to record name, argument KEYS (never values), result
  bytes, duration, ok/error, and whether the dry run blocked it.

**REVISED 2026-08-24 after verifying the headless output — do NOT parse
transcripts in the extension.** The original draft said to read token cost from
the session transcript, which would have duplicated
`scripts/trace/transcript.mjs` inside `src/`. Measured instead:
`claude -p --output-format json` returns, in one documented object:

| Field | What it gives |
|---|---|
| `usage` | input / output / cache-read / cache-create / thinking tokens |
| `modelUsage` | per-model breakdown **with `costUSD`** |
| `total_cost_usd` | actual dollars for the run |
| `duration_ms`, `num_turns` | wall clock and turn count |
| `permission_denials` | what was refused |
| `session_id` | the transcript, if deeper detail is ever wanted |

So the **driven** path (Phase 3, where we spawn the run) needs no transcript
parsing at all — and it gains real dollar cost, which the transcript cannot give
and which is far better for a demo builder than a token count.

**Ambient mode** (mode on, user chats normally) is the only case without stdout
to read, because we do not own that process. Its trace comes from the recorder
above; token accounting there is deferred rather than duplicated — OpenTelemetry
is the supported route if we later want it.

**This was written and not built.** Steps 02–04 shipped the recorder and a
workbench that reads it for runs IT spawns; nothing ever showed the ambient
trace, so chatting with dry run on gives a guarantee and no visibility. Found by
the owner while testing, 2026-08-25, and now **step 08**.

`scripts/trace-session.mjs` stays the offline/retroactive tool for historical
analysis across sessions already on disk. Different job, no overlap, nothing to
merge.

## Phase 3 — The runner: one implementation, three doors

Evaluating a prompt is a capability, not a screen. One service backs all three
ways in, so the paths cannot drift (`call-path-audit`: one definitive path).

**The service**: given a prompt, spawn a headless
`claude -p --output-format json` run with dry-run **forced on**, and read the
result object directly (see Phase 2 — usage, `total_cost_usd`, `num_turns`,
`duration_ms`, `permission_denials`). The extension already spawns Claude
(`src/commands/openInClaude.ts`), and the tool-by-tool trace comes from the
recorder, so the two halves join without parsing anything.

**Report cost in dollars, not tokens.** `total_cost_usd` is in the output and
"$0.21" means something to a demo builder where "47,550 tokens" does not. Show
tokens on expand, next to the tool names.

**Door 1 — the agent, on the user's behalf.** An MCP tool
`evaluate_prompt({ prompt, runs? })`, so a user can say *"evaluate this prompt"*
in chat. Three non-optional constraints:
- **Recursion guard** — the spawned run must NOT have `evaluate_prompt` in its
  allowlist. Test by execution; this is the failure that bills in a loop.
- **Cost honesty** — it spawns a real run (real tokens, 30s-2min). Mark
  `confirm: true` so the consent gate states the cost first. The one place a
  read-shaped tool earns a confirm: not because it destroys, but because it spends.
- **Dry run forced**, never inherited from the toggle.

**Door 2 — a VS Code command**, for a human who does not want to chat.

**Door 3 — the findings view** (below).

## Phase 4 — The workbench: refine → re-evaluate → run for real → save

**The result surface: one durable record, plus a courtesy reply.** Every
evaluation lands in the view, whoever started it; when the agent ran it, it also
answers briefly in chat and points at the view. The reason is recorded in this
codebase — the progress notifier exists because "the agent's own report may never
reach the user (disconnected client, closed chat — both observed live)."

The view (on `BaseWebviewCommand` + the webview-command-handler machinery):

- **A verdict, one line.** "Would have deployed the mesh for bodea. 5 steps, 47k
  tokens, 38s, nothing blocked."
- **The trace** — steps in order, plain language ("Checked whether the demo is
  running"), expandable to tool name and argument keys.
- **What it stopped** — blocked writes, stated plainly, so the user is never
  unsure whether something ran.
- **What it wasted** — equal billing with the line above: repeated reads,
  answers fetched and never used, and sequences with a shorter equivalent.
  Reported in the same units (steps, dollars). See step 04 for the three shapes
  and why the recorder's argument fingerprint is what makes them computable.
- **Suggestions**, two kinds: *prompt-level, applied with a click*; and
  *surface-level, for us*, accumulating in the panel rather than onto a prompt.
- **History per prompt**, so the delta is the headline: "38k tokens, down from
  47k; 3 steps, down from 5."

Then the loop closes:

1. **Run for real** when satisfied — hands off to the **chat** via the existing
   `openInClaude` path the library's Launch button already uses. Real work
   belongs where the user can watch and interrupt it.
2. **Save to the library** — existing `save-ai-prompt` + `PromptEditDialog`.
   Optional and last: a prompt earns its place by having been shown to work.

**A prompt need not start in the library** — type one in the workbench, refine,
save only if it is worth keeping. Library-first would make people file drafts.

**The one hard UI rule: "Run for real" must be unmistakable.** After minutes of
"*would have* deployed", the transition to actually deploying cannot be a button
that looks like the others.

Suggestion mechanism is Anthropic's: hand the trace to Claude and ask; keep a
held-out set so we do not overfit.

## A bug class the trace should catch: the agent reaching past the UI

Added 2026-08-24 from a live one. A producer asked an agent to start the demo on
an EDS project. The consent dialog appeared, the tool ran, and it reported
success — but EDS storefronts have no local server. The dashboard has always said
so by HIDING the Start/Stop tile (`{!isEds && …}` in `ActionGrid.tsx`), and
`isEdsProject`'s own docstring states it outright: "EDS projects use static site
hosting and don't have start/stop functionality."

The MCP surface exposed `start_demo` / `stop_demo` / `restart_demo` to every
project regardless. So the agent could reach an action the human interface
deliberately withholds, and a no-op came back dressed as a success. Fixed by
guarding the handler, which is the seam every caller passes through.

**This is the inverse of what `ai-coverage-scan` measures.** That scan finds
handlers with NO tool — the agent surface being too small. This is the agent
surface being too LARGE: a tool that should not apply to this project shape at
all. Nothing detects it today, and it is invisible to tests, because every layer
agreed — the tool ran, the command dispatched, the handler returned success.

What would have caught it is a trace read against the outcome: `start_demo`
returned success and nothing started. That is precisely the "grade outcomes, not
paths" principle this plan already adopts, applied to a case where the path looked
perfect.

Two things to build into the recorder rather than bolt on later:

1. **Record the project SHAPE alongside the trace** — stack, components — so a
   trace can be read as "this tool, on this kind of project" rather than just
   "this tool". Without it, an inapplicable-tool finding is not expressible.
2. **Flag success-with-no-effect as a distinct outcome.** A tool that returns
   success while changing nothing is the shape of this whole class. It is not an
   error, so nothing currently notices.

Worth stating plainly because it argues for the feature: this bug had shipped, was
covered by passing tests, survived a consent dialog the user personally approved,
and was found only because a human happened to know EDS does not work that way.

## Deliberately not building

A prompt per tool (103) · path grading (research: grade outcomes, the path is a
diagnostic) · catalog-size optimisation (measured at ~3,900 tokens for our whole
surface — not the lever) · background re-runs (each is a real paid agent run) ·
OpenTelemetry — **SUPERSEDED 2026-08-25**: the owner moved it onto the plan as
the `opentelemetry/` sub-plan, then scoped it local-only with no vendor, which
means it now begins by measuring whether the standard buys anything at all. The
original reason recorded here ("needs a collector, and the reader works today")
is no longer the blocker; read the sub-plan rather than this line.

## Verification

- Phase 1: drive the real server via `SocketRpc`
  (`tests/features/ai/server/inExtensionMcpServer.testUtils.ts`); assert a
  mutating tool does **not** reach its handler under dry run while a read does.
  Test by execution, never by reading the flag.
- Phase 2: recorded trace matches the transcript for the same session.
- Phase 3: **recursion guard tested by execution** — an `evaluate_prompt` run
  cannot invoke `evaluate_prompt`.
- Consent/dry-run interaction: a `confirm: true` call under dry run is blocked by
  the dry run, not raised as a consent dialog.
- Per `mcp-tool-authoring`: descriptor row, count-pinned test update,
  `docs/systems/mcp-server.md` entry. `gate` before each commit;
  `AI_CONTEXT_VERSION` bump wherever generated content changes.

## The optimisation work this plan does NOT do

To be filed as backlog items and run with the existing manual loop
(`scripts/trace-session.mjs` + headless runs). Each is measure → fix →
re-measure.

1. **The self-inflicted orientation call.** The home AGENTS.md orders
   `get_current_project` before any action, in bold; that file is rewritten on
   every activation, so it can simply state the current project.
   (`agentsMdSections.ts`; needs an `AI_CONTEXT_VERSION` bump.) Highest
   confidence, lowest cost.
2. **The orientation trio.** `get_current_project` + `list_projects` +
   `get_project` before the real question. Anthropic's lead recommendation is
   consolidation; their example is exactly this shape.
3. **Catalog preload vs `ToolSearch`.** 6/6 runs opened with a discovery call.
   That is a documented pattern for 150k-token catalogs; ours is ~2,616 tokens,
   so it may be a bad trade at our scale. Settle it with a direct A/B.
4. **Unknown arguments are silently dropped on 102 of 103 tools.** Only
   `configure_project` uses zod `.strict()`; every other raw shape is wrapped in
   `.strip()` by the SDK. On a write tool a misspelled argument is discarded
   rather than refused, so the agent believes it asked for something it did not —
   the exact failure that earned `configure_project` its strict schema. Scope the
   fix to write tools first; a strict read tool mostly costs friction. Also check
   whether the SDK exposes Anthropic's API-level `strict: true`, which is a
   different and complementary mechanism.

## Actions outside the build

**1. Request `claude plugin eval` early access — DECIDED, owner to action.**
It is gated per organisation and enabled by an Anthropic contact, not a public
flag. Worth requesting now because the lead time is unknown and it would replace
much of any later task-set work: it already ships isolated runs, k repeats
(3 by default), a baseline arm that reports the with/without delta, versioned
JSON and CI exit codes. Caveat to state in the request: **it evaluates plugins,
not standalone MCP servers** — so the question to ask is whether an MCP server
can be evaluated by wrapping it as a plugin, or whether standalone MCP support is
on the roadmap. Nothing in this plan depends on the answer; it would let us
delete work later, not now.

**2. `strict()` — ANSWERED, and it becomes an optimisation candidate.**
Checked this session: exactly **one** of 103 tools uses zod `.strict()`
(`configureProjectTool.ts:234`). Every other tool passes a raw shape, which the
MCP SDK wraps in `.strip()` — unknown keys are silently dropped before the
handler runs. That is already documented in `mcp-tool-authoring` as the reason
`configure_project` got its strict schema: a `{addons, stroeScope}` typo applied
the addons and discarded the typo, with no error.

For **write** tools that is the dangerous shape: a misspelled argument is
discarded rather than refused, so the agent believes it asked for something it
did not. Added to the optimisation list below as item 4.

Note this is NOT the same thing as Anthropic's API-level `strict: true` on tool
definitions (which constrains what the model emits). Ours is server-side
validation. Both reduce malformed-call round trips; only the zod one is in our
control today, and whether the MCP SDK exposes the API-level flag is unchecked.
