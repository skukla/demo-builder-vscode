# Loop report — 2026-08-31

Branch `loop/2026-08-31-track4`, pushed. Every commit gated: 1199 suites, 15,519
tests, zero lint errors.

## The short version

Three pieces of work finished, in order.

**A shared test builder programme (PL-16) is done.** Tests used to write their own
throwaway stand-ins for the same few objects, hundreds of times, all slightly
different. That's now one shared builder per object, and the last stubborn group
closed today.

**Two new rules got teeth.** Tests may no longer switch off type checking with
`as any` or `as never` — a habit that had hidden four real production bugs in
August, and which nothing was checking, because the linter rule for it is
explicitly turned off for tests. And the rule that a module is imported by the
file that defines it is now absolute.

**Every re-export file in the codebase is gone — all 43 of them.** These are files
whose only job is to forward other files' contents, so a thing could be reached by
two different paths. That's finished, and the build now rejects a new one.

## What actually happened, and why it mattered

### The last of the shared builders

The remaining group was 23 fake loggers written inside test setup blocks. They had
survived every previous sweep, and the reason turned out to be that **nothing was
measuring them** — the two checks that count hand-written fakes do not look inside
those blocks. They were not hard; they were invisible. A check now covers them.

Thirteen of the 23 vanished for a single reason: one source file imported the
logger by a slightly different path than everything else, so the shared test setup
could not reach its tests, and each of those files had re-implemented the setup
itself. Covering that one path deleted all thirteen at once.

### The rule about switching off type checking

`as any` and `as never` tell the compiler to stop checking — and unlike a normal
cast, they leave everything downstream unchecked too. There were **1,916 across
341 test files**, and the linter rule that would catch half of them is switched off
for tests.

It is now a rule with a ceiling that can only fall. Not an outright ban yet: a ban
that fires 1,916 errors gets switched off by Friday. The rule is not invented — our
own shared builders already contain zero of either, and they are the hardest cases.
The right way was already in use; it had just never been written down.

The older, weaker version of that rule was deleted rather than left sitting there
unenforced, and its evidence folded into the enforced one.

### Removing every re-export file

This was the bulk of the day: 43 files, some reaching 190 others.

The mechanical part was easy. **The cost was somewhere else entirely, and it was
the same every time:** production stops importing the forwarding file, the compiler
is perfectly happy, and the only thing that notices is a test's stand-in — which
nothing but running the tests can find. Every slice broke tests this way.

Three things it exposed that had been hiding behind those files:

- **A test mocking the same class twice**, once per path, where the two copies had
  drifted apart — one was missing a method the code calls. Which one won depended
  on the order of two blocks in one file. Nothing was failing. It only surfaced
  when collapsing the two paths made them collide. That is precisely the argument
  the rule rests on.
- **Five test files whose entire subject was a forwarding file** — asserting things
  like "this name is exported" and "the export list is exactly these seven names".
  They measured nothing about behaviour. One of them even asserted that a
  forwarding file *must exist*, contradicting the ratified rule outright.
- **A phantom export**: four tests faked a `Logger` that the module has never
  exported. A forwarding file accepts any name, so nothing ever said so.

## Retracted / corrected

- **The plan's central split was wrong.** It said most of the remaining work was
  "mixed" files needing a careful two-step split each. Re-measured: 22 of 23 were
  simple and exactly one was genuinely mixed. One sloppy pattern, in two places,
  was counting a forwarding line as a declaration.
- **My own counts were wrong twice more** — 26 command-executor casts were really
  42, and 15 "ambiguous" ones were not ambiguous at all; one search of the type
  declarations said so, and it was available before the claim was filed.
- **Three tooling bugs silently deleted test setup**, each in a different disguise —
  a dropped spread, a mangled comment, and a factory shape the tool mishandled. All
  three fixed at source, and every touched file audited for losses rather than the
  fix being trusted. The audit caught them; reading the diffs did not.
- **A wrong repoint was caught by a checker, not by review.** A greedy pattern
  silently pointed one function at the wrong module. Nothing would have complained,
  because that style of import is untyped.

## Environment facts

- The `inExtensionMcpServer` socket tests fail roughly one run in five under full
  load and pass 23/23 alone. Known, pre-existing, unrelated to this work.
- Whole-repo lint warnings fell from 458 to 205, because the auto-fixer could
  finally order imports that a single forwarding path had hidden.

## Your decisions

1. **Merge `loop/2026-08-31-track4`?** Fourteen commits, all gated.
2. **PL-33 — every convention enforced, or it stops being a convention.** Filed
   from the directive. The finding: it is not 16 units of debt, it is 5. Five
   describe the code and have a buildable check nobody built; eleven are rules
   about how the work is done, and belong in a section that does not claim to be
   enforced — some as hooks. Needs a call on which.
3. **PL-32 — the 1,916 type-erasing casts.** Ceiling set, conversion not started.
