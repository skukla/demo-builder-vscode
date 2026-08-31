---
id: PL-26
kind: feature
area: platform
needs: []
value: med
status: active
---

# A glossary, so the agent describes things back in our words

This repo has no glossary. Nothing anywhere states what a *component*, a
*stack*, an *area*, a *datapack*, a *demo package*, an *instance* or a *seam*
means here, even though every one of those words carries a specific meaning in
this codebase and several of them mean something else in ordinary use.

## Why this is not a documentation nicety

The owner has asked three separate times for plain English, and the standing
rule now lives in two places — the global CLAUDE.md ("no session-invented
shorthand… any name coined during the work session does not appear in text to
me unless it's explained in the same sentence") and the memory
`feedback_plain_english_first`, whose own note records it was "asked 3×".

A rule asked for three times is a rule that is not working. The repo's own
escalation order says what to do about that: fix it at the lowest layer that can
hold it — structure first, a check second, a written rule only when neither can.
"Plain English" has been sitting at the rule layer the whole time.

A glossary is the structural version. The point is not that the agent needs help
understanding the owner — it usually does fine. The point is the reverse
direction: given the words, the agent has something to *reach for* when
describing work back, instead of coining a fresh label mid-session and using it
as though it were shared vocabulary.

## What to write

Short entries, this repo's real nouns, in the owner's words rather than the
type system's. Some are ambiguous today and that ambiguity is the deliverable:

- **component** vs **component instance** vs **catalog entry** — three things,
  one word in conversation.
- **stack** vs **demo package** vs **datapack** — routinely conflated in prose;
  they are separate registries with separate schemas.
- **area** — means a Build-Your-Project sub-step, and nothing else.
- **surface** — human surface vs agent surface, from the coverage scans.
- **seam** — used in `ai-context-authoring` for a gate application point; it is
  jargon and either earns a definition or gets replaced.

Define **you** and **we** as well. That costs two lines and removes a whole
class of ambiguity in instructions.

## Where it goes

Open question, and worth deciding before writing: the handbook is the stated
home of conventions, but a glossary is load-bearing for every session, and the
handbook is explicitly not loaded into context. That argues for the root
CLAUDE.md. Weigh it against the ~3,600 tokens of skill descriptions and ~4,000
of memory index already resident — this must be short to be affordable.

## Provenance

From auditing our agent-facing files against three t3.gg videos (2026-08-30),
where the glossary is rated highly and specifically for the describe-back
direction rather than the comprehension one.

## Shipped so far

- 2026-08-30  docs(claude-md): add the glossary, drop nine unverifiable stamps (`fda58735e`)

  The sha here was first written as `5bd339c85`, which is dangling. `unlogged
  --write` recorded the sha, and folding its own edit back in with `git commit
  --amend` then replaced that commit — so the record named an object no longer in
  branch history. Log, then commit the log as its OWN commit; never amend after
  logging.
- 2026-08-30  chore(backlog): point PL-26's log line at a commit that exists (`cacb8ce6d`)
