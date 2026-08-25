# Sub-plan — Prompt threads: keeping the work, not the wording

**Parent:** `.rptc/plans/evaluation-mode/` (steps 01–07 shipped).
**Status:** planned, not started. Raised by the owner 2026-08-25 after walking the
user journey against the shipped code.

## Why this is a sub-plan

It is not outside the extension — the earlier test (OpenTelemetry, measurement)
does not apply. It qualifies on a second ground worth naming: **it changes a data
model that shipped steps already depend on, and its real content is lifecycle
POLICY** — when a thing begins, when it may be dropped, what happens when someone
comes back to it. A step would bury those decisions in an implementation.

## The problem, in one line

**The feature treats "a prompt" as a fixed string. A user treats it as a thing
that changes.**

Three defects found by walking one journey, and they are one problem:

| | What happens today |
|---|---|
| **Improving a prompt destroys its history** | History is keyed by exact text (`evaluationHandlers.ts:71`). Change a word and it is a different prompt with no past — so "down from $0.24" appears ONLY when re-running something unchanged, the one case where nothing improved |
| **You cannot come back to a prompt** | The workbench opens with an empty box (`EvaluationWorkbench.tsx:42`). A saved prompt cannot be loaded in. Retyping it makes it a new prompt with no history |
| **Suggestions repeat advice already taken** | `suggestionsFor(trace, projectName)` never sees the prompt, so it tells a producer to name the project in a prompt that already names it |

The first two are the same root. The third is separate, small, and fixed by
passing the prompt in.

## The model

A **thread** is one piece of work: "getting this prompt right". It holds ordered
runs; each run stores the text it used and the five numbers.

- **Starts** when a producer types into an empty workbench.
- **Continues** when they edit and re-run, or load a saved prompt whose thread
  exists.
- **Never explicitly ends.** Threads go cold rather than finishing — which is why
  eviction is by recency rather than by a "done" flag nobody would set.

The delta then means what a producer expects: *down from where this started*,
not *down from the last time I typed these exact characters*.

**Not inferred, declared.** No fuzzy matching, no similarity scoring. A producer
must be able to say why two runs are in the same thread, and "the model thought
they were alike" fails that.

## Garbage collection — the part to get right

Today's rule (shipped in step 07) is two axes: 10 runs per prompt, 25 prompts,
dropping the least recently run prompt WHOLE. That was already a correction of a
worse rule. Threads need a third consideration.

### Axis 1 — runs within a thread

Cap and keep the newest, as now. But note what a thread makes possible: **each
run stores its own text**, so "revert to the cheapest version" becomes a real
affordance rather than an archaeology exercise. Do not drop the run that holds
the best result just because it is old — **keep the best run as well as the
newest ones.** That is a change from today's pure-recency rule and it is the
whole reason someone would look at history.

### Axis 2 — threads per project

Cap, drop the least recently touched thread whole. A stump of one run is not
comparable against anything, so partial eviction costs bytes and buys nothing.
(This part of today's rule is right and should survive.)

### Axis 3 — threads anchored to a SAVED prompt are stickier

A producer who saved a prompt to the library said it was worth keeping. Dropping
its history is worse than dropping an experiment they abandoned.

Decide, and record the reasoning:

- Do anchored threads have a higher cap, or exemption from axis 2 entirely?
- What happens when the saved prompt is **deleted** from the library? Its thread
  should stop being protected — but should it be dropped immediately, or become
  an ordinary evictable thread? (Ordinary is kinder and simpler.)
- Pinned prompts live in `globalState` and appear in EVERY project, while
  history is per project. So one pinned prompt can anchor several threads, one
  per project. That is correct — the same prompt costs different amounts against
  different projects — but it must be deliberate rather than discovered.

### Axis 4 — age is NOT an axis

Do not expire by time. A prompt untouched for three months is not less valuable
than one untouched for three weeks; what matters is whether it is still in the
top N by recency. Time-based expiry would delete a producer's best prompt over a
holiday.

### The bound, stated as a number

Whatever caps are chosen, the writeup must state the worst case in bytes and
assert it in a test, as step 07 does (~50KB per project today). A cap nobody has
multiplied out is a guess.

## Re-access — the journey that motivated this

The owner's case: *a producer finishes a prompt, considers it good, and later
wants to tweak it again.*

1. **Save to the library** marks it good. Already works.
2. **Load it back into the workbench** — does NOT exist, and is the missing
   piece. Needs a way in: the workbench's own picker, or a Launch-style action
   from the Prompt Library.
3. **Loading resumes the thread**, so the next run compares against the version
   they were happy with. This is the whole point.
4. **"Start fresh" must exist beside it.** Sometimes a producer wants a new
   thread from the same starting text — a fork, not a continuation. Without it,
   the only way to start clean is to retype from memory, which is what people do
   today and why history is lost.

### Two-window behaviour

History lives in `.demo-builder.json`, and `saveProject` serialises writes but
does not merge. Two windows evaluating the same project can lose a thread's
newest run to a last-writer-wins overwrite. Decide whether that is acceptable
(it probably is — evaluations are slow and deliberate) and say so, rather than
discovering it as a bug.

## Migration

`Project.evaluationHistory` already ships with rows keyed by prompt text. On
load, each distinct text becomes a thread of its own. Lossless, needs no
decision, and must be written before the shape changes rather than after.

## Tests

- Editing a prompt and re-running keeps the thread — the delta compares against
  the ORIGINAL, which is the defect this exists to fix.
- Loading a saved prompt resumes its thread; "start fresh" does not.
- The best run survives eviction even when it is the oldest.
- An anchored thread outlives an unanchored one under pressure.
- Deleting the saved prompt un-anchors rather than deletes.
- Old-format history migrates to one thread per distinct text.
- Worst case stays under the stated byte bound.

## Done when

A producer can refine a prompt across several sittings and see the whole trend;
can come back to a saved prompt and continue where they left off; can start fresh
deliberately; and nothing they cared about was dropped without a rule they could
have predicted.
