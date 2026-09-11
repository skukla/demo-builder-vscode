# Overnight run — 2026-09-10 into 2026-09-11

Branch `loop/2026-09-10-conventions-and-godfiles`, 13 commits, pushed, **nothing
merged to develop**.

---

## The short version

The extension states five things it never compromises on. **Two of them had no rule
and nothing checking them.** Both now do, and a third gap was found and filed rather
than quietly absorbed.

Then a bigger question opened underneath that one. Every convention in the handbook
names the thing that fails the build when it is broken — but nothing checked whether
that thing would *actually* fail. Hook rules have carried executable proofs since
August; the 68 test-enforced conventions carried nothing. There is now a harness for
that, and 14 of them are proven.

Along the way the error-handling strategy was researched properly, including outside
sources, which turned up a real defect in the agent surface: **a failed tool call was
being reported as a success.** Fixed.

Four things I got wrong are listed at the bottom. Two of them were caught by you
asking a question, which is the part worth reading.

---

## What happened, in order

### Reversibility had no rule

`CLAUDE.md` opens with "whatever can be done can be undone" — demos get rebuilt
constantly, so an SC has to be able to get back to zero. That was the loudest rule in
the repo and the only one of the five with no enforcement, while `!important` in a
stylesheet had three separate checks.

It is a rule now. Every capability that creates something must name the capability
that undoes it, or write down why nothing can. Of 109 things an agent can do, 15
create something; 11 name a reversal and 4 carry a written reason, and that second
number is pinned so it can only fall.

**A naming rule would have been wrong**, and I checked before choosing. Inferring
`delete_x` from `create_x` flags ten tools, and at least three of those *are*
reversible under a different verb — `deploy_mesh` is undone by `delete_mesh`,
`publish_page` by `delete_page`. A rule that fires on correct code teaches people to
ignore it.

### Error handling had a rule, but not the one anyone thought

The backlog said error handling had zero conventions. Not quite: how a failure
*travels* was already ruled and enforced. What was missing was where an error *type*
lives — and measuring that turned up something better than a rule.

There is a central errors module, 419 lines, seven classes. It was used **four times
in the whole codebase**, against 354 plain `throw new Error`. Three of its classes had
never been thrown or caught by anything, ever, while a documentation page described
them as live. Those are deleted and the page now describes what is there.

The errors people actually use live next to the code that throws them —
`DaLiveAuthError` is thrown 8 times and caught 11. So the rule says that, because it
is true.

### Then the strategy question

You asked for a proposal on the best error strategy, and later whether I had researched
best practice for this kind of application. I had not — the first version ranked four
options from measurement plus general programming knowledge. Doing the research left
the recommendation standing and found one thing measurement never could have:

**Your MCP server never marked a failed tool call as failed.** The protocol reports
tool failures as a result carrying a flag, and asks clients to hand those to the model
so it can correct itself and retry. That flag was set nowhere. Every failure came back
as a *successful* result whose text happened to say otherwise, so no client could tell
them apart — and the agent lost its best recovery path, silently, for as long as the
surface has existed.

Fixed, ruled, documented. The subtle part: only the top-level result counts. A
cancellation is a success carrying a failure inside it — a handler that ran correctly
and is reporting that the user backed out. Marking that as a failure would tell an
agent to retry something a person just declined.

### And then the layer under all of it

Your question — *does the completed convention have a proof?* — exposed that I had made
the code true and built the enforcer but never written the rule into the handbook. Code
that happens to be true is not a convention.

Fixing that opened the real gap. A convention naming a real test file, where the test
is green, looks perfect from every angle: the path resolves, the suite runs, the count
says "all enforced." But nothing ever checked whether that suite would go red if
someone broke the rule. It could be testing something adjacent, or nothing.

Hook rules do not have this problem, and the reason is an accident: all 25 share one
router, so "something blocked" does not say which rule spoke. They *had* to attribute
by message, which meant writing an executable proof per rule. Test suites are separate
files, so nobody hit that wall and nobody built the equivalent.

There is one now. A proof plants a real violation in a throwaway checkout, stages it,
and requires the named enforcer to fail **at the named assertion**. It carries a
self-test that must come back "unproven", so a harness that always says yes announces
itself.

---

## Shipped

Gated and pushed on the branch. Every commit ran the full suite: 1,560 suites, 29,401
tests, no lint findings.

| | |
|---|---|
| Reversibility is a rule | convention + enforcer over a 15-row ledger |
| Error types live with their domain | convention + shrink-only ratchet; 3 dead classes deleted |
| Failed tool calls report failure | the MCP flag, set nowhere before |
| Convention proofs | harness + **86 proven; every convention's enforcer covered** |

### The proofs, finished

Every test-enforced convention now has a proof except one, and that one is the
finding.

**RESOLVED the same day, after you pushed back on my recommendation.** What follows
is what was found; the fix is in the next section.

**`component-extraction` could not be proven, because nothing enforced it.** The
handbook says "markup repeated in three or more places becomes a component" and
names a test file. That file checks abstract classes, HOC naming, over-generic
wrappers, and four components' usage counts — and nothing about repeated markup.
No violation of the stated rule can make it fail. The citation resolves, the suite
is green, and the scorecard has counted it as enforced the whole time. Filed as
**PL-57** with a recommendation to fix the wording and leave duplication to the
periodic review.

### That recommendation was wrong

Your objection was that a periodic scan catches duplication AFTER it is built, and
the rule is about what happens WHILE it is being built. Checking instead of arguing
turned up two things I had assumed:

- The clone ledger I called "the protection" scans **tests**, not source. Source
  duplication had no automatic check of any kind.
- The build-time hook that looked like it covered this fires only when a file is
  CREATED, and returns early when the file already exists — "editing an existing
  component is not the reflex being guarded". A third copy arrives as an edit to
  existing files, so it was outside that hook by design.

I had also read "duplication is the one thing we judge by hand" as forbidding a
check. It says deciding whether two things SHOULD be one needs judgment — which
counting does not do.

**So both halves shipped, split along that line.** The COUNT is now a pin that may
only fall: 58 duplicated blocks, checked on every `npm run gate`, failing both when
it grows and when it falls without being banked. The VERDICT stays a judgment, now
written down as a rule that says plainly it has no enforcer, instead of naming one
that never checked it.

The three rules that suite really does enforce are conventions now, each with a
proof. The handbook count went 115 → 118 — up, because the record got more accurate.
One test that tested nothing (it asserted a two-item list had two items) is gone.

**The harness had two bugs of its own, and both were silent.** Node kills a child
process that prints more than 1MB, and the harness read that as "this enforcer is
broken" — against a perfectly healthy suite whose only sin was printing several
megabytes of GREEN output. Separately, a failure title that spans lines had its
first line read and the rest dropped, which reported a proof as landing in the
wrong place when it had landed exactly right. Both are the harness's own version
of the thing it exists to catch.

**Four plants were wrong before they were right**, and each is written down next
to the proof it belongs to, because they document the rules better than the rules
do. Two examples: a component that nothing imports is never read by the stylesheet
scan, so planting a new file proves nothing — the class has to sit in code a
bundle actually reaches. And a test builder used by exactly ONE feature is not a
violation of "a shared fake lives in tests/helpers"; it takes a second importer
before there is anything to complain about.

## Handed off — needs you

1. **Error convention 1** — "a failure a person reads is translated, never the
   library's own words." ~53 sites currently hand an SC a string like
   `Request failed with status code 403`. It needs a shrink-only ledger seeded before
   the rule can land, or it arrives already broken 53 times, which teaches people
   conventions are aspirational.
2. **Error convention 3** — split the classifier that guesses an error's kind by
   matching its message text. Guessing is fine for "should I retry?" and not fine for
   deciding what a person is told. 19 call sites, all asking the retry question.
3. **ADR-023** — nothing ratifies any error decision. 22 decision records, none about
   errors, which is how a whole module got built and abandoned unnoticed.
4. **Two reversibility gaps worth a decision:** should uninstalling a prerequisite
   (Node, the Adobe CLI) exist at all? And Adobe projects can be deleted while
   workspaces cannot — gap or intentional?
5. **Merge the branch**, or leave it.

## Filed, not forced

- **PL-56** — the third never-compromise property with no rule: "a user's own edits are
  never overwritten." It carries a lead I did not chase: one file in the generated
  AI-bundle directory writes files directly eight times, bypassing the mechanism meant
  to protect hand-edits. **Not verified** — the item says to read it before believing
  it.
- Two pre-existing leads in the errors module (`isAppError`, `extractErrorMessage`
  exported with no external users). Recorded, not chased.
- `NetworkError` looks unused and is not — a factory constructs it and 13 files call
  that. Written down so nobody "cleans" it later.

## What I got wrong

- **Recorded six reversibility gaps without checking whether the reversal already
  existed.** Two of them were not gaps. You asked whether I had explored changing them;
  I had not. Corrected to four, and the handbook now records the mistake and why —
  asking "is the name paired?" instead of "does a reversal already exist?"
- **Claimed error handling had no rules at all.** It had one; my search used the wrong
  words, the same way the backlog item's had.
- **Built a second tool-surface reader** that read one directory and found 100 tools
  instead of 109. A shared reader already existed, and its own header documents someone
  making that exact mistake before me. Deleted mine.
- **Registered the proof harness so that it ran never.** The registry test objected to a
  count; I changed the cadence instead of the count. Your question found it. It runs at
  release cuts now.

## Environment

- The machine was held awake with a 12-hour timer; it expires around 12:30.
- Two MCP servers were disconnected all night (Perplexity, Context7), so the error
  research used direct web sources only. A second opinion on the TypeScript half was
  never obtained, and the proposal flags that as its weakest part.

---

## Walkthrough queue

Ordered, one decision each.

| | Decision |
|---|---|
| 1 | Is "never show an SC a library's own words" the rule? Everything in the error proposal follows from it |
| 2 | Do the four remaining central error classes go? |
| 3 | ADR-023 — write it? |
| 4 | Should uninstalling a prerequisite exist? |
| 5 | Should an Adobe workspace be deletable? |
| 6 | Merge `loop/2026-09-10-conventions-and-godfiles` to develop? |
