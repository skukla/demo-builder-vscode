# Overnight loop — 2026-09-02, 00:45 to 02:25

## The short version

I spent the night making the test suite better at catching bugs, measured rather than
assumed. The tool for that breaks the code on purpose — changes a `true` to a `false`,
deletes a line — and re-runs the tests. If the tests still pass, they would have shipped
that bug.

Two files got worked. The prerequisites installer went from catching 57% of introduced
bugs to 70%. The site tools an agent uses went from 54% to 69%, with the number of
missed bugs there dropping from 16 to 1.

Along the way the tests found real things: five test fixtures that used a field name
that does not exist, a branch of the installer that cannot run at all, a confirmation
gate on a delete that could be bypassed by supplying half of what it asks for, and two
faults in the measuring instrument itself which was calling genuine improvements
"padding".

**Nothing in the shipping extension changed.** Twelve commits, all tests, test helpers,
measurement scripts and documentation. The full suite is green: 15,578 tests.

---

## What was actually done

The work has one shape, repeated: measure which decisions in a file no test constrains,
pick the most valuable one, understand what it decides, write a test that would fail if
it decided wrongly, measure again, run the full quality gate, commit.

### The prerequisites installer

This is the code that installs Node, the Adobe CLI and their plugins on a
consultant's machine. It was the weakest-tested file measured.

Six rounds of work, each a separate commit:

- **Which Node versions a tool installs for when the project requires none.** Two places
  answer this and the answer was written out twice; neither was tested, because the test
  setup always supplied two versions, so the "none" case never ran.
- **How many steps the progress bar counts.** Get it wrong and the bar stops short or
  never fills — visible to the user, invisible to a test that only checks the install
  succeeded.
- **The message the prerequisites row is drawn from.** Which per-version list it carries
  is a real decision: Node's list says which Node versions exist, a tool's list says
  which versions have that tool. Swap them and the row shows another prerequisite's
  facts.
- **Sorting versions as numbers rather than as text.** As text, Node 8 comes after Node
  20. The last version in that list is the one made the system default, so a text sort
  quietly makes the wrong Node the default.
- **Which Node version a plugin lands on**, and answering cleanly when an agent asks for
  a prerequisite before any configuration has been read.
- **A plugin branch no test had ever entered** — sixteen mutants with no coverage at
  all. A plugin can be needed because of something the project depends on rather than
  something anyone picked; the API Mesh plugin installs because a mesh was added.

Result: bugs the tests would miss went from 87 to 58, and code no test ran at all from
36 lines' worth to 11.

### The site tools

These are the tools an agent calls to inspect and repair a storefront's configuration.

- **What each tool tells an agent about itself.** Every tool declares whether it only
  reads and whether it is destructive. That is how Claude Code decides what it may call
  without asking a person first. Nothing asserted those flags — twelve mutants, all
  surviving. They were untestable for a structural reason: the test harness kept the
  tool's handler and threw its declaration away. It keeps it now.
- **Reading without writing.** Two tools load project files to decide what to do, and
  pass a flag telling the loader not to save what it read. A scan that saved every file
  it opened would be a write hiding inside a read.
- **A gap in a confirmation gate**, on the call that deletes an old DA.live site root.
  It asks for a confirmation flag AND an echo of the project name. Nothing covered
  supplying the echo while omitting the flag — and an agent that has read the refusal
  already knows the exact name to echo.

Result: missed bugs went from 16 to 1.

### The measuring instrument

Three fixes, because the tool that judges the work was wrong twice in one night and each
time it called real progress "padding":

- It refuses a run whose score rises while nothing got better tested — a guard against
  inflating the number by asserting log messages. But it only recognised two kinds of
  improvement, so killing six real bugs in version-sorting looked like padding to it.
  Meanwhile the tool that PICKS the work had ranked exactly those as worth doing. Two
  instruments disagreeing about the same data.
- Bringing untested code under test RAISES the count of known-missed bugs, because a
  line nothing ran becomes a line something ran and either caught or missed. That also
  read as padding.
- Its floor could be checked but never raised, so it had sat two improvements stale — a
  slide back to the old number would have reported "all clear".

All three are fixed, and the rule now comes with four checks that run with every test
run. I verified them by breaking the rule on purpose and confirming the checks failed.

**Switching the measurement to a different file used to mean editing two config files in
step, with the instruction to do so written in both of them.** That is a rule you follow
until the night you do not — earlier tonight a new test file went into one and not the
other, and only an automated check caught it. It is now one command, and it refuses to
write a configuration that would report a confident zero.

---

## Shipped

Twelve commits on `loop/2026-09-01-top-files`, each one gated on the full suite,
typechecks and lint before it was made. The branch is 21 commits ahead of `develop`
(nine from earlier in the same session, twelve from tonight).

No production code changed, tonight or in the nine earlier commits — so the code-shape
scans that look for duplicate implementations and dead code are not triggered. The
record scan that does apply was run at close and is clean: no broken links, no plans
claiming to be finished while still open, no citations pointing at deleted files.

## Handed off — nothing

Every item reached a finished, committed state. Nothing is half-done.

## Filed rather than fixed

All four are written up with their evidence in
`.rptc/handoff/2026-09-02-equivalent-mutants.md`.

Three are cases where the tests cannot be improved and the honest answer is a record:

1. **A redundant condition in the installer** that can never be false, making one of its
   parameters dead. A four-line simplification, provable — but the only thing asking for
   it is a measurement, and that is not reason enough to edit the install path while
   nobody is watching.
2. **A whole branch of the installer that cannot run.** Its only caller reaches it solely
   when the prerequisite is not Node, so the Node branch inside it is unreachable. The
   proof is four steps in one file. This one is dead code, which this repo's rules say
   should be removed — I left it for the same reason as above, and noted that whoever
   removes it should record WHY it cannot run, or the next person will add it back.
3. **A defensive `?.` that the type system requires and no test can exercise**, because
   the value can never be missing by the time that line runs.

The fourth is a decision, not a correction:

4. **Two tools tell agents they are destructive while their own file explains they are
   safe to re-run** and the "same class" as a third tool that says it is NOT destructive.
   Three tools of one class, two answers — and the two saying "destructive" are the two
   an agent may call without confirmation. Both fixes are defensible and they point in
   opposite directions, which is why it is yours.

## Corrected along the way

- I reported that 48 of 114 tools declare no safety annotations at all. That was wrong:
  most tools use a different, shorter vocabulary that is translated into the standard
  one automatically. I had measured the wrong field. Checked before writing it down
  anywhere permanent.
- I nearly recorded a guard as impossible to test, reasoning that it was redundant. It
  was not — the same flag is read a second time further down, where it decides whether a
  step runs at all. Reading the report line by line caught what my reasoning missed.
- A confirmation gate appeared untested. Disabling it by hand failed three tests
  immediately, so it was tested and the report was mis-attributing. Chasing that
  properly is what uncovered the real gap in it.
- I wrote a comment describing a function argument as a "component list". The compiler
  disagreed, and it was a terminal provider. The type caught what I had assumed.
- Two tests I wrote passed for the wrong reason and I only found out by measuring: one
  checked that a value existed which the test itself had put there, and one claimed to
  test a path the code never reaches.

## Environment facts

- Nothing touched Adobe, GitHub or DA.live. No sign-ins, no cloud calls, no deploys.
- Five test fixtures were correcting a field name that does not exist on the type they
  claimed to be (`command` where the real one is `commands`). They had been hidden by a
  cast telling the compiler not to look. 368 tests passed unedited afterwards, so nothing
  depended on the wrong shape — but nothing would have caught it either.
- The count of type-erasing casts in the test suite dropped from 291 to 286.
- The record scan notes four backlog items whose cited code has changed since the item
  was last touched. Not from tonight — advisory, worth a look when you next open them.

## Your decisions

1. **Merge `loop/2026-09-01-top-files` into `develop`?** 21 commits, no production code,
   full suite green.
2. **The two tools that call themselves destructive** (item 4 above) — which way?
3. **The dead branch and the redundant condition** (items 1 and 2) — remove them, or
   leave them and I will stop reporting them?
