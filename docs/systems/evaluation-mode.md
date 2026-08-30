# Evaluation Mode — not on this branch

The Prompt Workbench, the trace view, the `evaluate_prompt` tool and the
`evaluatePrompt` / `showEvaluationWorkbench` / `showAgentTrace` commands are **not on
`develop`.**

They live on **`feature/evaluation-mode-dry-run`**, pending a decision on whether to
keep them (backlog `AI-3b`, which shipped the extraction itself). Nobody had opened
the panel, and unfinished work should not sit in the mainline.

> **Corrected 2026-08-30.** This document, and nine other pointers across source,
> tests and docs, named `feature/prompt-workbench`. **That branch has never existed on
> the remote.**
> Anyone following it would have concluded the work was lost. The branch is
> `feature/evaluation-mode-dry-run`, and it carries both the source under
> `src/features/ai/evaluation/` and the full 400-line version of this document.

## What it was for

Running a saved AI prompt against a project and seeing what the agent did with it —
the trace — so a prompt could be improved against evidence rather than by guessing.

## Why it is parked rather than deleted

It was built and never used. That is a different state from "wrong", and the backlog
records it as `built` rather than `shipped` for exactly that reason: code landing is
not the same as somebody finding it useful.

The full design and the two guarantees it made are on the branch, beside the code
they describe. Reading them here, separated from the implementation, is how a
document starts describing something that no longer matches.

## If you are picking it up

Start from the backlog item, not from this file. `AI-3b` carries the decision that is
actually outstanding, and the branch carries everything else.
