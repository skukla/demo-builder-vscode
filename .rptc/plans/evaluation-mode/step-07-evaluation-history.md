# Step 07 — History, so "better" is a fact rather than a feeling

**Ships:** the delta survives a window reload.
**Depends on:** step 02 (the recorder), step 04 (the view that shows it).

## Why

"Is my prompt getting better?" is the question this feature exists to answer, and
today it can only be answered inside one sitting. Close the window and "$0.14,
down from $0.21" is gone. Within-session delta is a demo of the idea, not the
idea.

Step 02 deliberately kept the recorder in memory and said not to build a file
until something proved it was needed. This is that proof — and it is a STORAGE
decision, which is why it is its own step rather than a paragraph in the view.

## What to store, and where

Per project, keyed by the prompt: cost, step count, wasted count, duration, and
when. NOT the trace — that is large, it is the diagnostic rather than the record,
and keeping it would recreate the unbounded-log concern the recorder was capped
to avoid.

Read `.demo-builder.json`'s existing shape before choosing between the manifest
and `globalState`; the prompt library already made this choice once
(`save-ai-prompt` routes by `pinned` — project-local vs global), and the answer
here should match rather than invent a third convention.

**Cap and rotate.** A history that grows forever is the thing the owner objected
to. Decide the cap from what the view can actually show.

## The headline is the DELTA

A stored run is only useful as a comparison. The view already frames it that way
("down from $0.21"); this step makes the comparison reach back past the current
session, and shows a short trend when there are more than two runs.

## Tests

- A run recorded, the window "reloaded" (a fresh service instance), and the delta
  still computed.
- The cap holds: N+1 runs keep N, oldest dropped.
- No trace entries are persisted — plant one and assert it is absent.
- A prompt with no history reports no delta rather than a delta of zero.

## Done when

Evaluate, reload, evaluate again, and the second run reports the delta against
the first. `gate` clean.
