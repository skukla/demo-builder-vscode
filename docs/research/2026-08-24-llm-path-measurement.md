# Measuring the path an agent takes — first reading

**Measured 2026-08-24 on develop @ beta.141.** Reproduce with
`node scripts/trace-session.mjs --latest` (or `--all --limit N`). Controls:
`node scripts/trace-session.mjs --self-test` (22 checks), and
`tests/scripts/traceSession.test.ts`, which executes the real entry point.

## Why this exists

`ai-coverage-scan` answers whether an agent can *reach* a feature.
`scripts/measure-ai-guidance.mjs` answers what our guidance *costs as text*.
Neither can see the thing that decides efficiency: given a task, what route did
the agent take, how many wrong turns did it make, and what did the run cost?

Every efficiency claim in the AI-surface record was inferred from static reads.
The record says plainly that this was the costly gap —
`.rptc/complete/ai-surface/phase-2-response-quality.md` scores its own
prediction: *"A live harness is unnecessary; static derivation traced all 52" —
**Wrong, and the costly one.*** And the 2026-08-16 backlog item specified the
missing piece (*"rank by bytes × call frequency. That ranking is the work
list"*) without building it.

**The finding that made this cheap:** Claude Code already records everything the
path/cost half needs, per session, on disk — and nothing here read it.

## Method, and what the numbers do not mean

One **task** = one real user prompt through to the next. Slash-command plumbing,
resume caveats and memory input are excluded; counting them inflates the
denominator and flatters mean cost.

**Billable tokens = fresh input + output + cache writes.** Cache *reads* are
reported separately and never summed in. This is not a rounding detail: on the
session below, 8.3M billable against **944M** cache reads. Summing reads as if
they were fresh would overstate the run by two orders of magnitude.

**Subagent work is included.** Delegated work is written to its own file at
`<session>/subagents/agent-*.jsonl` — 194 such files against 67 top-level
sessions. An earlier version of the reader scanned one level deep and missed
three-quarters of the corpus, which would have made delegation look free. That
is precisely the error the standing constraint names: *"isolation moves where
cost is paid; it does not reduce it."*

**Privacy.** The reader emits tool names, argument keys, sizes and counts —
never argument values, never result bodies, never prompt text. Two of the 22
controls assert exactly that, and the jest suite names them so deleting one
breaks CI. It writes nothing and uploads nothing.

## Reading 1 — this repo's most recent session

```
tasks measured           54 of 60 prompts   (6 produced no model turn)
billable tokens          8,261,106
cache reads              943,760,611   (reported, never summed in)
thinking tokens          766,858
tool calls               1,040
errored results          18
median tokens / task     30,090
median calls / task      6
```

**The median task is 30,090 tokens and 6 tool calls.** That is the first
honest per-task figure this project has ever had.

The distribution is what matters, though: the top task cost **1,584,831
tokens — 52× the median**, and the top three account for roughly half the
session. Efficiency work aimed at the median would be aimed at the wrong end.

Error rate is low: 18 errored results in 1,040 calls (1.7%).

## Reading 2 — 120 newest transcripts, all projects

```
Scope: 44 sessions + 76 subagent files, 428 MB read, 152,076 records
tasks measured           2,520 of 2,867 prompts
billable tokens          355,353,352
cache reads              24,671,856,693
tool calls               28,943
errored results          739   (2.6%)
median tokens / task     30,090
```

The median task cost is **identical** across one session and 2,520 tasks
spanning many projects. That stability is the useful result: 30k tokens per task
is a real baseline to measure future changes against, not an artefact of one
session.

## Reading 3 — the bytes × frequency work list, on real demo-builder traffic

The sessions above spent their time *building* the extension, so they contain no
demo-builder calls. But agent-driven sessions run **inside a demo project**, and
those transcripts already exist. One of them carries 13 real calls:

```
   calls   err     total B    median B       max B  tool
       3     0       6,935       1,786       3,650  demo-builder/get_project
       1     0       1,378       1,378       1,378  demo-builder/list_adobe_projects
       1     0         498         498         498  demo-builder/list_projects
       3     0         413         139         141  demo-builder/get_current_project
       2     0         256         128         128  demo-builder/sign_in
       3     0         159          53          53  demo-builder/update_project_config
```

Small, but it is the thing the 2026-08-16 item specified and never built, and it
is measured rather than derived. Note the corroboration: `get_project` peaked at
3,650 bytes against its recorded 12,000-byte ceiling, and `list_projects` at 498
against 8,000. The ceilings are generous, which is what a regression alarm should
be — and now there is live evidence for it rather than an assumption.

**Two labelling errors this reading caught**, both of which would have produced
confidently wrong numbers:

1. `attributionMcpTool` counts **turns**, not calls — the thinking turn before a
   call, the turn that makes it, the turn that reads the answer. It read 49
   against 13 real calls, a 3.8× inflation. Call counts now come from the
   `mcp__server__tool` tool_use names; attribution is reported separately and
   labelled as turns.
2. The list had no bytes in it at all. Per-tool response size needs a join from
   `tool_use.id` to `tool_result.tool_use_id`; without it the "bytes × frequency"
   table was frequency only.

## Getting more of this data

Nothing further needs building. Agent sessions run inside a demo project, so
their transcripts live under that project's encoded directory, not this repo's —
which is why `--latest` (this repo) will not find them. Use `--all`, or name the
file.

A second limit worth stating: with a generic toolset (Bash/Read/Edit), a repeat
count says little — repetition *is* the working style. Repeats become a real
signal only for named MCP tools, where calling `list_projects` five times in one
task genuinely suggests a retry loop.

## What this changes about the plan

Layer 1 was built first precisely so the next decision could be made on
evidence. On the evidence:

1. **Layer 3 (the driven harness) is now the high-value one**, because the
   only thing missing is demo-builder MCP traffic, and the harness manufactures
   exactly that. Its constraints are unchanged: reads first, mutations only
   against a disposable project, human-interaction actions scored as correct
   *handoffs* rather than completions.
2. **Layer 2 (the in-extension recorder) is worth less than it looked.**
   Transcripts already give per-call sizes and errors for any agent-driven work.
   Its remaining unique value is calls from clients that write no transcript,
   plus authoritative server-side duration. Still worth doing, no longer urgent —
   and the decision that it ships on-by-default, local-only and capped stands.
3. **The 30k-token median is the baseline.** Any efficiency claim from here
   should move it, or say why it does not.

## Cleanup

There is none to do, by construction. This script writes no file, keeps no
cache, and holds no state; it streams transcripts and prints. The only cost is
read volume — the corpus is ~1.6 GB across 263 files with a single transcript
reaching 236 MB — so `--all` is bounded to the newest 25 by default, says how
many it skipped, and prints the bytes it read.
