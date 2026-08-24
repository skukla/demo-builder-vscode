# Evaluation Mode — a dry run for agent work

## Step 0: RPTC re-initialization (ALWAYS FIRST)

If starting fresh (context was cleared), re-invoke the workflow before executing
any step:

```
/rptc:feat "Plan is approved, continue to implementation. Plan: .rptc/plans/evaluation-mode/ — start at step-01. Read .rptc/handoff/2026-08-24-evaluation-mode.md first; it carries the traps and the seam to copy."
```

**Steps, in order.** Each is independently shippable; do not start the next until
the previous is green.

| Step | File | Ships |
|---|---|---|
| 01 | `step-01-dry-run-gate.md` | The server-enforced gate — mutation becomes impossible |
| 02 | `step-02-trace-recorder.md` | What was called, blocked, and how big the answers were |
| 03 | `step-03-runner-and-tool.md` | One runner behind three doors, incl. `evaluate_prompt` |
| 04 | `step-04-workbench.md` | The view, the refine loop, run-for-real, save |


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

## Deliberately not building

A prompt per tool (103) · path grading (research: grade outcomes, the path is a
diagnostic) · catalog-size optimisation (measured at ~3,900 tokens for our whole
surface — not the lever) · background re-runs (each is a real paid agent run) ·
OpenTelemetry (right destination for durable capture; needs a collector, and the
reader works today).

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
