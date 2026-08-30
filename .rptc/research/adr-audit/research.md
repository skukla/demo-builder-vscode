# ADR audit — are these decision records, is the content true, how should they be kept?

Asked by the owner 2026-08-30, after a session in which two architectural conventions
turned out to be written down nowhere and a third (`src/features/CLAUDE.md` on barrel
files) turned out to be written down **wrongly**.

Three questions, answered in order: *are they truly ADRs*, *is the content valuable
and still true*, and *how should this be structured so it stays true*.

---

## The measurements

Every number below is from a script, not a reading. "Cites" counts files outside
`docs/architecture/adr/` mentioning the ADR by number. "Broken refs" counts backticked
file paths that do not exist plus backticked camelCase identifiers that appear nowhere
in any tracked `.ts/.tsx/.mjs/.js/.json`.

| ADR | lines | cites | broken refs | last touched |
|---|---|---|---|---|
| 001 | 230 | **0** | 10 | 2026-02-27 |
| 002 | 278 | 8 | 2 | 2026-08-24 |
| 003 | 276 | 1 | 2 | 2026-08-24 |
| 004 | **502** | 8 | **24** | 2026-08-24 |
| 005 | 153 | 12 | 1 | 2026-06-12 |
| 006 | 221 | 53 | 1 | 2026-08-24 |
| 007 | 165 | 19 | 2 | 2026-08-24 |
| 008 | 229 | 12 | 2 | 2026-08-24 |
| 009 | 129 | 2 | 2 | 2026-06-19 |
| 010 | 124 | 2 | 0 | 2026-06-19 |
| 011 | 126 | 83 | 1 | 2026-08-13 |
| 012 | 158 | 3 | 0 | 2026-08-23 |
| 013 | 86 | 66 | 1 | 2026-08-14 |
| 014 | 202 | 4 | 1 | 2026-08-16 |
| 015 | **404** | **123** | 0 | 2026-08-30 |
| 016 | 249 | 60 | 0 | 2026-08-29 |
| 017 | 226 | 21 | 0 | 2026-08-29 |
| 018 | 234 | 5 | 0 | 2026-08-29 |

**Totals: 18 broken file paths and 31 broken identifiers across the set.**

The detector under-counts. It only matches a bare backticked identifier, so
`daLiveContentOperations.extractInternalReferences` in ADR-010 — a function that has
never existed under that name, in any commit except the ADR's own — scores as zero
broken symbols. Treat 31 as a floor.

---

## Question 1 — are they truly ADRs?

**Mostly yes, and that is the good news.** All 18 carry Context / Decision /
Consequences. Twelve also have an explicit alternatives-or-rejected section, which is
the part that makes a decision record worth keeping: it says what was *not* chosen and
why, which is the only thing a reader cannot reconstruct from the code.

Six are **thin records** — no alternatives section (002, 003, 004, 005, 012, 018).
That is not automatically wrong; 018 states a position on CSS and does not pretend
there was a contest. But it means those six answer "what did we decide" without
answering "what did we decide against", and the second question is the one people come
back for.

**One is not really a decision at all.** ADR-003 (Multisite Architecture Seam) opens
its Decision with *"No implementation today. Document the seam in this ADR and apply
two ongoing disciplines."* That is a deferral plus a coding standard. Its disciplines
ARE being followed — 11 sites default a new state field to `'main'` — so the content is
live; it is just not a decision record. It is a design note wearing an ADR's clothes.

**None has degenerated into a pure how-to guide**, which was the failure I expected to
find. The rule-word density is low everywhere. ADR-015 has the most imperative content
by far and still frames each rule as a decision with a rejected alternative.

---

## Question 2 — is the content valuable and still true?

Four groups.

### Live, healthy, load-bearing — 006, 011, 013, 015, 016, 017

Between 21 and 123 citations each, recently touched, **zero broken references in
015/016/017**. These are doing the job: they are cited from code, from tests, and from
skills, and their claims resolve. 015 alone is referenced by 32 source files and 73
test files.

No action beyond what question 3 proposes.

### Live but drifting — 002, 007, 008, 009, 014

Implemented and cited, with small factual rot:

- **ADR-009** points at `src/features/project-creation/config/demo-packages.json`. The
  file is at `src/features/components/config/demo-packages.json` — the catalog moved on
  2026-08-24 and the ADR did not. Its substance is intact: `configFlags` is real and
  present.
- **ADR-002** cites two `scripts/test-*.ts` files that no longer exist.
- **ADR-007, 008** each cite one or two dead paths.
- **ADR-014** names `CommercePartnersSDK`, which appears nowhere.

Each is a ten-minute correction, not a rewrite.

### Finished history — 001, 005, 010

The decision landed, stuck, and no longer needs to be reached for.

**ADR-001 is the clean case.** A rename of `externalSystems` to `integrations`, decided
2025-11-04. Verified today: the old name appears **0 times** in `src/` or `tests/`, the
new name is in the registry type and the config groups. The decision is completely and
durably implemented — and the document has **zero citations anywhere** and 10 broken
references, having been untouched for six months. It is 230 lines describing a rename
nobody needs to look up.

That is not a criticism of the ADR. It is what a finished decision looks like, and the
question is what the process does with one.

**ADR-010** is the same shape with a sharper edge: its named mechanism,
`extractInternalReferences`, has never existed. The real function is
`extractReferencedPaths`. The decision *is* implemented — reference-following content
copy is real — but the ADR points at a name that was invented when the document was
written and never checked against the code.

### Rotted and structurally broken — 004

502 lines. **Eight amendments**, stacked, each with its own "What this supersedes from
the prior amendment" section. **24 broken references**, including 23 of its 45
identifiers: `AiSetupTab`, `launchViaUri`, `getSpawnInjectDelayMs`,
`handleBrowseClaudeSessions` and twenty more that exist in no tracked file.

To know what ADR-004 currently says, you must read the original decision and then apply
eight amendments in order, each partially superseding the last. Nobody does that. The
practical effect is a 502-line document whose current position is unknown to its
readers — which is worse than no document, because it still looks authoritative.

**This is the one that needs restructuring, not correcting.**

---

## Question 3 — how to structure this for the long term

Four proposals, cheapest first.

### 3.1 An index, because "where is the rule for X" currently has no answer

The immediate trigger for this audit: over two days the owner asked three times where a
convention was documented (factories/session accessors, caching lifetime, dependency
envelopes) and twice the honest answer was "nowhere". A third — barrel files — was
documented, incorrectly.

ADR-015 alone now carries seven distinct rule sections, each added reactively after a
gap bit. There is no list of them. `docs/architecture/adr/README.md` does not exist.

**Proposal: a generated index** at `docs/architecture/adr/README.md` — number, title,
status, one-line decision, citation count, and whether anything enforces it. Generated,
because a hand-maintained index is the exact artefact this repo has already watched rot
twice (the backlog README, and `src/features/CLAUDE.md`'s barrel paragraph).

### 3.2 A status vocabulary that distinguishes "true" from "current"

Today's statuses are free text: "Accepted and Implemented", "Accepted (decision
recorded…)", "Implemented 2026-08-…", "ACCEPTED for NEW code". Nothing separates *this
is still how we work* from *this happened and is now just history*.

**Proposal — four values:**

| Status | Means |
|---|---|
| `Accepted` | Current law. Cite it, follow it. |
| `Superseded by ADR-NNN` | Replaced. Must name the successor. |
| `Historical` | Decision landed and is stable; kept for provenance, not guidance. |
| `Deferred` | A seam documented, no implementation. ADR-003 is the live example. |

ADR-001 becomes `Historical` — nothing about it is wrong, and that is precisely the
label it lacks. ADR-003 becomes `Deferred`.

### 3.3 Amendments fold into the decision; they do not stack

ADR-004 proves the failure mode at n=8. An amendment that leaves the original text in
place makes the reader responsible for resolving the document against itself.

**Proposal:** when a decision changes, EDIT the decision and record the change in a
short dated changelog at the foot. ADR-015's single amendment already does the right
thing — it restates the rule in full rather than diffing against the old one.

**ADR-004 specifically:** rewrite as one current decision plus a changelog, and let its
23 dead identifiers go with the amendments that named them. That is a rewrite, and it
needs someone who knows what the AI harness currently does — it should not be done
mechanically.

### 3.4 A citation check, because ADR rot is invisible today

31 broken identifiers and 18 broken paths accumulated with nothing reporting them. The
repo already runs `rptc-hygiene-scan`, which checks `file:line` citations in plans and
backlog items and **does not look at ADRs**.

**Proposal:** extend that scan to `docs/architecture/adr/`. The detector written for
this audit is about twenty lines and already produced the table above. Two cautions
learned while writing it:

- It must resolve dotted expressions (`module.function`), or it will miss the ADR-010
  class entirely — the exact case that motivated the check.
- It must report, never fail a build. An ADR naming a deliberately-removed symbol is
  sometimes correct ("we deleted `X`"), so a hard gate would force people to launder
  history out of the record.

---

## Recommended order

1. **Generate the index** (3.1). Cheapest, and it answers the question that started this.
2. **Add the status vocabulary** (3.2) and relabel 001 → Historical, 003 → Deferred.
3. **Fix the drifting five** (002, 007, 008, 009, 014) — paths and one identifier each.
4. **Extend the hygiene scan** (3.4) so this cannot silently recur.
5. **Rewrite ADR-004** (3.3) — largest, needs judgement about the current AI harness,
   and the only item here that is not mechanical.

## What this audit did NOT establish

- **Whether each decision is still the RIGHT one.** This checked whether the documents
  are true and reachable, not whether the architecture they describe is good. ADR-005
  (BYOM PDP routing) could be perfectly documented and strategically wrong; nothing here
  would show it.
- **Whether the six thin records lost a real alternatives discussion** or never had one.
  Recovering that needs the authors, not the files.
- **Whether ADR-012's decision is implemented.** Its Decision section did not parse into
  a testable claim and it has 3 citations; it was not chased further.
