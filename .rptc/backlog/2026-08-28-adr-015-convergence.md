---
id: PL-13
kind: chore
area: platform
needs: []
value: high
status: active
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

## Shipped so far

- 2026-08-28  TRUE-SHAPE reconciliation (owner-led, 2026-08-28): this item and PL-11's execution are ONE interleaved batch loop — per file: strengthen the test witness (census: 7 weak files first), convert to handed-in deps, simplify the tests, delete the ledger rows; three ratchets (exemptions, tests clones, sendMessage) drop together. Sequence: PL-14's gates land first so every batch is measured; batches then run PL-13+PL-11 jointly; PL-14 group B instruments run at release cuts. God-file overlaps (EDS-8) serviced opportunistically when a batch touches one.
- 2026-08-29  fix(architecture): name the session-accessor pattern, and let the scan see new files (`c3cb9d8ed`)
- 2026-08-29  fix(components): one ComponentRegistryManager per session, not per message (`e0a15eab2`)
- 2026-08-29  fix(prerequisites): the memoising accessor fetched from the locator — moved to the boundary (`31c8e5dfb`)
- 2026-08-29  test(prerequisites): pin the safety net the cache fix now depends on (`841836805`)
- 2026-08-29  fix(prerequisites): the cache now hits — one manager per session, not per message (`0a5cc6b55`)
- 2026-08-29  feat(architecture): a repeated composition point may not build anything stateful (`79db69e19`)
- 2026-08-29  test(prerequisites): the prerequisite cache is rebuilt on every message, so it never hits (`ec489540c`)
- 2026-08-29  docs(architecture): write down the two rules ADR-015 enforced but never stated (`23d7da9d3`)
- 2026-08-29  fix(architecture): three of the fifteen were not debt — ruled, not ledgered (`85a7a6aa1`)
- 2026-08-29  feat(architecture): ADR-015's construction rule asks about STATE, not location (`15367aac6`)
- 2026-08-29  docs(research): the construction-boundary rule measures the wrong property (`df9de7c8c`)
- 2026-08-29  docs(decisions): close D-3 — the hazard was fixed on the day of the incident (`c33e42e97`)
- 2026-08-29  docs(decisions): D-3 — my trace was wrong, and the incident's witness test caught it (`ec7529cb7`)
- 2026-08-29  docs(decisions): D-3 answered by tracing — 7 of 10 need both, 3 are over-passing (`1bf608d12`)
- 2026-08-29  docs(decisions): D-3 measured — 14 sites, and the proposed factory set does not fit (`6d6f87cea`)
- 2026-08-29  refactor(eds): six files stop rebuilding the GitHub token service (`8a367813d`)
- 2026-08-29  refactor(components): the registry arrives on the context instead of being rebuilt (`dab31319a`)
- 2026-08-29  feat(architecture): enforce the construction boundary ADR-015 actually states (`03f77a7ec`)
- 2026-08-31  refactor(features): retire four feature barrels (`355c18c63`)
- 2026-08-31  refactor(commands): two commands stop living in core/ (`1078859a1`)
- 2026-08-31  refactor(types): core's progress engine stops naming a feature (`e0360093e`)
