---
id: PL-13
kind: chore
area: platform
needs: []
value: med
status: backlog
---

# ADR-015 convergence — empty the exemption ledger

The architecture ruling is live and enforced (`tests/sop/architecture-rules.test.ts`);
this item is the cleanup queue it froze. The ledger
(`tests/sop/architecture-rules.exemptions.json`) holds 75 reasoned entries and
may only SHRINK — each fix deletes its row, and the test fails if a fixed row
lingers.

The buckets, by effort:

1. **23 fetch-boundary files** — logic reaching into ServiceLocator; converge
   to handed-in deps (mesh services are the biggest cluster).
2. **39 construction sites** — each needs ONE adjudication first:
   constructs-its-own-subordinate (ratify: amend the test's allowed list with
   the reason) vs converge to a `create...Deps` builder.
3. **2 command-shape entries** — CommandManager is the registrar (ratify);
   DiagnosticsCommand converges to BaseCommand.
4. **6 types-purity files** — move runtime code out, or ratify (typeGuards is
   the deliberate-colocation candidate).
5. **5 hook flags** — adjudicate coarse-detector hits: legitimate default vs
   unstable reference.
6. **sendMessage ratchet at 147** — lower the pin as handlers converge to
   returns (progress pushes stay legitimate).

Not a sweep-in-one-day item: converge on touch, plus deliberate batches when
an area is already open. Done when the ledger is empty or every remaining row
is a RATIFIED permanent exception recorded in ADR-015.
