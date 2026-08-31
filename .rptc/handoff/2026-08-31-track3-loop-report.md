# Track 3 convergence — overnight loop report

Started 2026-08-31 when you went to bed. Read the summary; the rest is detail you can
skip. Contract and state: `2026-08-31-track3-loop-state.md`.

---

## The whole night in a paragraph

Track 3 is finished. The job was to stop tests faking out shared services by
intercepting whole modules, and to give sets of related test files one place to keep
their shared setup. Both are done. Along the way the same thing kept turning up: **159
lines of test setup that no test needed** — fakes claiming the code touches something it
does not. I deleted all of them, built a tool that finds more, and wrote the finding into
the two places someone reads before doing this work again. Everything is on the branch,
every commit gated, nothing touched develop.

## Shipped

| What | Result |
|---|---|
| **Module-mock walls** | All 28 converted. Only 6 needed the plumbing I set out to build; 22 needed the fake deleted |
| **PL-14 — enforcement tooling** | All seven artifacts. Last was the webview test guide, which had no reference to the document governing it. Item set to `built`, not `shipped` — the instruments run, nobody has written a test against the new guidance yet |
| **PL-16 — shared fixtures** | Half was already done. Added a shrink-only list that stops NEW hand-rolled logger fakes; converted the files this session touched |
| **Shared-setup extraction** | All 11 targets on the worklist |
| **`dead-mock-scan`** | New tool, registered so the sweep runs it. Self-tested four ways; its own first run found a bug in itself |
| **The 63-family sweep** | All swept. 37 more dead fakes; 45 of the 63 share nothing at all |

**The number:** 159 dead fakes removed — 79 in the big families, 43 the new tool found by
a static rule, 37 in the sweep. Test count unchanged throughout: 15,572 tests, 1,206
files, green on every commit.

**Three things the work uncovered that were not on anyone's list:**

- **A whole step of project deletion was untested and looked tested.** Deleting a
  storefront is supposed to pull its pages off the public CDN and destroy the site's
  access key first. A stale fake made that step crash on its first line; the crash was
  swallowed as a warning and all 23 tests passed. Proved it rather than assumed it, and
  wrote four tests. Without that step a deleted demo keeps serving pages publicly that
  nobody can take down.
- **Five function signatures asked for far more than they use** — declaring a whole
  service, then calling two methods on it. That is *why* the fakes existed. Narrowing
  each fixed the test and left an honest signature.
- **A duplicate nothing could see.** Sharing one fixture meant exporting it, and the
  duplicate-name check immediately failed: a second thing with the same name existed
  elsewhere with a different shape. Both had been local. Deleted the weaker one.

## Handed off

Nothing is half-finished. Two things are deliberately left for you:

- **PL-22** — the mutation-testing evidence and what the 93%-vs-59% gap means for policy.
  Yours, not the loop's; I did not run it.
- **The rewrite of `tests/README.md` and the splitting playbook.** Track 3 unblocks it and
  you said those are yours.

## Filed

- **Nothing new filed.** The backlog is at 88 items, all frontmatter valid, all references
  resolving. What the night produced went into code and instruments rather than items.
- The 63 families still on the shared-setup list are a **finished state, not a backlog**:
  45 share no setup at all, and the rest genuinely need what they share.

## Retracted / corrected

Six things I got wrong and fixed. Listing them because you cannot check what you are not
told:

1. **"21 of 28 walls done"** — two different counting rules subtracted from each other.
2. **Called one file's fake "genuinely needed"** and left it. It needed deleting, same as
   twenty-one others.
3. **"301 to 299"** in a commit message. It was 301 to 300; the file was always right.
4. **A claim that a reset line prevents a specific failure.** Nothing proved it — the
   comment now says it is a reasoned precaution, not a demonstrated one.
5. **Named a fixture field as asserted-on when it is not.** Replaced with the measurement.
6. **The tool I built was demanding the impossible** — failing files for something the
   test runner forbids. The only way to satisfy it was to put the duplicate back.

Plus three automated edits that landed somewhere I did not intend, each caught by a test
naming the wrong thing, each reverted and redone bounded. That is a pattern rather than
bad luck, and the lesson is to check where an edit actually landed rather than trust it.

## Environment facts

- Nothing external was touched: no cloud writes, no sign-ins, no browser.
- **40 commits** on `loop/2026-08-30-track3-convergence`, pushed. Develop untouched.
- Scans at close: no dependency cycles; duplication in `src` at 60 clones against a
  ratified floor of 66; the record scan clean apart from three advisories where code moved
  under an item's citation — one was mine and is corrected, two predate tonight and say
  only that the ground moved, not that the item is wrong.

## Your decisions

1. **Merge `loop/2026-08-30-track3-convergence` into develop?** 40 commits, all gated.
2. **PL-22** — yours to run and to rule on.
3. **`tests/README.md` and the splitting playbook** — yours; Track 3 has unblocked them.

---

# Detail, in the order it happened

Everything below is the running log. Skip it unless you want a specific thing.

## Not every "wall" is the same defect (found 2026-08-31)

The 28 were counted by one signal — a `jest.mock` naming a service module. Reading them
shows at least three different things wearing that shape, and only the first is what
ADR-016 is about:

1. **An injection wall.** The suite needs the collaborator and has no way to hand it in.
   This is the real target; a seam retires it and usually makes an assertion stronger.
2. **A construction assertion.** The mock exists to check the service is BUILT with the
   right credentials — `edsResetConfigStep` and the 401 case. A handed-in fake hides
   exactly what the test is for. Convert by keeping one test on the default path.
3. **A static side-effect silencer.** `edsDaLiveAuthHandlers-storeToken` mocks
   `HelixService.initKeyStore` — a STATIC, called fire-and-forget as `void`, purely so a
   handler path does not touch real secret storage. Nothing is being handed in, so there
   is nothing to inject. Threading a seam for a static initializer through the service
   cache would cost real complexity for no test-design gain. **Left deliberately.**

The count of walls is therefore an upper bound on the work, not a target to drive to
zero — the same lesson the coverage scan already carries about its own number.

## What converting a wall keeps turning up (2026-08-31, walls 11-14)

Four more suites came off their module mocks, and in **three of the four** the fix was
in the source, not the test. The shape repeats exactly:

> A function declares a whole service CLASS as a parameter and calls two or three
> methods on it. A test cannot supply that without a cast, so it mocks the module
> instead. Narrowing the parameter to the methods actually used fixes both — the
> signature gets honest, and the mock becomes unnecessary.

Three parameters were narrowed this way. `migrateStorefrontNamingIfNeeded` took two
classes and calls three methods. `registerSiteConfig` took the Config Service and calls
two. The two block-library publish helpers took Helix and call two. Every real service
still satisfies its new interface, so no production caller changed.

`registerSiteConfig` is worth singling out: narrowing it unblocked the config-service
half of two OTHER suites at once. Some of these walls share a root, and finding the root
is cheaper than converting the leaves one at a time.

**A fourth defect class, beyond the three above: a suite that re-mocks mid-test.**
`configSyncService` called `require('.../helixService')` inside five test bodies and
installed a fresh implementation each time, one of them reading
`HelixService.mock.results[0]` — so what a test received depended on whether an earlier
test had constructed one. That is not a mock wall so much as a test suite reaching into
Jest's module registry at runtime, and the seam removes the ability entirely.

**A construction assertion does not have to be traded away.** `edsResetConfigStep`
looked unconvertible: its whole point is that the DA.live token reaches the Helix
CONSTRUCTOR, and handing in an instance skips construction. A FACTORY seam keeps the
property assertable with no module mock. That is now the rule — instance seam by
default, factory seam when the suite asserts about construction.

Every one of the four was verified by planting the defect the test exists to catch and
confirming the converted suite still fails. Two of those plants would have passed
silently under the old module mock.

**Parked, with a reason.** The five `storefrontSetupPhases-*` and `edsResetService-*`
suites share one root: `executeEdsPipeline` takes three whole service classes with 25
methods between them. Narrowing that is a real piece of work rather than a step, and it
should be decided rather than slipped into an overnight batch.

## The mock-wall job is finished, and it was not the job I thought

**In one paragraph:** all 28 test suites that faked out a shared service are done, and
the count is now zero. But only six of them needed the change I had been building —
a way to pass the service in. The other twenty-two just needed the fake DELETED: nothing
was using it. I spent two working sessions designing careful plumbing for files that
needed a one-line removal, because I kept asking "how would this test pass the service
in?" instead of "does this fake do anything at all?". The second question takes one test
run to answer. It is now written into the handbook so the next person asks it first.

### What a fake service turned out to be, four different things

The 28 were counted by one signal — a test file naming a service module. Reading them
one at a time, that signal covers four unrelated situations:

1. **The fake does nothing.** The service gets built and never used, because something
   further along is already faked. 22 of 28. Delete it.
2. **The test genuinely needs to control the service.** 6 of 28. These get an optional
   parameter that defaults to the real thing, so nothing about how the app runs changes.
3. **The test is checking the service was BUILT correctly** — with the right credentials.
   Passing a ready-made service in would delete the very thing being checked. The fix is
   to pass a *maker* rather than a made thing.
4. **The test swaps the fake out mid-run.** One file did this five times, and what a test
   got depended on whether an earlier test had run first.

### Two things this turned up that were not on anyone's list

**A whole step of project deletion was untested, and it looked tested.** When you delete
a storefront, the extension is supposed to pull its pages off the public CDN and destroy
the site's access key first. That step's fake was stale — it offered a method the code
had stopped calling and was missing one the code needs — so the step crashed on its
first line, the crash was swallowed as a warning, and all 23 tests passed. I proved it
rather than assumed it: a deliberate crash placed one line further in left the suite
green. Without that step a deleted demo keeps serving its pages publicly with nobody
able to take them down, and a live credential outlives the site it belonged to. Both are
now covered by four new tests.

**Five function signatures were asking for far more than they use.** A function would
declare it needs a whole service — a class with dozens of methods — and then call two of
them. That is *why* the fake existed: there was no way to supply "two methods" so the
test faked the entire module. Narrowing each signature to what it actually calls fixed
the test and left a more honest signature behind. Nothing about how the app runs changed:
the real services still satisfy the narrower descriptions.

### Corrections I made along the way

- I recorded one file as "leave this one alone, a fake is genuinely needed here" and was
  wrong. It needed the fake deleted, same as twenty-one others.
- One commit reported "21 of 28 done". That was two different counting rules subtracted
  from each other. The honest figure at that moment was lower, and the final one is 28.
- A bulk find-and-replace across one test file spilled into the assertions below the
  lines it was meant to change. Three tests failed and named the wrong thing, which is
  how it was caught. Fixed by hand and re-read.

## Then: stopping the fakes from multiplying (PL-16)

**In one paragraph:** the next item asked for shared test fixtures. Half of it was
already done and nobody had noticed. The half that was not done is 420 test files each
writing their own copy of the same throwaway logger — and the copies were still
multiplying, because every service converted in the work above needs one and typing a
fresh copy is faster than finding the shared one. I added a check that lets the 420
existing copies stand but refuses any NEW one, so the pile stops growing today and
drains at whatever pace people touch those files.

The item itself said not to sweep all 420 in one go, and that is right — a 420-file
change is not reviewable. So the check grandfathers them in a list that may only get
shorter. I then converted the 22 files this session had already touched, which took the
list from 420 to 408. Ten of those 22 keep their copy for a real reason: their copy sits
inside a block that runs before any import exists, so it cannot use the shared one.

**I broke this once and reverted it.** My first attempt rewrote all 22 files
automatically and got two things wrong — it edited the ten blocks that cannot use the
shared version, and a second pass meant to tidy up mangled a line rather than cleaning
it. I threw the whole batch away and redid it with those cases excluded. That is the
third automated edit in this run that landed somewhere it was not meant to, which is a
pattern rather than bad luck; the lesson is to bound the edit and then check where it
actually landed, not to trust that it went where intended.

Two small things fell out. A suite had hand-copied the shared fixture's SHAPE into a type
declaration, free to drift from the real one — now derived from it instead. And the new
check immediately caught me leaving twelve entries on the list after they had been paid
off, which is exactly how a shrink-only list quietly stops shrinking.

## The last tooling gap, and two test families tidied

**In one paragraph:** the skill that tells someone how to write a webview test had no
reference at all to the document that governs how tests are written here — so anyone
following it wrote to a house style nobody had told them about. Fixed, which completes a
seven-item list that had been open since 28 August. Then I started on the list of test
files that duplicate each other's setup, did two of them, and in both cases the
interesting part was discovering that some of what looked shared was not worth sharing.

### The skill (the seven-item list is now done)

Two new sections. One says where a test's stand-in objects should come from and names
the one thing that looks like an exception and is not. The other is the part that changes
behaviour today: warnings about React rendering used to be tolerated in their hundreds,
and are now a hard failure. That was already true; nobody had written it down where a
person writing a test would see it. I proved the check still works before saying so —
an empty exception list and a broken check look identical.

That verification also caught the skill citing a line number that had since moved. I
dropped the line number rather than updating it, because a citation that needs
maintaining will not get it.

### Two families of duplicated test setup

**mcpInspector.** Two suites carried an identical 60-line block of setup, and one of them
explained why in a comment: the setup supposedly *has* to be repeated, for a technical
reason. That reason is not true, and believing it is what produced the duplication. Moved
to a shared file; 37 tests identical before and after, diffed name by name.

Then I checked the shared reset actually holds something up, by deleting each of its five
lines and re-running. Four are load-bearing. One is not — and my first draft of that
file's comment had asserted it prevents a specific failure. Nothing shows that. Corrected
the comment to say it is a reasoned precaution with no test behind it, which is what I
can actually support.

**daLiveAuthPrompt.** Looked like the same job and was not. Seven of the nine shared
setup lines turned out to be DEAD — the code under test never touches those modules, and
all 51 tests pass without them. Extracting them would have preserved dead weight
somewhere tidier. Deleted instead. What did get shared is a helper both suites had
written their own copy of, now built on the standard one.

**And it found a mistake in the check I added earlier tonight.** That check was failing
files for something the test runner forbids — using the shared helper in a place where it
cannot be used. It was demanding the impossible, and the only way to satisfy it was to
put the copy back. Fixed, with tests proving it in both directions. That correction also
re-counts the debt honestly: of 408 files flagged, 107 could never have been fixed. The
real number is 301.

## Five more families of duplicated test setup

**In one paragraph:** I worked through the list of test files that repeat each other's
setup and did five more — every two-suite case on the list, plus one four-suite case.
The consistent finding is the same one as before, and it is now hard to call a
coincidence: **most of what looked like shared setup was doing nothing at all.** Across
these five families I deleted sixteen mocks that no test needed, and moved perhaps a
third of what I originally expected to move.

Two examples of what that looks like:

**Six lines propping each other up.** In one family, both files mocked a service locator
and then repeated three lines wiring their fake command-runner into it. Deleting the
wiring changed nothing — both files hand the fake directly to the thing they are testing.
And with the wiring gone, the mock had no caller either. The only code that had ever
needed the mock was the dead line itself. Probed one at a time it looked essential;
probed as a set it was six lines and a mock serving each other.

**A mock the config file already provides.** Four files each disabled the VS Code API by
hand. The project's test configuration has done that globally for as long as anyone can
tell. Four copies of a no-op.

**Where it did pay off properly.** One family's fake command-runner was typed loosely
enough that the compiler could not check it. Replacing it with the standard, properly
typed one immediately rejected ten places where the test's canned responses were missing
fields the real thing always has. Not one of those was a realistic stand-in, and the
loose typing had been hiding all ten. That is the first time in this run that adopting a
standard fixture surfaced actual defects rather than just removing lines.

**A mistake I nearly published as a measurement.** My first probe of one family reported
all three mocks as essential. It was garbage — a shell quirk meant the test runner never
actually ran, and my check read "did not run" as "tests failed, therefore needed". A run
that never happened looks exactly like a failing one unless you check for the summary
line. The probe now says so out loud when there is no summary.

Counts: the list of families with unshared setup is down from 74 to 68. Every two-suite
case on the worklist is done. The remaining ones are bigger (four to seven files each)
and share a root I have not fixed — a function signature that asks for three entire
service classes when it uses about a dozen methods of them.

## Four more families — and the pattern finally has a counter-example

**In one paragraph:** four more sets of test files that repeated each other's setup, now
sharing it. Three followed the pattern from earlier tonight — most of the "shared" setup
was doing nothing and got deleted rather than moved. One did not, and that is the useful
part: it was genuine duplication of the kind sharing was invented for, which means the
earlier finding is a common case rather than a rule.

**The counter-example.** Four files testing the same text-generating function each
carried an identical 74-line block of test data — two project shapes, a component, and
the list every test passes in. Nothing was dead; four suites simply needed the same
input. That is what extraction is for, and it saved 293 lines.

**Everything else was the usual story.** Two more families gave up seventeen and eight
dead mock declarations respectively. One of them repeated the exact pattern I found
earlier in the night, at seven times the scale: seven files each disabled a service
locator, and a line in each then wired their fake into it. The code under test takes that
fake directly as a constructor argument, so the wiring did nothing — and once it went,
the seven mocks had no caller either. Seven declarations and one line, propping each
other up, invisible to any probe that removes one thing at a time.

**A rule I learned by breaking it.** Moving a mock into a shared file failed all 23 tests
in one family. The reason is a hard constraint, not a preference: the mechanism that
makes mocks work only reaches the imports of the file the mock is written in. If the
*test* file imports the thing being faked — rather than only the code under test — the
mock has to stay in that test file. It is now written into both harnesses it applies to,
so nobody re-discovers it the way I did.

**A duplicate that only became visible by fixing something else.** Sharing one family's
fixture meant exporting it, and the moment it was exported the repo's duplicate-name
check failed: a second thing with the same name existed in an unrelated family, with a
different shape. Both had been local, so nothing could see the clash. Resolved by
deleting the weaker one — it was untyped, which had switched the compiler off for it —
and pointing its eighteen uses at the standard fixture.

Counts: families with unshared setup are down from 74 to 65. Every target on the list is
now done except the two hardest, which share a root I have not fixed.

## The last two families — and the reason I twice put them off was wrong

**In one paragraph:** the two remaining sets of test files are done, which finishes the
whole list. I had set them aside twice, both times believing they depended on a bigger
piece of work I had not done. They did not. The check that would have shown me that takes
one test run, and I had already used it on nine other families. The running total is now
**79 mocks deleted across eleven families that no test needed** — deleted, not moved.

**What "dead" looks like at this scale.** From one family I removed eleven different mocks
from five files — forty-four declarations in total — and all 28 tests still passed. That
is the clearest form this finding has taken all night.

**What could genuinely be shared turned out to be small**, and I have said so in the files
rather than padding them out. One of the two harnesses contains no mocks at all: of what
survived the deletion check, some cannot be moved for a technical reason, and the rest
exist in several different versions because each test file needs a different answer from
them. What moved instead was test data — including, for the third and fourth time
tonight, a helper that builds a fake context, which different parts of this codebase have
now written from scratch at least six times.

**One thing I got wrong and fixed.** My first shared context broke two tests. That test
file needs a current project to exist — its subject saves data onto one — and with none
the code path never ran, so the tests quietly saw nothing happen. The shared version now
takes that as an argument, with a note saying why, so nobody removes it again.

**Where the finding is now written down.** Two places a person reads before touching the
next family: the automated check that governs these files, and the conventions handbook.
Both now say the first move is to delete each shared mock and re-run — not to design a
shared file — and both name the counter-example, because one family's duplication was
entirely real and a reader who takes only the first lesson will delete something they
need.

**Counts.** Families with unshared setup: 74 at the start of the night, 63 now. Every
target on the worklist is done; what remains on that list are the small ones its own
author marked as probably-legitimate splits.

## The throwaway script is now a real tool — and it paid for itself immediately

**In one paragraph:** the check I kept using by hand all night — delete a fake and see
whether any test notices — is now a proper part of the toolkit, listed alongside the
other periodic checks and run automatically by the sweep. Its first real run found 43
more redundant lines across the test suite, which I deleted and verified in one go.

**Why it was worth building rather than just writing down.** The same question got the
same answer twice this week: of 28 test files that faked out a shared service, 22 just
needed the fake deleted; of the shared setup across 11 groups of test files, 79 fakes
were dead. Both were found with a script I threw away afterwards. There are 63 more
groups of files nobody has looked at, and no repeatable way to look.

**It has two halves because the question has two costs.** One is instant and exact: it
knows one rule — a fake of something the project's test configuration already replaces
does nothing — and it applies that rule perfectly. The other is the general answer, which
means actually deleting and re-running, so it costs a test run per fake and has to be
pointed at a specific area rather than swept over everything.

**It refuses to guess, and that is deliberate.** Three of my own verdicts tonight were
garbage because a run never happened and I read the failure as "the fake is needed". The
tool now insists on seeing a results line before believing anything, refuses to start if
the tests are already failing, and shouts when the test count DROPS — because "6 passed"
against a baseline of 34 is not a small failure, it is three files not loading at all.

**Its own first run found a bug in itself**, which the team here expects and I have come
to as well: it flagged a file for a fake written inside a comment — a sentence explaining
the rule, not an actual line of code. Fixed, and tested four ways: a planted real one is
found, a deliberate override is not flagged, one in a comment is not flagged, and running
it against an empty folder makes it say so rather than reporting "all clean".

**Then it earned its keep.** 43 findings, all deleted, all verified by one full test run.
The scan now reports zero — which matters as much as the finding did, because a tool that
cannot show its own result resolved is hard to trust the next time it reports something.

## The sweep is finished, and the answer is mostly "there was nothing there"

**In one paragraph:** I pointed the new tool at the 63 remaining groups of test files —
the ones the earlier work had set aside as probably fine — and swept all of them. It
found 37 more dead fakes across 19 groups. The other 45 groups share no setup at all, so
there was never anything for a tool to find in them. That is a finished state rather than
a shortened backlog.

**How it broke down.** Nine groups had enough shared setup to probe in bulk and gave up
29 dead lines. Ten had exactly one shared item each and gave up eight more. Forty-five
had none.

**The zero-yield results matter as much as the finds.** Seven of the ten single-item
groups turned out to genuinely need what they share — one of them fails all 45 of its
tests without it. A sweep that only reports successes looks like one that always
succeeds, so those are named in the record too.

**One group came out completely clean.** Both of its shared items were dead, so it now
shares nothing — a legitimately separate pair of files with no duplication left in them.
That is a better outcome than a shared file would have been, and only visible by
deleting and re-running rather than by counting matching lines.

**The night's total, in one place.** 79 dead fakes in the eleven big groups, 43 more the
new tool found instantly by a static rule, and 37 in this sweep — 159 lines of test setup
that claimed the code touches something it does not. Each batch was verified by a full
run of the whole suite rather than a narrow one, and every "dead" verdict was
re-confirmed with the whole set removed before I deleted anything.

**What I would say about the earlier judgement.** Whoever marked these 63 as
probably-legitimate splits was right about the thing they were judging — none of them
wanted a shared file. What they could not have known is that a fifth of them were
carrying dead weight instead. Those are different questions and only the second one has a
cheap test.
