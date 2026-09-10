# The duplicate-test-code burn-down: what happened

**Written for someone who wasn't here.** The short version is at the top; the
story and the decisions you need to make are below it.

## In three sentences

There were 62 places in the test suite where two files had copied the same block
of setup code, 2,506 duplicated lines in all. There are now none — every one is
either merged into a single shared copy or deliberately left alone with a written
reason. Along the way the work turned up a real bug in the product, which is the
part of this report worth your attention.

## The bug — and it's the thing to read first

**Resetting a demo does less from the project dashboard than from the projects
list.** Same project, two buttons, two different end states:

| | dashboard button | projects-list button |
|---|---|---|
| restores the block library configuration | **no** | yes |
| checks the CDN afterwards | **no** | yes |
| offers "Show Logs" when it fails | **no** | yes |

There are two separate copies of the reset code, one behind each button, and only
one of them was ever updated. Everything else about them is identical.

I did not fix it, because I cannot tell from the code whether the lighter
dashboard reset is deliberate. My read is that it's an oversight and the fix is
three lines. Your own rule points the same way: anything done must be undoable,
and a reset that leaves the block library behind hasn't put the project back to
zero. **Filed as EDS-12 with both readings written out. This is a decision for
you.**

**How it surfaced is the part I'd underline.** The duplicate-code tool flagged
two *test* files as near-copies. They're copies because the code they test is a
copy. The obvious tidy-up — merge the tests — would have sealed the bug in. So
that pair is marked "don't merge, and here's why".

## What was actually done

41 commits, all pushed to `loop/2026-09-02-clone-burndown-2`. Every commit was
held back until the whole test suite passed: 1,222 files, 15,668 tests. No
product code was changed at all — 0 files under `src/`.

The pattern almost everywhere was the same. A folder would already have a shared
setup file, and half its test files would be using it while the other half
carried their own copy, usually because the copy was written first and nobody
went back. In one folder eleven test files each kept the same two lines of setup;
in another, one arrangement block appeared eleven times across four files.

Several of those copies turned out not to be doing anything at all. Five logger
test files carried a mock that a shared file already installed. One helper
exported a function nobody called, whose three lines couldn't have worked where
they sat even if someone had. Those were deleted rather than shared.

## The rule we had backwards

When a test file and a shared helper it imports both fake the same thing, **the
helper wins** — always, no matter which one looks first in the file.

I had written the opposite into a note earlier in the day, on weaker evidence. I
proved it properly with a throwaway test and corrected the note.

It matters beyond tidying: a test file **cannot** keep its own override next to a
shared fake. The override silently does nothing — no error, no warning, the test
just quietly runs the wrong setup. That's the trap anyone doing this kind of
consolidation falls into, and it now decides the shape of every shared file here:
**a shared file may only hold what every single file using it agrees on.** Twice
I built one that was too greedy and had to cut it back before the other files
could adopt it.

## New guardrails

**A build check for import order.** Sharing setup only works if the test file
loads the shared file *before* the code it's testing. I proved that matters by
moving one line down: 61 of 63 tests failed, and the file still looked perfectly
fine. Our linter can auto-rearrange those lines, so this needed a check rather
than a comment. It took three tries to get right and I only trusted it after it
caught a fault I planted on purpose. Within the same day it paid for itself
twice — once explaining four failing tests, once stopping me writing down a rule
that was false.

Ten older test files carry the same fragile ordering. They pass today, so they're
on a list that can only shrink.

## The flaky test that kept blocking pushes

One test failed three separate pushes, each time with a bare "timed out" naming
nothing. Two causes, both now fixed: its retry loop declared a 5-second budget
but only checked the clock *between* attempts, so two attempts ran 8 seconds and
blew the 10-second limit; and the two setup steps before that loop had no limit
at all. It now fails with a message saying which step hung, instead of a mystery.

## Also filed for you

- **PL-38** — our two most-mocked pieces of infrastructure are faked 122
  different ways between them (89 versions of one, 33 of the other). Some of that
  spread is probably correct and some clearly isn't; deciding which is a call I
  didn't want to make on my own.
- **PL-35, PL-36, PL-37** — smaller finds from earlier in the same burn-down.

## What's left for you

1. **EDS-12** — is the lighter dashboard reset deliberate? If not, it's a
   three-line fix.
2. **Merge `loop/2026-09-02-clone-burndown-2` into develop.** 41 commits, no
   product code touched, full suite green on every one.
3. **PL-38**, whenever you want to think about it. Nothing is blocked on it.

## Two corrections I made to my own work

Both are already fixed; noting them because the report should say what I got
wrong, not just what I did.

- I wrote a note saying a test file's own fake beats an imported one. It's the
  other way round. Corrected in the item, and the measurement is recorded there
  so nobody has to take my word for it.
- I twice built a shared file holding more than its users agreed on, which would
  have silently overridden what two test files needed. Both were caught by
  running the tests before committing, and both are noted in the files
  themselves.
