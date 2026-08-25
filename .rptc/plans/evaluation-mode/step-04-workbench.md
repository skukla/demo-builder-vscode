# Step 04 — The workbench: refine → re-evaluate → run for real → save

**Ships:** the loop the whole feature exists for.
**Depends on:** steps 01–03.

## The result surface: one durable record, plus a courtesy reply

**Every evaluation lands in the view, whoever started it.** When the agent ran it,
it *also* answers briefly in chat and points at the view.

Both, not either — and the reason is already recorded here: the progress notifier
exists because "the agent's own report may never reach the user (disconnected
client, closed chat — both observed live 2026-08-23)." A result that lives only
in an agent's reply dies with the terminal. **The view is the record; the chat
reply is convenience.**

Build on `BaseWebviewCommand` + the webview-command-handler machinery. Follow
`webview-command-handler` for the message wiring and `spectrum-webview-ui` for
the Spectrum traps (notably: Spectrum `Flex` constrains width at 450px — use a
plain div with flex styles for the main layout).

## What the view shows

- **A verdict, one line**, and it names waste even when nothing was blocked —
  a run that changes nothing can still be a bad run. "Would have deployed the
  mesh for bodea. 5 steps, $0.21, 38s, nothing blocked, 2 steps wasted."
- **The trace** — steps in order, **plain language by default** ("Checked whether
  the demo is running"), expandable to the tool name, argument keys and tokens.
- **What it stopped** — blocked writes stated plainly, so the user is never
  unsure whether something ran.
- **What it wasted** — a first-class finding, equal billing with the section
  above. Blocked writes answer "is my project safe"; this answers the question
  the feature exists for. Reads are where the waste actually is: the orientation
  call removed on 2026-08-24 was a read, and it cost 25-57% of three prompts.
  Three shapes, all computable from the recorder's fingerprint:
  - **Asked the same thing twice** — same tool, same argument fingerprint, more
    than once in a run. "Asked which project you're in three times."
  - **Read and never used** — a large answer followed by no call that depends on
    it. State it as an observation, not a verdict; it is a heuristic.
  - **The long way round** — a sequence with a known shorter equivalent, e.g.
    `list_projects` → `get_project` → `get_project_status` where one call
    answers. Seed it from the trio already named in the overview rather than
    inventing patterns speculatively.

  Report waste in the SAME units as everything else — steps and dollars — so it
  is comparable: "Three of eight steps re-asked something it already knew.
- **Suggestions**, two kinds:
  - *prompt-level, applied with a click* — "You did not say which project, so it
    spent two steps working it out. Add: 'for bodea'."
  - *surface-level, for us* — "Three prompts all begin by re-discovering the
    current project." Accumulates in the panel, never onto a prompt.
- **History per prompt**, so the delta is the headline: "$0.14, down from $0.21;
  3 steps, down from 5."

## Then the loop closes

1. **Run for real** — hands off to the **chat** via the existing `openInClaude`
   path the Prompt Library's Launch button already uses. Real work belongs where
   the user can watch and interrupt it, not in a headless run they cannot see.
2. **Save to the library** — existing `save-ai-prompt` handler and
   `PromptEditDialog` (`src/features/dashboard/ui/aiSurface/`). Optional and
   last: a prompt earns its place by having been shown to work.

**A prompt need not start in the library.** Type one in the workbench, refine it,
save only if it turns out worth keeping. Library-first would make people file
drafts.

## The one hard UI rule

**"Run for real" must be unmistakable.** The user will have spent minutes reading
"*would have* deployed". The transition to actually deploying cannot be a button
that looks like the others — distinct styling, distinct wording, and it names
what is about to happen for real.

Before building any new component, run `reuse-first`: this extension already has
loading, empty, error, status, modal and layout components, and the wizard solved
most screen patterns first.

## Suggestions — the mechanism

Anthropic's documented loop: hand the trace to Claude and ask what should change.
Keep a **held-out set** so we do not overfit — they use one for exactly this.

**Grade outcomes, not paths.** The trace is shown to the user as a diagnostic; it
is never a pass/fail criterion. ("Too rigid… overly brittle, as agents regularly
find valid approaches that eval designers didn't anticipate.")

## Done when

A user can evaluate a prompt, see what it would do and what it costs, apply a
suggestion, re-evaluate and see the delta, run it for real, and optionally save
it — without leaving the view. `gate` clean; webview tests per
`webview-test-authoring` (mock preamble, `advanceTimers` contract).
