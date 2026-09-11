---
id: PL-56
kind: chore
area: platform
parent: PL-30
needs: []
value: high
status: backlog
layer: G
---

# The never-compromise property with no convention — and a writer that may already bypass it

Found by [[PL-55]]'s step 3, which compared the handbook's conventions against the
five never-compromise properties in `CLAUDE.md` — the only independent list of what
this codebase says it cares about. Two of the five had nothing; PL-55 closed
reversibility, and this is the other.

| Never-compromise property | Conventions, 2026-09-11 |
|---|---|
| 1. Whatever can be done can be undone | 1 — written by PL-55 |
| **2. A user's own edits are never overwritten** | **0** |
| 3. Existing projects keep working | 1 (the AI-bundle four-seam rule) |
| 4. This repository is public | 8 |
| 5. Cloud operations are real and consequential | 1 (the `confirm: true` gate) |

## Why this one matters most of the five

The extension writes files into projects that people then edit by hand — `AGENTS.md`,
`.claude/` skills, `.mcp.json`, `.env`. Overwriting one destroys work the SC did
themselves, silently, and the next regeneration does it again. `CLAUDE.md` states the
mechanism and, in its last sentence, states a rule that is checkable:

> Every generated-bundle write goes through the ADR-013 hash-and-skip seam
> (`generatedFileWriter.ts`): a file whose content no longer matches its recorded hash
> is skipped and reported, never clobbered ... **A writer that calls `writeFile`
> directly has quietly opted out of that.**

Nothing checks it.

## Measured 2026-09-11, and there is a candidate defect

Across `src/`:

- **6 files** reference the hash-and-skip seam (`generatedFileWriter` /
  `writeGeneratedFile`).
- **24 files** call `writeFile(` directly, 8 of those calls in ONE file.

The direct calls are not all violations, and that is the whole difficulty — a rule of
"never call `writeFile`" would be wrong. `debugLogger.ts` writing a log file and
`diagnosticsChecks.ts` writing a report are not generated-bundle writes and must stay.
The rule has to be scoped to writers of files a USER may have edited.

**The lead worth reading first:** `project-creation/services/aiBundle/homeAiContextWriter.ts`
calls `writeFile` eight times. It sits in `aiBundle/`, which is exactly the protected
class — the generated AI bundle. If those writes bypass the seam, the property is not
merely unenforced, it is already broken for the home AI context. NOT yet verified: the
file has not been read, and it may well acquire its content through the seam and write
somewhere the seam does not own. Read it before believing this paragraph.

## What to do

1. **Read `homeAiContextWriter.ts` first.** If it clobbers user-edited files, that is a
   defect to fix before any convention is written, and it changes this item's kind.
2. **Then scope the rule.** The candidate shape: a writer under `aiBundle/` or one that
   targets a path inside a user's project goes through the seam. Deriving that boundary
   from what the seam already protects is the work — do not invent it.
3. **Then the convention + enforcer**, following the two PL-55 shipped: state what is
   TRUE, ledger the exceptions with reasons, pin the exception count so it only falls.

## Why it was invisible

Same shape as PL-55 and as the god-file finding before it: a rule stated in the most
prominent file in the repo, believed by everyone, checked by nothing. A convention
count cannot report its own gaps — the gap is only visible when the conventions are
compared against an independent list of what matters.
