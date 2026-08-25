# Step 10 — Make the workbench readable, and give it a door

**Ships:** a prompt workbench that reads like a clean, detailed chat, reachable
from somewhere a producer would actually find it.
**Depends on:** steps 04 and 08 (the surface this rebuilds).
**Do BEFORE step 09.** Model-written suggestions land inside this surface; making
them land in the current one is work done twice.
**Raised by the owner 2026-08-25:** *"I don't like the evaluation surface"* —
placement and the look of the input and output, with `tech-case-studio` named as
the reference.

## The two complaints, and they are both right

### It has no door

Measured, not assumed: the extension contributes **no menus at all** for these
commands. `demoBuilder.showEvaluationWorkbench` and `demoBuilder.showAgentTrace`
are reachable only by typing their names into the command palette. There is no
sidebar tile and no dashboard entry. A panel you can only reach by knowing its
name is not a feature, it is a secret.

### It renders like a log, not a conversation

The verdict is a grey box and a line of numbers; the steps are a numbered list of
RAW TOOL NAMES — `1. get_current_project — 5ms`. Meanwhile `toolNarration.ts`
holds **103 authored plain-English phrases** for exactly these tools, has **zero
imports** so it is safe to bundle into a webview, and is used by neither view.
The phrases were written for the terminal and never brought into the panel.

## What the Prompt Library actually is — a correction worth recording

An earlier version of this plan proposed folding the workbench into the Prompt
Library as a tab. **That was wrong, and the owner caught it.**

The Prompt Library (`dashboard/ui/aiSurface/`) is not a list. It is a **card-grid
launcher**: a search box, then one fixed-height card per saved prompt (108px,
title clamped to one line, body to three), a kebab for edit/duplicate/delete/pin/
copy, a dashed "+ New prompt" tile, and a Close button in the footer. Clicking a
card **sends the prompt to the terminal and gets out of the way.**

Its whole job is pick-one-and-go. Putting a transcript and a composer inside it
would change it from a launcher into a workspace, fight its fixed-card layout,
and — worst — give one screen two destinations: click a card and you land in the
terminal, click a tab and you stay put.

**Each surface does one thing, and that is the design:** the library PICKS, the
terminal RUNS, the workbench MEASURES.

## The duplicate picker, which must be deleted

Step 04's follow-up added a saved-prompt dropdown INSIDE the workbench
(`usePromptThread.ts`, the `Picker` in `PromptWorkbench.tsx`). It duplicates the
Prompt Library's entire job — a second, worse picker beside the one that already
works. It went in because the workbench was designed as if the library did not
exist.

**Delete it.** The library is the picker. What replaces it:

- A **"Try it out"** action on each prompt card's kebab, beside today's launch.
  Launch → the terminal. Try it out → the workbench, with that prompt loaded and
  its history resumed.
- The workbench still opens empty from its own door, for starting from scratch.

`usePromptThread` keeps everything else — the thread, "Start fresh", saving,
resuming. Only the list-and-choose part goes.

## The door

A third tile in the sidebar's AI zone, labelled **Workbench**, opening the prompt
workbench. Surface name in prose: the **Prompt Workbench**.

**A known trap, from `AiZone.tsx`'s own docstring:** a third flat tile has been
tried in this zone before and was withdrawn — it *"made them read as three
separate features and pushed the stack past the viewport at zoom."* That is why
Continue-chat and New-chat live behind one Chat tile with a caret.

So this is NOT a free addition. Two shapes, and the second is the fallback:

1. **Three flat tiles** — Chat ⌄ · Prompts · Workbench. Verify at the zoom levels
   the earlier attempt failed at BEFORE committing to it. If the stack overflows,
   do not ship it.
2. **Prompts becomes a menu**, exactly as Chat did: `Prompts ⌄` → *Prompt library*
   / *Prompt workbench*. Same tile count as today, same precedent, and the two
   items genuinely are two ways at the same thing.

Prove (1) or fall back to (2). Do not add a tile without checking.

## The transcript — what to build, and what it can honestly show

`tech-case-studio` is the reference the owner named. Its design, worth copying;
its code, not — different stack (its CSS + codicons vs our Spectrum webview).

Two ideas carry the weight:

- **`describeToolCall`** (`src/tool-call.ts`) — a call becomes
  `{icon, label, target, command, description, body, bodyLang}`. A friendly verb
  and the salient target, with detail collapsed. *"Unknown tools fall back to a
  styled JSON body, so nothing ever renders worse than before."* Our equivalent
  input is `toolNarration.ts` plus the trace's `argumentKeys`.
- **`transcript-groups.ts`** — consecutive calls group into PHASES with a
  plain-language label, start time, elapsed (ticking while running), a step
  count, and a failed count. Collapsed by default, expanding to the individual
  calls with errors inline. Its own docstring records why: the previous rule
  collapsed everything into *"a couple of opaque 'N steps' blobs, and the label
  often described none of what was inside."* A single-step phase keeps the
  specific verb rather than the phase name.

Rendered shape, top to bottom:

```
You
Set up Bodea with B2B

▸ ✓  Reading the project      2 steps  1s
▸ ✓  Checking the API mesh    3 steps  4s
▾ ◐  Deploying the mesh       1 step
      simulated — nothing changed

Claude
I would deploy the mesh, then add the B2B package and republish…

── Nothing was changed ─────────────────────
8 steps · $0.24 ↓ from $0.31 · 41s · 3 wasted
[Save]  [Run for real in the chat]
```

The composer moves to the bottom, one box, the way a chat reads.

### The agent's reply — one field we currently throw away

`promptEvaluationService.ts` parses four fields from the run's JSON:
`total_cost_usd`, `num_turns`, `duration_ms`, `is_error`. The CLI also returns
the final assistant message. Capturing it is one more field, and it is what turns
this from a log into a conversation.

### What the Activity view can NOT show, and must say

The ambient view (what the agent did in an ordinary chat) has **tool calls only**.
We do not own that process, so there is no assistant text and no cost. It renders
the same phase bands with no "You"/"Claude" rows, and it keeps step 08's honest
line rather than growing an estimate. Do not let the two views converge into one
that implies we have more than we do.

## Traps

- **The one hard rule survives the redesign.** "Run this for real" must stay
  unmistakable — distinct wording AND distinct styling, set apart from the
  try-it-out controls. It is pinned by a test for that reason.
- **Spectrum's `Flex` caps width at 450px.** The transcript is full-width; use a
  plain div with flex styles, as the current views already do, and keep the two
  new files in `tests/sop/inline-styles.test.ts`'s documented exceptions.
- **Phase labels are not per-tool phrases.** `narrationFor` gives "Checking the
  API mesh" — right for one call, wrong as the name of a phase holding four. Start
  by grouping consecutive calls of the SAME tool and labelling with its phrase;
  category labels can come later if the grouping proves too thin.
- **Timing ticks need a live clock.** The studio re-renders a running phase every
  second so it reads as a clock rather than a stopwatch, and idles when nothing
  runs. Copy the idle behaviour too.
- **The trace is a ring buffer for the WINDOW.** Unchanged by this step, and the
  Activity view must keep saying so.

## Tests

- The workbench opens from the sidebar tile, and from a prompt card's "Try it
  out" with that prompt loaded and its history resumed.
- A prompt card's kebab offers BOTH launch and try-it-out, and they go to
  different places.
- Steps render the authored phrase, never a raw tool name, for every tool that
  has one — and fall back to something readable for one that does not.
- Consecutive calls of the same tool render as ONE phase with a step count.
- A phase that failed says so on the band, without being expanded.
- A blocked write is marked simulated in the transcript, not just in a summary.
- The agent's reply renders when the run returned one, and its absence does not
  break the transcript.
- The Activity view shows no assistant text and no cost, and explains the cost.
- "Run this for real" keeps its distinct wording and styling (existing test).

## Done when

A producer opens the workbench from the sidebar, or from a prompt they saved,
types something, and reads what the agent would do in plain English — phases they
can expand, a reply, and one line of numbers — without ever seeing a tool name or
a JSON blob unless they ask for it.
