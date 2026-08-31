# Track 3 convergence — overnight loop report

Started 2026-08-31 when the owner went to bed. Appended as work happens.
State and contract: `2026-08-31-track3-loop-state.md`.

## Summary

Converting 28 test suites off their module mocks, so a stateless collaborator arrives
through a seam instead of by intercepting its module. **8 of 28 done** at loop start.

## What has landed

| Suite | Wall | Note |
|---|---|---|
| `publishKeyRegistrar` | Helix | Removing it exposed 11 `as never` casts hiding that `Logger` has no `.mock` |
| `refreshBlockLibraryHeadless` | Helix | The mock returned an empty object and asserted nothing |
| `storefrontRepublishContent` | Helix | Assertion got STRONGER — `expect.anything()` became the named instance |
| `contentAuthoringTools` x2 | Helix | Factory seam; 99 tests green |
| `edsResetUI.testUtils` | GitHubApp | Frees 6 suites; the service sat behind a dynamic import |
| `catalogPrewarmPhase` | Helix + tokens | The suite was WRITTEN as this conversion's witness. Lost no assertion |

Seams also added to `storefrontSetupPhases` (retires three walls at once) and
`edsResetConfigStep`.

## Findings so far

**Every wall that comes down exposes something it was hiding.** Three for three: the
casts above, a partial fake tsc refused, and an assertion that could not name its own
subject. This is the argument for the work — the tests get stronger, not just cheaper.

**One wall is load-bearing and must not be removed carelessly.** `edsResetConfigStep`
asserts Helix is CONSTRUCTED with the token provider. That check exists because its
absence caused a live 401 on 2026-08-15 — a site carrying an admin role refuses the
GitHub token, and the CDN kept serving a stale config. A handed-in fake hides it.
Convert by keeping one test on the default path.

**tsc found a better seam than I designed.** For `catalogPrewarmPhase` I typed a factory
return as unknown; the compiler named `PdpPublisher`, the narrow interface the consumer
actually needs. Injecting that beats injecting the whole class.

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

## Your decisions in the morning

- Merge `loop/2026-08-30-track3-convergence` into develop?
- PL-22 — what the 59% mutation score means for policy (not loopable).
- The rewrite of `tests/README.md` and the splitting playbook, which Track 3 unblocks.
