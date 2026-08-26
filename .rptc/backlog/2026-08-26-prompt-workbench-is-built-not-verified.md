---
id: AI-3a
kind: feature
area: ai
parent: AI-3
needs: []
value: high
status: built
layer: D
---
# The Prompt Workbench is built and nobody has opened it

## Index hook

*The item in one paragraph.*

**Step 10 of Evaluation Mode shipped on `feature/evaluation-mode-dry-run`
(`38c79205d`) and is `built`, not `shipped`: green tests, clean build, and no
human has looked at the panel.** It rewrote the transcript to read as a
conversation (phase bands in plain English instead of a numbered list of tool
names), did the visual pass the first attempt skipped, and gave the workbench a
door — a third sidebar tile, where before it was reachable only by typing a
command name. The owner said plainly at the time: *"I'm not in a position to
check the aesthetics yet so we'll have to take this first on the way it is."*
This item exists so that sentence does not quietly become "done". The `built`
status was added to the backlog vocabulary on 2026-08-26 for exactly this case,
and this is its first real occupant. **Tests passing is not use.**

## What was built

Committed `38c79205d` on `feature/evaluation-mode-dry-run`:

- `transcriptPhases.ts` — the grouping and the wording, pure and testable without
  a panel. Consecutive same-tool calls become one phase with a plain-English
  label, a step count, an elapsed span, and — visible while collapsed — whether
  anything failed or was simulated.
- `ui/Transcript.tsx` — one renderer, two surfaces. `SpeakerTurn` is deliberately
  exported and never called by the ambient view, because the extension does not
  own the chat's process and has no assistant text or cost for it.
- `ui/workbench.css` — the look. A 2px left rule per phase band coloured by
  state, a quiet hierarchy, tabular numerals, all from `--db-*` tokens.
- The sidebar's third tile, and the `Simulate` vocabulary replacing "Try it out".

## What "verified" means here

Not a test run. Someone opens the panel and answers:

1. **Does the transcript read?** Scan a real run without expanding anything. Can
   you tell what the agent did, and whether something went wrong?
2. **Does the visual pass hold up on screen?** This is the part with no test. The
   complaint that prompted it was that the panel "still looks awful" — the bands,
   the rule colours and the hierarchy either fix that or they do not.
3. **Is the third tile right?** It was withdrawn once for not fitting, then
   restored after the owner pointed out the tile stack is centred, so the slack
   sits idle above and below it. 45px of real room at the 640px breakpoint.
4. **Does a real Simulate run produce a transcript worth reading?** Everything
   above has only ever been exercised against fixtures.

## Why it is `high`

Not because the work is large — it is done. Because an unverified surface that
everyone believes is finished is worse than an unbuilt one, and because step 11
(the two-tool design: Activity view + Workbench) is drawn on top of this. If the
reading is wrong, step 11 inherits it.

## What this is NOT

Not step 11. That is designed and unbuilt and is separate work — see
`.rptc/plans/evaluation-mode/step-11-two-tools.md`. This item closes when someone
has opened the panel built in step 10 and said whether it works.

## Shipped so far

- 2026-08-26  Step 10 built and committed (`38c79205d`) — transcript rendering, the visual pass, the sidebar door. NOT verified by use.

Filed 2026-08-26.
