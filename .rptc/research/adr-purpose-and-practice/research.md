# What are ADRs actually for? Purpose, detail level, audience, lifecycle

**Question** (owner, 2026-08-30): what is an ADR's true purpose; what is best practice on
detail level; are they guidelines, historical records for humans, or context for AI?

**Mode:** hybrid — external authorities for practice, our own measured audit for the
codebase half. **Sources fetched, not recalled**; every quotation below was read from the
page cited.

---

## 1. The original definition — Michael Nygard, 2011

[Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
is the primary source the whole field descends from. In his words:

- An ADR is **"a short text file in a format similar to an Alexandrian pattern"** describing
  **"a set of forces and a single decision in response to those forces."**
- Sections: **Title, Context, Decision, Status, Consequences.** Context "describes the forces
  at play, including technological, political, social, and project local".
- **"The whole document should be one or two pages long."**
- Write **"as if it is a conversation with a future developer"**, in **"full sentences
  organized into paragraphs"**. Nygard is blunt about the alternative: *"Bullets kill people,
  even PowerPoint bullets."*
- On change: **"If a decision is reversed, we will keep the old one around, but mark it as
  superseded. (It's still relevant to know that it *was* the decision, but is *no longer* the
  decision.)"**

Two constraints in that definition matter most for us, and both are easy to miss: **a single
decision**, and **one or two pages**.

## 2. Detail level — the consensus is "pithy", and explicitly not a guide

| Source | On detail |
|---|---|
| Nygard 2011 | "one or two pages"; prose, not bullets |
| [MADR](https://adr.github.io/madr/) | "a streamlined template"; context "in two to three sentences" |
| [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html) | "focuses on the reason for the decision rather than how the team implemented it" |
| [Microsoft Well-Architected](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record) (updated 2026-04) | "Keep records pithy, assertive, on-topic, and factual" |

Microsoft states the boundary the owner was really asking about, directly:

> **"Avoid making decision records design guides.** If more justification or design ideation
> is available, provide a link to a document as supplemental material, but the decision must
> be clear and stand alone without that material."

And on splitting:

> "Break one decision into multiple if an architectural decision is going to result in
> multiple phases, such as short-term, mid-term, long-term approaches. **Log each phase as its
> own decision record.**"

**So: an ADR is not a handbook.** Rules, procedures and how-to material belong in a guide the
ADR links to. The ADR carries the decision and the reasoning, and must stand alone without
the guide.

## 3. Audience — a future developer, and reviewers. Not, on this evidence, AI

**What the authorities say.** Nygard's stated audience is "a future developer" who would
otherwise be "perplexed, baffled, delighted, or infuriated by some past decision" without its
rationale. [ThoughtWorks](https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records)
(ADOPT since May 2018) names "future team members as well as… external oversight", and
recommends source control over a wiki "so they can provide a record that remains in sync with
the code itself".

AWS adds the one use that makes ADRs *behave* like guidelines: during code review, "a code
reviewer might find changes that violate one or more ADRs. In this case, the reviewer asks
the author of the code change to update the code, and shares a link to the ADR."

**So are they guidelines?** Functionally yes, at review time — but that is a *consequence* of
recording the decision, not the purpose. The document's job is to carry the *why*; the
enforcement is downstream. Microsoft's line is the discriminator: a record without
justification "loses its value over time as stakeholders can't evaluate whether the decision
still applies when circumstances change."

**On AI — the honest finding is that authority-backed guidance does not exist yet.**

- Of the five authorities read for this note (Nygard, MADR, ThoughtWorks, AWS, Microsoft),
  **none mentions AI, LLM or agent audiences at all** — including the Microsoft page updated
  2026-04-13, well after agentic coding tools were widespread.
- The strongest non-vendor source found runs the *opposite* direction: [Zhou et al., "Using
  LLMs in Generating Design Rationale for Software Architecture Decisions"](https://arxiv.org/abs/2504.20781)
  (TOSEM 2025) uses LLMs to **generate rationale for humans**, and reports modest precision
  (0.267–0.278) against better recall (0.627–0.715). It is not guidance on writing ADRs for
  machines.
- The "write ADRs for coding agents" position exists and is coherent — the argument being
  that a human reads a few ADRs occasionally and fills gaps with judgement, whereas an agent
  reads all of them every session under a token budget and acts literally — but as of this
  research it appears in **vendor and practitioner blogs only** (actual.ai, braingrid.ai and
  similar), not in any architecture authority.

**Treat "ADRs as AI context" as an unvalidated hypothesis, not established practice.** It may
well be right; nothing authoritative has said so.

## 4. Lifecycle — a real disagreement, preserved

**The dominant position is immutability.** Three independent authorities agree:

- **AWS**: "When the team accepts an ADR, it becomes immutable. If new insights require a
  different decision, the team proposes a new ADR." And: "Changes to an existing ADR requires
  creating a new ADR… the owner should change the state of the old ADR to **Superseded**."
- **Microsoft**: "The ADR serves as an **append-only log**. Don't go back and edit accepted
  records. If a decision changes, write a new record that supersedes the original and link
  the two together. This approach preserves the history of your thinking."
- **Nygard**: keep the old one, mark it superseded.

**The dissent is practical, and comes from the most widely-used ADR collection.** Joel Parker
Henderson's [architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record)
says plainly:

> "In theory, immutability is ideal. **In practice, mutability has worked better for our
> teams.**"

— recommending that new information be inserted into an existing ADR with a timestamp and a
note that it arrived after the decision.

This is a genuine split, not an error by either side. The immutable model optimises for an
accurate historical record; the mutable model optimises for a reader who wants one current
answer. **Both fail differently:** immutability scatters the current position across a
supersession chain, so the reader must assemble it; mutability destroys the record of what
was believed when.

Status vocabularies are consistent across sources: *proposed, accepted, rejected, deprecated,
superseded by ADR-NNNN*. Microsoft adds a useful one — record the **confidence level**, since
"an architecturally significant decision is made with relatively low confidence" and knowing
that helps future reconsideration.

---

## 5. What this means for our 18

### 5.1 We are far outside the stated length norm

Measured against Nygard's "one or two pages" (~500–1000 words):

- **4 of 18 are within it** — ADR-001, 009, 010, 013.
- **Median is 1,743 words — about 3.5 pages.**
- Largest: ADR-006 (4,053 words / 8.1 pages), ADR-004 (3,631 / 7.3), ADR-015 (3,362 / 6.7).

Length alone is not a defect. But it is the symptom the sources predict when a record starts
absorbing guide material, which is exactly what 5.3 describes.

### 5.2 ADR-004's eight amendments are the anti-pattern, by every source

502 lines, eight stacked in-place amendments each superseding the last, 23 of 45 identifiers
dead. Under Nygard/AWS/Microsoft this should have been **eight ADRs**, each superseding its
predecessor, each short. Even under Joel Parker Henderson's mutable model it is malformed —
he permits *appending* dated information, not eight partial supersessions the reader must
resolve.

**This also corrects a recommendation I made in the audit earlier today.** I proposed folding
amendments into the decision and keeping a changelog. That is against the dominant model:
three authorities say do not edit an accepted record. The better fix for ADR-004 is to
**split it into a chain of superseding records**, not to rewrite it into one current
document. I was wrong, and the source I should have checked first said so in 2011.

### 5.3 ADR-015 has become a handbook — and that is the hardest call here

It now carries **seven rule sections** (fetch/inject/construct, responsibility contracts,
session accessors, cache lifetime, the two enforcer rules, the dependency envelope, barrel
files) in 6.7 pages. Against Nygard's "a single decision" and Microsoft's "avoid making
decision records design guides", it is out of bounds on both counts.

**But it is also the most valuable document we have**: 123 citations, 32 source files, 73
test files, and a real enforcer suite. Splitting it would break those citations and scatter a
set of rules that genuinely interlock.

The literature's answer is to keep the *decision* in the ADR and move the *rules* into a
linked guide — which this repo already has a home for
(`docs/architecture/where-code-goes.md`). That is a real option, and it is not free.
**Flagging it as a decision for the owner rather than doing it**: the case for splitting is
conformance to practice; the case against is 123 working citations and an enforcer that
currently points at one document.

### 5.4 ADR-001 needs no defending — but my "Historical" label is an invention

Nygard *expects* finished decisions to sit there uncited: keeping the old record is the whole
point. So ADR-001 at zero citations is not rot; it is the system working.

However — **the four statuses I added to the index this morning (`Accepted`, `Superseded by`,
`Historical`, `Deferred`) are not a standard vocabulary.** `Historical` and `Deferred` appear
in none of the five sources. The standard set is *proposed / accepted / rejected / deprecated
/ superseded*. Our two extras are defensible (they name states we actually have) but they
should be recorded as a deliberate local deviation, not presented as best practice.

---

## Recommendations, revised against the evidence

1. **Adopt the standard status vocabulary** and mark our two additions explicitly as local
   deviations with their reasons. Cheap, and stops us inventing a private dialect.
2. **Split ADR-004 into a supersession chain**, not a rewrite. Revises this morning's advice.
3. **Decide on ADR-015** — leave as a handbook-in-an-ADR, or extract rules to
   `where-code-goes.md` and leave the decision. Owner's call; both costs are stated in 5.3.
4. **Keep the generated index.** It is the mitigation for the immutable model's one real
   weakness — a reader otherwise has to walk a supersession chain to find the current
   position. No source recommends an index; Joel Parker Henderson's collection gives no
   guidance on one at all. Ours is a local improvement.
5. **Do not restructure ADRs for AI consumption** on current evidence. If we choose to, record
   it as an explicit local bet, because no authority backs it yet.

## Gaps and limits of this research

- **Perplexity was unavailable** (network error after 3 minutes), so the AI-audience sweep
  relied on WebSearch plus one verified academic paper. A dedicated search of ACM/IEEE for
  2026 work on machine-readable architecture knowledge was not done.
- **ISO/IEC/IEEE 42010** (architecture description, which formally covers decision rationale)
  was not consulted. It is the one normative standard in this area and could change the
  detail-level answer.
- **The UK Government ADR framework** (reportedly November 2025) surfaced in search but was
  not fetched or verified; it is not relied on above.
- **Nothing here evaluates whether our decisions are correct** — only what an ADR should be
  and how ours compare in form.
