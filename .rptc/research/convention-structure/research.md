# How do other people structure architectural conventions?

**Question** (owner, 2026-08-30): conventions group into strategies — caching, testing —
and some answer stance questions like *is this codebase functional or object-oriented?*
How should they be categorised, summarised for a human, and made enforceable?

Asked after we invented a two-level structure (a "Position" per topic, then atomic
conventions) without checking whether the field already had one. It does.

---

## The field has three layers, and we had reinvented two of them

**[arc42](https://arc42.org/overview)** — an architecture documentation template, in use
since 2005 — separates them into different numbered sections:

| arc42 | What it holds | Ours |
|---|---|---|
| §4 Solution Strategy | "core ideas and solution approaches" | the **Position** line per section |
| §8 Crosscutting Concepts | "practices, patterns, regulations or solution ideas… related to multiple building blocks" | the **conventions** |
| §9 Architectural Decisions | the decisions and why | our **ADRs** |

So the split we arrived at — approach, then rules, then reasoning — is the standard one.
That is reassuring rather than clever; it means the structure is unlikely to fight us.

## Conventions are grouped by TOPIC, and deliberately not exhaustively

arc42 on [§8](https://docs.arc42.org/section-8/) answers the categorisation question
directly. Concepts exist for **"conceptual integrity (consistency, homogeneity) of the
architecture"**, and the structural guidance is explicit:

> "Pick **only** the most-needed topics for your system and assign each a level-2
> heading."

Its worked examples are topics, not rules — logging, authentication/authorisation,
design patterns. Each topic then holds however many rules it needs.

**Two things follow for us.** Grouping by topic is right: "caching" and "testing" are
concepts, and the conventions beneath them are the implementation. And the instruction is
to be *selective* — a handbook that tries to state every convention becomes a document
nobody reads, which defeats conceptual integrity rather than serving it.

## Enforceability has a name: fitness functions

This is the useful find, because it is precisely the owner's goal and it already has
established vocabulary and tooling.

**[ThoughtWorks Technology Radar](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function)**
(Trial, May 2018), from *Building Evolutionary Architectures* (Ford, Parsons, Kua):

> "An architectural fitness function provides an objective integrity assessment of some
> architectural characteristics, which may encompass existing verification criteria, such
> as **unit testing, metrics, monitors**, and so on."

> Architects use them "to communicate, validate, and preserve architectural
> characteristics through **automated, continuous** means."

The term is borrowed from evolutionary computing, where a fitness function measures how
close a design is to its objective.

**Our nineteen `tests/sop/` suites are fitness functions.** So are the ten hook rules and
the release-cut scans. We built the mechanism without the name, which is why the handbook
describes them as an assortment ("enforced by…") rather than as one deliberate layer.

Two things the definition gives us that we were not doing:

1. **A fitness function protects a named characteristic.** Ours mostly protect a *rule*.
   "`architecture-rules.test.ts` enforces the fetch boundary" is a rule; the
   characteristic behind it is *testability* — code that fetches its own dependencies
   cannot be tested in isolation. Naming the characteristic explains why the rule is
   worth the friction.
2. **"Metrics and monitors" count, not just tests.** A release-cut scan that reports a
   number is a legitimate fitness function. We had been treating "enforced by a test" as
   the only real enforcement and everything else as a lesser "measured by".

---

## What this means for our handbook

**Keep the structure.** Position → conventions → ADR matches arc42's §4 → §8 → §9. No
change needed.

**Group by topic, and stay selective.** Ten topics is defensible. The pressure to capture
*every* convention should be resisted where a rule is genuinely minor — arc42's advice is
to pick only the most-needed, and a handbook nobody finishes protects nothing.

**Adopt the fitness-function framing for the enforcement layer.** Concretely:

- Say what characteristic each enforcer protects, not only which rule it checks.
- Treat scans and metrics as first-class fitness functions rather than second-class
  measurement.
- The handbook's scorecard (45 conventions, 36 enforced) becomes a statement about how
  much of the architecture is continuously verified — which is the number the owner
  actually wants to watch.

**One caution, from our own record rather than the sources.** A fitness function is a
measurement, and this programme found five measurements that scored shape rather than
substance. The `every-scan-declares-a-control` suite exists for exactly this. Adopting
the vocabulary does not exempt a new enforcer from proving it can fail.

## Sources

- [arc42 overview](https://arc42.org/overview) — the 12-section template, in use since 2005
- [arc42 §8 Crosscutting Concepts](https://docs.arc42.org/section-8/) — definition, motivation, the "pick only the most-needed" guidance
- [ThoughtWorks Radar — architectural fitness function](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function) — Trial, May 2018; definition and origin
- *Building Evolutionary Architectures*, Ford, Parsons & Kua — the source of the term (not read directly; cited via the Radar entry)

## Gaps

- **No real-world engineering handbook was examined.** Comparing against a published
  example — GitLab's handbook, Google's engineering practices — would test whether ten
  topics and 45 conventions is a normal size or an unusual one. Not done.
- ***Building Evolutionary Architectures* was not read.** The fitness-function material
  here comes from the Radar entry summarising it. The book categorises fitness functions
  (atomic vs holistic, triggered vs continuous) in a way that would likely sharpen how we
  classify our own enforcers, and that classification is not reflected above.
- **No source addresses the AI-agent reader**, which is the same gap the ADR research
  found.
