# Overnight loop — 2026-09-02, from 00:45

## The short version

**The headline is not a number that went up — it is a number nobody had looked at.**

We measure how good the tests are by breaking the code on purpose and seeing whether the
tests notice. That has been running against twelve files chosen as a representative
sample, and they score well: a median of 84%.

Tonight I measured the files this repository's own documentation calls "Key Files". Their
median is 44%. The file that persists every project's state scored 56%. The one that
updates components inside people's existing projects scored 45%. The extension's entry
point scored 9%.

The sample was not wrong to exist — a sample is a sample. But the figure we have been
quoting for "how effective are our tests" is roughly double the truth for the code that
matters most. Three of those files are now measured at every release check and pinned, so
they cannot quietly get worse, and I started on the worst of them.


I spent the night making the test suite better at catching bugs, measured rather than
assumed. The tool for that breaks the code on purpose — changes a `true` to a `false`,
deletes a line — and re-runs the tests. If the tests still pass, they would have shipped
that bug.

### What moved

Five files got worked:

| What it does | Caught before | Caught after |
|---|---|---|
| Installs Node, the Adobe CLI and their plugins | 57% | 70% |
| The site tools an agent calls | 54% | 69% |
| DA.live sign-in and token handling | 67% | 83% |
| Persists every project's state | 56% | 67% |
| Updates and rolls back components in a project | 40% | 45% |

In the second, the number of missed bugs fell from 16 to 1. In the third, code that no
test ran at all fell from 35 deliberate breakages to 2.

**The fourth is the one to notice.** The twelve files being measured were chosen as a
representative sample, and they did not include the file that stores every project's
state — which this repo's own documentation lists as a key file. Measured for the first
time tonight, it scored lower than anything else, including the file that had been picked
as the worst. It is now part of the release check.

Along the way the tests found real things: five test fixtures that used a field name
that does not exist, a branch of the installer that cannot run at all, a confirmation
gate on a delete that could be bypassed by supplying half of what it asks for, a
credential that one path refuses as unsafe and another accepts, and two faults in the
measuring instrument itself which was calling genuine improvements "padding".

**Nothing in the shipping extension changed.** Twenty-four commits, all tests, test
helpers, measurement scripts and documentation. The full suite is green: 15,614 tests.

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

### DA.live sign-in

This is how a consultant's DA.live credential gets from a browser bookmarklet into
secure storage. Three rounds:

- **The strict token check** is the only guard on two separate paths — the clipboard
  read during sign-in, and the token-store call an agent or the extension's own screens
  make. No test called it directly. It refuses a token that is not DA.live's, and one
  that never says when it expires.
- **What the sign-in boxes reject as you type.** The message VS Code shows under the box
  is the only feedback between pasting the wrong thing and being told, several steps
  later, that it was invalid. Twenty-four deliberate breakages there went unnoticed,
  because every test reads the options a box was OPENED with and none ever calls the
  check inside it. Exactly one test file in the whole repository mentions that callback.
- **What actually gets stored, and for how long.** The stored expiry is what every later
  check reads to decide whether the session is still good, and nothing asserted it. Also
  covered: a failure to store now reports failure, rather than telling someone they are
  signed in when they are not.

### Project state

`state.json` is written by whichever version of the extension last ran, and it outlives
them all — which is why a project made months ago still opens. Every field in it is
optional when read, and each has a fallback. None of those fallbacks was tested: the
existing test checks the file was READ, the process tests check something was WRITTEN,
and nothing looked at what the state became.

One fallback matters more than it looks. A file with no process list does not merely
produce an empty list without it — reading it throws, the whole load is abandoned, and
everything else in the file is silently lost.

Also covered: loading a project can either adopt it and write that to disk, or read it
and leave the disk alone. Every scan over other people's projects depends on the second
mode, because rewriting a file merely by looking at it is a write hiding inside a read.
That was checked from the callers' side and never where it is actually honoured. And a
project's mesh status, which exists only while the extension runs, now provably survives
a reload of that project and provably does not get attached to a different one.

### Updating a component, and putting it back when that fails

An update replaces a component inside a project somebody is already using. If it fails
half-way, a snapshot taken beforehand is the only thing between them and a broken
project. This was the least-tested code measured all night.

The clearest example of how that happens: two existing tests check that the snapshot was
taken "with a filter" — and a filter that copies nothing would have passed them just as
well, because nothing ever ran it. It now has to keep the component's files and skip its
dependencies, which is the difference between a snapshot people keep and one that is slow
enough that they turn it off.

Six more tests cover the failure path: the snapshot goes back, the dependencies
deliberately left out of it are reinstalled, the user is still told the ORIGINAL reason
the update failed rather than the rollback's own noise, and a failed reinstall stays a
warning — a component missing its dependencies can be fixed by hand, a half-restored one
cannot.

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

Twenty commits on `loop/2026-09-01-top-files`, each one gated on the full suite,
typechecks and lint before it was made. The branch is 29 commits ahead of `develop`
(nine from earlier in the same session, twenty from tonight).

The gate refused a commit twice, exactly as it is supposed to. Once because adding test
files left a second configuration stale — the switcher can now top that list up itself.
Once because a fixture used a shortcut this repo is deliberately retiring; the right
answer was a builder that needed no shortcut at all.

No production code changed, tonight or in the nine earlier commits — so the code-shape
scans that look for duplicate implementations and dead code are not triggered. The
record scan that does apply was run at close and is clean: no broken links, no plans
claiming to be finished while still open, no citations pointing at deleted files.

## Handed off — nothing

Every item reached a finished, committed state. Nothing is half-done.

## Filed rather than fixed

All six are written up with their evidence in
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

A fourth needs nothing from you: an empty-clipboard check that no test can tell apart,
because the very next line rejects an empty string anyway. Written down so nobody spends
an hour on it.

Two are decisions, not corrections:

5. **Two tools tell agents they are destructive while their own file explains they are
   safe to re-run** and the "same class" as a third tool that says it is NOT destructive.
   Three tools of one class, two answers — and the two saying "destructive" are the two
   an agent may call without confirmation. Both fixes are defensible and they point in
   opposite directions, which is why it is yours.
6. **A DA.live token that states no expiry is refused one way and accepted the other.**
   Pasted from the clipboard, it is rejected in as many words as unsafe to store. Typed
   into the box, it is accepted and given an invented 24-hour life. The clipboard path
   was deliberately hardened; the typed one looks simply never to have been revisited.
   Both behaviours are now pinned by tests, so whichever way you settle it, the test that
   has to change is the one that explains itself.

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
- I committed once with the wrong message — a stale scratch file from earlier in the
  session, because I reused its name. The files were right, the description was somebody
  else's work. Amended and re-pushed.
- I reported one of the key-file scores as 40% when it was 45%. I had done the arithmetic
  by hand over the raw report; the tool discards mutations that could not run at all, and
  counting those as "missed" makes the tests look worse than they are. Corrected before it
  went into the write-up. Every other number came from the tool.
- My first version of the configuration syncer would have DELETED eight working entries,
  because it only recognised test files whose paths mirror the source exactly and the
  webview tree does not. That would have handed those modules a run with no tests, which
  reports zero and reads like a catastrophe — the precise failure the check exists to
  prevent. It only adds now, and reports what it cannot account for.

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

1. **Merge `loop/2026-09-01-top-files` into `develop`?** 29 commits, no production code,
   full suite green.
2. **The DA.live token with no stated expiry** (item 6) — refuse it everywhere, accept it
   everywhere, or keep the clipboard stricter on purpose and say so in a comment?
3. **The two tools that call themselves destructive** (item 5) — which way?
4. **The dead branch and the redundant condition** (items 1 and 2) — remove them, or
   leave them and I will stop reporting them?
