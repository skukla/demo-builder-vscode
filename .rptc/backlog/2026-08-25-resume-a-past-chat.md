---
id: AI-4b
kind: feature
area: ai
parent: AI-4
needs: []
value: med
status: backlog
layer: D
---
# The Chat tile can only reach the MOST RECENT conversation

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**Raised 2026-08-25 alongside the disk-footprint item, and connected to it: those transcripts are 1.7 GB precisely because they are resumable, and a producer can reach exactly one of them.** The Chat tile launches `claude --continue`, which resumes the most recent conversation in that directory (`openInClaude.ts:253`); the projects root alone holds **45 resumable conversations**. A demo build spans days — set up Monday, fight the storefront Wednesday, fix the catalog Friday — and each is its own conversation with its own context, of which only the last is reachable. The codebase already half-knows: `openInClaude.ts:227` notes a session "still reaches" via `claude --resume` after `--continue` stops landing on it, and nothing surfaces that. **The cheap answer is that Claude Code already ships the picker**: `claude --resume` with no value opens an interactive, searchable one, so this is a launch-flag change rather than a session browser — resist building our own, which would be a second list to keep correct. Goes in the existing `fresh` affordance rather than a new tile (`AiZone.tsx:11` records why continuing and starting fresh share one control; picking a past chat is a third way to do the same thing). Check FIRST that the native TUI picker renders in an editor-area terminal — that decides the whole shape — plus the cold-start guard and whether `--resume` takes a launch-argument prompt the way `--continue` does. Filed 2026-08-25.

## Provenance

Raised by the owner 2026-08-25, immediately after measuring Claude Code's disk
footprint (`2026-08-25-claude-code-disk-footprint.md`). The two are connected:
those transcripts are 1.7 GB precisely because they are resumable, and today a
producer can reach exactly one of them.

## The gap

The Chat tile launches `claude --continue`, which resumes **the most recent
conversation in that directory** (`openInClaude.ts:253`). There is no way to pick
an older one.

**Measured:** the projects root alone has **45 resumable conversations**. A
producer can reach 1.

That matters more than it sounds. A demo build spans days: set up the project on
Monday, fight the storefront on Wednesday, fix the catalog on Friday. Each is its
own conversation with its own context. On Friday, Monday's is unreachable through
the extension — even though Claude Code kept it, and even though the reason it
kept it was so you could go back.

The codebase already half-knows this. `openInClaude.ts:227` notes that a session
"still reaches" via `claude --resume` after it stops being what `--continue`
lands on. Nothing surfaces that.

## The cheap answer: Claude Code already has a picker

`claude --resume` with **no value** opens an interactive picker with search
(`claude --help`: "Resume a conversation by session ID, or open interactive
picker with optional search term").

So this is not "build a session browser". It is: **launch with `--resume` instead
of `--continue` when the producer asks to pick.** Native, searchable, maintained
by Anthropic, and it cannot drift from the transcript format because it IS the
transcript format's owner.

Resist building our own picker unless the native one proves unusable in an
editor-area terminal. A second list of sessions would be a second thing to keep
correct, and this repo has been bitten by that shape repeatedly.

## Where it goes

The Chat tile already carries a `fresh` option — `OpenInClaudeArg` takes
`{ fresh?: boolean }` (`openInClaude.ts:54`) and the tile grew an affordance for
it earlier. So the shape exists: a third way in beside "continue" and "new".

Note the tile's own docstring reasoning (`AiZone.tsx:11`): continuing and
starting fresh are "two ways to do the same thing", which is why the tile shows
no chevron. **Picking a past chat is a THIRD way to do that same thing**, so it
belongs in the same affordance rather than becoming a new tile. Read that comment
before adding UI — it records a decision that was argued through.

## What to check before building

- **Does the native picker render usably in a VS Code editor-area terminal?** It
  is an interactive TUI. The Chat tile is `location=editor-active`
  (`openInClaude.ts:273`). Probably fine — it is the same terminal Claude Code's
  own UI runs in — but it is one launch to find out, and it decides whether the
  cheap answer holds.
- **What does `--resume` do on a cold start with no conversations?** `--continue`
  prints "No conversation found to continue" and that is why the code probes the
  session store first (`claudeSessionStore.hasConversation`). Resume needs the
  same guard, or the same probe.
- **Does the prompt-delivery path still work?** Spawning passes the prompt as a
  launch argument (race-free, and the docstring is emphatic that a timed paste
  was tried twice and always lost). Confirm `--resume` accepts the same shape.

## Why this is worth doing

It changes what the transcripts ARE. Today they are 1.7 GB of files the producer
cannot reach and will eventually be told to delete. With a picker they are the
work history of every demo they have built — which is also the honest argument
for reporting the footprint rather than offering to erase it.

## Kickoff prompt

```
/rptc:feat "Let the Chat tile resume a PAST conversation, not just the most recent one.
Read .rptc/backlog/2026-08-25-resume-a-past-chat.md first — Claude Code already ships an
interactive picker (`claude --resume` with no value), so this is a launch-flag change, not
a session browser. Check the picker renders in an editor-area terminal FIRST; that decides
the whole shape. Reuse the existing `fresh` affordance rather than adding a tile — AiZone.tsx
records why."
```

## Shipped so far

- 2026-08-28  Citations re-verified 2026-08-28 after the hygiene scan's CODE MOVED advisory: AiZone.tsx docstring (now ~line 8) still records the one-affordance reasoning; openInClaude.ts --continue guard and --resume note both intact. Premise unchanged.
- 2026-08-28  docs(backlog): resume-a-past-chat citations re-verified after code moved (`78a659052`)
