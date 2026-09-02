---
id: PL-33
kind: chore
area: platform
needs: []
value: high
status: built
parent: PL-30
---

# Every convention is enforced, or it stops being a convention

Owner directive, 2026-08-31: *"We shouldn't have 16 that are not enforced. If it
cannot be enforced, it probably shouldn't be a convention."*

The principle is right and this repo has already paid for the counter-example. The
`src/core/` import rule was stated as absolute law in a CLAUDE.md — with a "❌",
which reads as a guarantee — while appearing in no ADR, backed by no check, and
violated seven times. A prohibition nothing checks is a wish.

## But the 16 are not one problem, and treating them as one gets it wrong

Reading all 16 splits them cleanly. **Five are code conventions with a buildable
check that nobody built. Eleven are not conventions about the CODE at all** — they
are rules about how the WORK is done, and they are in the same list only because
the handbook has one word for both.

That mixing is why "16 unenforced" looks like 16 units of debt. Only five of it is.

### Lane A — buildable, nobody built it (5)

These describe the tree. A check can read the tree. Build them.

| # | Convention | The check |
|---|---|---|
| 1 | Commands `camelCase`, components `PascalCase`, constants `UPPER_SNAKE_CASE`, file named for its export | `@typescript-eslint/naming-convention` (verified present in the installed plugin) plus a filename-vs-default-export test |
| 4 | Vendor CSS sits in the lowest cascade layer | **NOT Lane A — BLOCKED, see below** |
| 6 | A tool needing credentials pre-flights and returns a structured `needsAuth` handoff | ~~A descriptor-level test~~ — **RECLASSIFIED 2026-08-31, see below** |
| 10 | A fake a SECOND feature directory needs lives in `tests/helpers/` | Count distinct feature dirs defining or importing a builder name; ≥2 outside `helpers/` fails. `builder-uniqueness.test.ts` already does the adjacent half ("one definition"), not this one |
| 3 | A value passed into a hook is stable across renders | The entry correctly says `exhaustive-deps` cannot see across the prop boundary. A targeted AST check can: flag an inline array/object/arrow JSX prop whose receiving component forwards it into a hook dependency array. Hardest of the five; possibly partial |

Its own entry argues against #1 — "nobody has broken it, and a linter would be
policing something that has never gone wrong." That reasoning should not survive
this item. A rule nobody breaks is the CHEAPEST one to enforce, and enforcing it
costs one config line; the argument only justifies not spending effort, and there
is no effort to spend.

#### Row 6 is NOT Lane A — reclassified 2026-08-31

It was filed here on the reasoning that "the repo already pins tool lists by name",
which conflates two different things: pinning a LIST is easy, deciding which tools
NEED credentials is not.

Measured before building: the claim in the convention still holds exactly (39
sites in `src/`, 11 asserting suites). But there is no marker that says a tool
touches credentials. Compliance is reached three different ways — `runGuards`,
a bespoke pre-flight (`createProjectTool.ts:137`), or nothing because the tool
needs none — across 70 `registerTool` calls and 36 descriptors, and no descriptor
field carries anything about auth.

Enforcing it means **adding a field to the descriptor contract** so every tool
DECLARES its credential need, then checking the declaration exists. That is a
change to the agent surface's data model, not a check over the tree: it changes
what a tool author must supply and what future tools build on. Per the loop's
design gate that is product intent, so it goes to the walkthrough queue with a
recommendation rather than being built unattended.

**That recommendation was WRONG, and measuring the surface is what showed it.**
A descriptor field reaches only the tools that HAVE a descriptor. The real split
is 48 descriptor rows against 66 directly-registered tools — and the 66 include
`adobeTools`, `cloudResourceTools`, `siteTools` and `storefrontTools`, precisely
the ones most likely to need credentials. A field on the descriptor type would
have covered a minority and missed the part that matters.

**And the inventory itself was wrong three times.** 114 tools, not the 107 the
`tool-verdicts` skill states, nor the 102 an earlier pass here counted. Both
missed `dataInstallerDescriptors.ts` (8) and `statusDescriptors.ts` (4). Any
enforcement built on a count nobody had verified would have had a hole the size of
whichever file was forgotten.

**Built instead (owner chose C, 2026-08-31):** a reviewed-tool ledger,
`tests/sop/tool-auth-review.test.ts`. One row per tool with a verdict —
NEEDS-AUTH / NO-AUTH / UNREVIEWED — and a reason. A new tool has no row, so the
build fails and the question is asked at authoring time; a removed tool leaves a
stale row, which also fails. All 114 are seeded UNREVIEWED, which is the honest
state, and `unreviewedCeiling` may only fall.

The owner's sequence is C then B: see what the ledger is like to live with before
deciding whether the declaration is worth putting in the type.

Lane A is therefore FOUR buildable checks, not five.

#### Row 4 is BLOCKED, not unbuilt — 2026-08-31

Its entry already said so and I read past it: "**Not enforced — and not yet
true.** No `@layer vendor` exists in `src/` today. This is the one rule here the
code does not already follow; it waits on the CSS migration (PL-21), which is not
authorised."

There is nothing to enforce, because the rule is not true yet by design. Seven
stylesheets use `@layer` (`reset`, `theme`); none declares a `vendor` layer. A
check would be inert today and would fire only after work nobody has authorised.

This is not a check nobody built; it is a rule waiting on a decision. It should
not be counted as enforcement debt at all until PL-21 is authorised.

**Lane A is THREE buildable checks, not five. Two of my five were misfiled — one
needs a data-model change (row 6), one is blocked on unauthorised work (row 4).**
Both were readable in the entries I was classifying from; I classified from the
rule text and not from the note underneath it.

### Lane B — working discipline, not code conventions (11)

Entries 2, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16. Each is a rule about how to
investigate, what to verify before claiming something, or which judgement to
apply — "a named field in a response is a LEAD, read the source before it becomes
a finding"; "before naming a cause, name the command that would prove you wrong";
"a control proves the tool works, not that you aimed it right."

No test can check these, because there is no state in the tree to check. That is
not a gap in the tooling; it is what they are.

**But "no test" is not "no enforcement", and this repo already proves it.** There
are 12 PreToolUse hook rules in `.claude/hooks/rules/`, and two of them —
`12-unquoted-glob` and `13-piped-exit-code` — enforce exactly this kind of
verification discipline, at the moment of the action rather than against the tree.
So some of the eleven are hookable and simply have no hook.

The work in Lane B is therefore a triage, not a build:

- **Hookable** → write the rule. A hook that fires when the mistake is being made
  is stronger than a sentence in a document nobody re-reads.
- **Not hookable** → it is still true and still worth stating, but it must stop
  being counted as an unenforced CONVENTION. Move it to a named "working
  discipline" section of the handbook that does not claim to be enforced, so the
  convention count means one thing.

### Lane C — the honest possibility

Some of the eleven may be neither hookable nor worth keeping. The owner's test
applies: if it cannot be enforced AND nobody can point at a defect it prevented,
delete it. Do not preserve a rule because it reads well. Entry 14 is the one to
look at first — `tests/sop/doc-module-refs.test.ts` already covers the path half,
so what remains unenforced is a narrower claim than the entry makes.

## Done when

Every entry in the handbook's convention list is either enforced by a named check,
enforced by a named hook, or is not in the convention list. The generated index
computes "N conventions, N enforced" with the two numbers equal, and
`tests/sop/tooling-registry.test.ts` pins it.

### Amended 2026-09-01 — the criterion needed a third state

"N conventions, N enforced, equal" cannot be reached while ONE rule is true-but-not-yet
-applicable. The vendor-CSS layer rule is in the list, unenforced, and correctly so: no
`@layer vendor` exists in `src/`, so a check would fail the build today rather than
protect anything. It is not enforcement debt; it is a rule whose start date is PL-21.

The criterion as written would have forced one of two dishonest moves — delete a rule
the owner wants, or write a check that fails on purpose. Amended to: **every convention
is enforced, or names the authorised work it waits on.** One rule qualifies under the
second clause, and it names PL-21.

## Outcome

- **Conventions: 71 stated, 70 enforced.** Was 80 stated / 64 enforced / 16 unenforced
  when this item was filed.
- **Six new enforcers built** — naming conventions, fake placement, hook stability
  (partial), cited identifiers, the tool-auth review, redundant automocks.
- **Nine rules left the list** for §11 Working discipline. None deleted; each names a
  dated defect it would have prevented.
- **One rule remains unenforced by design**, gated on PL-21.
- **Three real defects** found by the review the ledger forced, all fixed: a systemic
  breach where a structured failure was flattened into prose before the caller saw it
  (48 tools), two mesh tools that blocked on a notification an agent cannot click, and
  two block tools that threw on a missing credential — one of which also wrote to disk
  before failing.
- **The `needsAuth` ledger was deleted** and replaced by a required field on the
  registration type, so the compiler asks every new tool instead of a test counting rows.

## What to be careful of

**Do not close the gap by weakening the rules.** The cheap way to make 16 → 0 is
to delete the eleven and declare victory; the honest way is to build five checks,
write the hooks that are writable, and reclassify what is genuinely discipline.

**Every new check gets control-tested in both directions before it is believed.**
Two checks in this repo have already been caught anchored to a violation that was
later fixed, so the check passed on an empty corpus. `type-erasing-casts.test.ts`
is the current reference for the four-control pattern.

## Provenance

- Owner directive, 2026-08-31, after [[PL-32]] added the 64th enforced convention
  and the count of unenforced ones stayed at 16.
- The 16 were read individually on 2026-08-31 to produce the lane split above;
  `naming-convention`'s availability and `builder-uniqueness`'s actual scope were
  both verified rather than assumed.

## Shipped so far

- 2026-08-31  docs(backlog): PL-33 — every convention is enforced, or it stops being one (`078fe1074`)
- 2026-08-31  test(sop): the naming convention is enforced — after finding it contradicted itself (`d6e95a6e4`)
- 2026-08-31  test(sop): fake placement is enforced, and row 6 is not Lane A after all (`e110ff934`)
- 2026-08-31  test(sop): the hook-stability footgun is half-enforced, and Lane A is three not five (`3c74453fc`)
- 2026-08-31  test(sop): identifiers in current-tense docs must exist — and README was lying (`12d5dbb7a`)
- 2026-08-31  test(sop): every MCP tool is reviewed for the credentials rule (option C) (`9542dfe7c`)
- 2026-08-31  feat(mcp): type the tool-registration surface — the `server: any` hole is closed (`4a1552442`)
- 2026-08-31  test(sop): first five tool-auth verdicts — 114 unreviewed to 109 (`a943c9efd`)
- 2026-08-31  docs(mcp): 65 tools reviewed, and a systemic breach the ledger was built to find (`70686d71d`)
- 2026-08-31  docs(mcp): 51 tool-auth verdicts, and the rule names one handoff shape of three (`f90d45134`)
- 2026-09-01  docs(mcp): the tool-auth review is COMPLETE — 114 of 114, and three real defects (`43cd97128`)
- 2026-09-01  feat(mcp): needsAuth is REQUIRED — the ledger is deleted, the compiler asks instead (`58e611e8f`)
- 2026-09-01  fix(mcp): a structured failure survives the projector — the needsAuth handoff reaches agents (`9cd21be13`)
- 2026-09-01  docs(mcp): correction — the best auth handoff in the repo is discarded by the projector (`36e30443c`)
- 2026-09-01  fix(mcp): the last two tools that errored on a missing credential now answer instead (`e33d583d0`)
- 2026-09-01  fix(mesh): check_mesh and delete_mesh no longer block on a notification an agent cannot click (`909efe445`)
- 2026-09-01  test(sop): the dead-mock rule was half a state in the tree, and nobody had built that half (`a38a6c93e`)
- 2026-09-01  docs(handbook): the nine rules no check can make leave the conventions list (`3884bf0f9`)
- 2026-09-01  Merge loop/2026-08-31-pl33: every convention is enforced, or names what it waits on (`fd56f7e4f`)
- 2026-09-01  docs(backlog): PL-33 closes — 71 conventions, 70 enforced, and the criterion needed a third state (`d7b287915`)
- 2026-09-01  test(sop): adopt the day's findings — two enforcers, one discipline entry, nothing else (`f5cf4f8ae`)
- 2026-09-01  test(hooks): the rule proofs are now RUN, and running them found two dead guards (`604faaad0`)
- 2026-09-01  feat(hooks): the zsh word-splitting trap is a hook, not a paragraph (`f56080441`)
- 2026-09-01  fix(hooks): the word-splitting guard now covers LOOP variables (`01b19ac13`)
- 2026-09-01  fix(ui): the trap we said no tool could catch — caught, emptied, banned (`dab8cd921`)
