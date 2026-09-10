# Escape analysis — every defect that shipped past the suite (two years of receipts)

The evidence base for the test-strategy audit (PL-10), owner-commissioned
2026-08-28. Question per escape: WHAT shipped broken, HOW it was found, WHY
the suite missed it, and WHICH test style would have caught it. Sources:
memory files, backlog items, CLAUDE.md incident notes, ADRs — receipts named
per row. Confidence marked where a date is approximate.

## The escapes

| # | What shipped broken | Found how | Why the suite missed it | Style that would have caught it |
|---|---|---|---|---|
| 1 | `stackBackend` never persisted; a cast (`as never`) hid the missing dispatch field — import resolved EVERY real project to `''` (2026-08-13) | Live use | Collaborator was mocked; a mock answers the same whatever it's handed | Argument-assertion on the collaborator; no-cast-at-boundary rule |
| 2 | Reset never offered sample-data removal to anyone (2026-08-17, same cast class) | Live use | Same mock-blindness | Same |
| 3 | Sample-data removal couldn't resolve credentials (2026-08-17) | Live use | Same | Same |
| 4 | Poller handed a client with no `getJobStatus` (2026-08-17) | Live use | Same | Same |
| 5 | Deployed mesh displayed "Not Deployed" (2026-08-04 accessor collapse) | Live use | Fixture + code agreed with each other, both wrong about which accessor serves what | Fixture-from-real-artifact rule; accessor-contract test |
| 6 | `remove_integration` reported success leaving the app + 12 kit packages RUNNING in Adobe (AB-7; leaking since ~mid-August — a package from the original ERP journey survived weeks) | The teardown journey listing Runtime directly (2026-08-28) | The undeploy CLI was mocked; no test can see that the REAL `aio app undeploy` exits 0 without doing the work | Live verification after cloud writes (journey + verify-the-namespace, now built into the removal itself) |
| 7 | App-Management uninstall residue (AB-4, measured live 2026-08-27) | Live measurement | Same class as #6 — external tool's real behavior invisible to mocks | Same |
| 8 | Standing consent unreachable headless: chat-ask auto-declined in 12ms before the setting was read (shipped with the consent feature) | Both ERP journeys failing teardown (2026-08-28) | Unit tests covered each consent path separately; no test simulated a CLIENT that declares elicitation and auto-declines | End-to-end journey through the real client |
| 9 | Generated skills written in a layout Claude Code never registers (flat files) — the whole skill surface silently unregistered | Live measurement (2026-08-27; v27 bump note) | The external system's registration contract isn't visible to any unit test | Live-contract check against the real consumer |
| 10 | Reset + rename destroyed each site's publish key and never re-minted it; comments CLAIMED a re-registration schedule that never existed (2026-08-15) | Chasing the false comment | The lifecycle seam (key across reset/rename) had no test; comments substituted for verification | Cross-operation lifecycle test; comment-claims rule |
| 11 | DA.live editor URL double-appended `.html` → editor session 404, masked because the page still rendered (fixed 9aa1c279) | Live use | URL-shape contract with an external system; fixture invented rather than captured | Fixture-from-live-response rule |
| 12 | Config Service lookup key recorded backwards → silent bulk-publish failure | Live failure | Knowledge error; no live-contract check existed | Contract drift script (now exists: eds:drift) |
| 13 | `aemAuthorUrl` setting rename orphaned the user's override; a non-empty default absorbed it SILENTLY for ~6 months (rename Feb 2026) | Live investigation | Settings-migration seam untested; nothing asserts renamed keys carry over | Migration test over the settings schema |
| 14 | Tools answered errors as PROSE with `is_error:false` — four runs scored ok while the tool said "sign-in required" | The battery's route reading (2026-08-26) | Protocol-level success masked semantic failure; unit tests asserted the envelope, not the meaning | Semantic-failure checks (now in the battery + PROSE_ERROR flags) |
| 15 | The MCP response envelope regrew by hand in 10 of 23 modules after extraction (July→Aug) | Hand review | Convention had no check yet | Convention test (added — 28/28 since) |

## The tally — where escapes cluster

- **External-contract / live-behavior gaps: 8 of 15** (#6,7,8,9,11,12,13,14).
  Mocks are STRUCTURALLY blind here — no unit-test improvement fixes this
  class; only live verification, captured-from-reality fixtures, contract
  drift checks, and journeys do.
- **Mock-blindness on internal seams: 5 of 15** (#1–5). Fixed forward by the
  argument-assertion rule (post-August) — the witness census shows 47/54
  convergence files now carry that style.
- **Unchecked convention: 1 of 15** (#15). Fixed by the convention-test
  pattern.
- **Documentation-as-verification: 1 of 15** (#10) — a comment claimed what
  nothing checked.

## The catch record (what HAS been earning its keep)

- Real-SDK registration test: caught a schema error that had killed the
  ENTIRE tool surface for six commits.
- Count/version pins: caught the v30 bump miss same-day (2026-08-28).
- Envelope convention test: ended #15's class permanently (28/28).
- Argument-asserting suites: the style that would have caught #1–5; now the
  witness majority.
- Journeys + live probes: caught #6, #7, #8 — and the audit-harness'
  positive control caught the audit's own coverage bug.
- The battery: caught #14 and its own allowlist bugs.

## The verdict slate (for the owner's ruling — not yet codified)

The suite is strong and getting stronger on INTERNAL logic; the measured,
repeating hole is EXTERNAL truth. The strategy that the evidence supports is
three explicit tiers, each already practiced somewhere, none yet policy:

1. **Unit tier**: handed-in deps + argument assertions (the witness style) —
   the default for all logic. (Rides the ADR-015 conversion.)
2. **Contract tier**: fixtures captured from live responses, never composed;
   drift scripts for external contracts (eds:drift / data-installer:drift
   exist — the pattern generalizes).
3. **Live tier**: cloud-touching paths verified against the running system —
   journeys with zero-checks, probe verification after tool changes, and
   verify-after-write built INTO destructive operations (the AB-7 fix shape).

Codify nothing until these verdicts are ruled on.
