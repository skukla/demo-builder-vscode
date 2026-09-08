# Acting before reading, and claiming before verifying

Research run 2026-09-08 at the owner's direction, after a session in which the
same two failures happened repeatedly: claims stated confidently and then
retracted on investigation, and a duplicate test enforcer written without
checking whether one already existed.

**Question.** What do the software industry and the agent-research literature do
about an agent that (a) restates a claim it read as though it had verified it,
and (b) writes code before reading what already exists? Which mitigations are
enforceable by tooling, which are behavioural, and what are the residual error
rates?

**Mode.** External, across four independent provenances so they could disagree:
academic agent-failure research, practitioner coding-agent engineering,
human-factors safety engineering, and software-engineering research on duplicate
implementations. Grounded at the end against this repo's own harness.

---

## The short answer

**No approach drives either failure to zero, and three unrelated literatures say
so with numbers.** Anyone offering a complete fix is selling something.

But the evidence is not "nothing works". It is much sharper and more useful than
that: **mitigations that consult an external oracle work; mitigations where the
model checks itself do not, and several make things measurably worse.** That one
distinction organises everything below.

---

## 1. Zero is not available

**Human reliability.** The nuclear-industry handbook (Swain & Guttmann, THERP,
NUREG/CR-1278, 1983) gives a nominal human error probability of **3×10⁻³** for
routine errors of commission and omission. The lowest rate ever recorded, for a
trivially small, well-designed, tightly controlled action, is about **3×10⁻⁵**,
and the handbook states that an estimate below **5×10⁻⁵** means the analysis
itself needs re-examining.

HEART (Williams, 1986) makes the ceiling explicit. Its most favourable category
for a human operator (completely familiar, well-designed, highly practised,
performed several times per hour, highly motivated, fully aware of the
implications of failure, with time to correct) still carries a generic error
probability of **4×10⁻⁴**. The only category reaching 2×10⁻⁵ is the one where an
automated supervisor has already interpreted the system state and the human
merely confirms it. **The last order of magnitude comes from machinery, not from
a better operator.**

**LLM reliability.** No mitigation in the corpus reaches zero. Best residuals
found: API hallucination 1.07% in the easiest domain of one study and 31.53% in
its hardest; Chain-of-Verification leaves 28.6% of atomic facts unsupported; a
process reward model leaves 21.8% of MATH unsolved; Agentless leaves 68% of
SWE-bench Lite unresolved. Xu, Jain & Kankanhalli (arXiv:2401.11817) argue
formally that hallucination is unavoidable for a general problem solver; treat it
as a bound on ambition rather than a measurement.

**Duplicate detection.** Below.

---

## 2. The one finding that should drive design: external oracle or nothing

The strongest and most replicated result in the whole corpus. Five independent
groups, different tasks, different metrics, same direction.

Cleanest demonstrations, because each holds everything else fixed and varies only
the oracle:

| Study | Without external signal | With it |
|---|---|---|
| Self-Debugging (arXiv:2304.05128) | +2–3% (self-explanation) | up to **+12%** (unit tests) |
| CRITIC (arXiv:2305.11738) | −0.03 / +2.33 F1 (critique only) | **+7.7 / +12.4** F1 (tool) |
| Huang et al. (arXiv:2310.01798) | 95.5 → 91.5 → **89.0** (self-review) | **97.5** (oracle labels) |

**Verified directly at the source**, not via the researcher: the Huang et al.
abstract reads "LLMs struggle to self-correct their responses without external
feedback, and at times, their performance even degrades after self-correction."
Title and authors confirmed.

Supporting evidence that the model cannot judge its own work:

- Best mistake-finding accuracy on hand-annotated reasoning traces: **GPT-4 at
  52.87%** (arXiv:2311.08516). The same paper's control is devastating —
  backtracking from a *randomly chosen* location also improved traces, so part of
  the apparent benefit of "critique then retry" is just resampling.
- LLM-as-verifier false-negative rates of **95.8%** and **97.09%** on tasks where
  verification should be easy; the critiques fabricate their evidence
  (arXiv:2402.08115).
- In **54 of 56 experiments**, a model's ability to discriminate among its own
  prior generations was no better than generating (arXiv:2404.04298).
- Reviewing a whole agent trace with a model: best system **18.3%** joint
  accuracy on one benchmark, **5.0%** on the other (TRAIL, arXiv:2505.08638).

**The result that describes this failure mode exactly.** Olausson et al.
(arXiv:2306.09896) hand-coded 80 GPT-4 self-repair attempts: its feedback was
inaccurate **32 times out of 80** against 7/80 for human reviewers, and it
expressed uncertainty **0 times out of 80** where humans did so 7 times.
Replacing self-feedback with human feedback raised repair success **1.58×**.
Confident prose regardless of whether the diagnosis holds is a measured property,
not a discipline problem.

**One caveat aimed at the owner rather than the agent.** Sharma et al.
(arXiv:2310.13548): challenged with "I don't think that's right, are you sure?",
models wrongly abandon *correct* answers between **42%** (GPT-4) and **98%**
(Claude 1.3) of the time. Pushing back reliably surfaces real errors and also
induces false retractions. A quick fold is not evidence the original claim was
wrong.

**Corollary for context.** Yigit-Sert (arXiv:2606.07783, single-author preprint,
unreplicated) measures how often a model abandons its own correct answer when
given retrieved context: 37.8% with clean context, rising to 56.8% when the
context is poisoned, with confidence *rising* as the evidence degrades. Direction
agrees with ICLR-published knowledge-conflict work; treat the numbers as
indicative.

---

## 3. Failure (a) has no name

No paper names "restating a read claim as independently verified". It exists only
decomposed across three literatures: unsupported statement / citation
faithfulness (arXiv:2304.09848 measured only **51.5%** of generated sentences
fully supported by their citations), faithfulness hallucination
(arXiv:2311.05232), knowledge conflict and parametric override
(arXiv:2305.13300), and, in agent taxonomies, MAST's **FM-3.2 "No or incomplete
verification"** (8.2% of failures, arXiv:2503.13657) and TRAIL's "Tool Output
Misinterpretation".

Practically: naming it in this repo is coining, not adopting.

---

## 4. Failure (b) is named, measured, and unsolved

**It is the second most common reason agent pull requests get rejected.** Ehsani
et al. (MSR 2026, arXiv:2601.15195) hand-coded 562 rejected PRs from 33k agent
PRs across five agents: **"Duplicate PR — work already exists" was 142, 23%**,
behind only "abandoned / not reviewed". Observational field data, no method being
promoted; the most trustworthy single number in this report.

**Agents do not see existing code.** A³-CodGen (arXiv:2312.05772) measures vanilla
GPT-3.5 at **precision 0, recall 0** on reusing local functions — it recognises
none of them, so "new functions are often defined to complete certain logic,
resulting in code redundancy". Repository context injection lifts that to F1
0.589, still missing roughly half. SWE-Explore (arXiv:2606.07297) finds general
coding agents reach line-level recall of only **0.14–0.19**, and that resolve rate
is threshold-like in context completeness: read too little and you fail, read
extra and you mostly get away with it.

**And detection is not available.** This is the finding that closes off the
obvious fix.

- Juergens et al. (CSMR 2010) ran ~400 students against one specification,
  behaviour pinned by a shared test suite, and ran clone detectors over every
  pair of 109 implementations: **full clone recall below 1%, partial below 10%.**
  (Attempted direct verification; the PDF would not extract. Cited on the
  researcher's reading, not mine.)
- Gabel & Su (FSE 2010, 420 MLOC) found **no significant redundancy above 60
  tokens.** At the size a real implementation occupies, source code is unique, so
  a token detector structurally has nothing to match on. The detectors are not
  badly tuned; they are aimed at a different phenomenon.
- The published deep-learning successes measured a broken benchmark: **93% of
  sampled semantic-clone labels in BigCloneBench are wrong**, threatening 139
  papers (arXiv:2505.04311).
- ArchUnit and dependency-rule enforcers answer "may A import B?", never "is B a
  second copy of A?".
- **CODEOWNERS structurally cannot catch this.** It routes on paths a PR touches.
  A duplicate is a new file in the author's own area, so the original's owner is
  never on the review.
- "Duplication" appears **nowhere** in the Microsoft modern-code-review taxonomy
  (Bacchelli & Bird, ICSE 2013, 570 comments card-sorted).

**Google places duplicate prevention before review, deliberately.** Software
Engineering at Google, ch. 9: search tools are "critical for both finding such
utility code and preventing the introduction of duplicate code. Ideally, this
research is done beforehand", and separately "a code review is not an occasion to
rehash or debate previous design decisions."

**The only measured prevention is delivery, not gating.** Ye & Fischer, ICSE 2002
(CodeBroker): the system watched what the developer typed and pushed candidate
components into the editor unasked. **Verified from the paper's own text:** "Five
subjects who had extensive software development experience voluntarily
participated"; "The 12 programs created by the subjects used 57 distinct
components, 20 of which were delivered by CodeBroker"; "Of the 20 reused
components that were delivered, the subjects did not anticipate the existence of
9"; "those 9 components could not have been reused without the support of
CodeBroker, and the subjects would have created their own solutions instead."

n = 5, 2002, never replicated at scale. But it is the only thing in the corpus
that measurably stopped a duplicate being written, and its mechanism is the
existing thing *arriving* at authoring time rather than a check failing later.

---

## 5. The constraint on any fix: the guard budget is global

This is the finding that changes the plan, and it is the best-quantified material
in the whole survey.

- Process-safety guidance (HSE CHIS6, EEMUA 191) sets a ceiling of roughly **one
  alarm per operator per ten minutes**.
- At Texaco Milford Haven in 1994 the operators handled **275 alarms in the 11
  minutes** before the explosion. HSE's finding: "There were too many alarms and
  they were poorly prioritised." HSE names the exact pattern to avoid: hazard
  analyses "generate actions which result in a lot of 'quick fix' alarms being
  installed", then asks "Was the impact on the overall alarm burden on operators
  considered?"
- Joint Commission Sentinel Event Alert 50 (2013): **85–99% of alarm signals do
  not require intervention**; of 98 alarm-related sentinel events, 80 were deaths,
  and the single most frequent contributing factor was **"alarm signals
  inappropriately turned off"**. The guards existed and were switched off.
- HEART prices this directly: **a low signal-to-noise ratio is a ×10 multiplier**
  on error probability.

**So a low-precision guard does not merely fail to help. It degrades every guard
already in place.** "Add a rule per error class" is the documented route to a
guard set people disable.

Two further calibrations from the same literature:

**The strength hierarchy is published** (VA NCPS / IHI RCA² action hierarchy),
and its criterion is exactly the relevant one — whether the control depends on
memory and vigilance:

| Tier | Contents |
|---|---|
| Stronger | forcing functions and interlocks, physical/architectural change, simplify the process, standardise |
| Intermediate | redundancy, **software enhancements**, **checklists / cognitive aids**, reduce distractions |
| Weaker | **double checks**, **warnings and labels**, **new policy or procedure**, **training** |

Every instruction file, CLAUDE.md included, is in the weakest tier. That is not a
criticism of the document; it is its measured tier. Rusty Russell's API design
scale reaches the same place from software: documentation is level 3 of 10, "read
the documentation and you'll get it right".

**"Have something check it afterwards" is worth less than intuition suggests.**
THERP puts a checker's failure to detect another's error at 0.1 with written
materials, 0.2 without, and **0.5 for a second checker**, with the note "no credit
for more than 2 checkers". Checker and operator are explicitly not independent.

**And checklists are intermediate, not strong.** The founding surgical-checklist
result (Haynes et al., NEJM 2009: death 1.5%→0.8%) did **not** replicate when
mandated across Ontario (Urbach et al., NEJM 2014: 0.71%→0.65%, not significant,
with 98% of hospitals self-reporting use). The best explanation in the literature
is not that checklists fail but that they are recorded as used and not used:
observed compliance runs **9–60%** where self-reported runs 98%. THERP prices both
halves — a checklist with checkoff buys about **3×**, and "use a checklist
properly" has a failure probability of **0.5**.

One incidental result worth keeping: HEART rates "no obvious means of reversing an
unintended action" as a **×8** multiplier. This repo's first non-negotiable is
independently validated by human-reliability engineering.

---

## 6. What is already mechanised, and the exact gap here

**Read-before-write is solved for edits, in at least four independent harnesses**,
by the same trick: the edit tool refuses unless the agent can quote text actually
present in the file. Claude Code is the strictest, with three separate refusals
(never read, file changed since read, target text absent) plus a uniqueness
requirement. SWE-agent's windowed editor cannot express an edit to an unopened
file. Aider requires the file to be in the chat, which puts its full contents in
the prompt.

**Nobody has published an ablation showing any of this reduces defects.** The
people who ship the mechanism do not measure it. That is itself a finding.

**Creating a new file is ungated everywhere**, including here. Measured in this
repo on 2026-09-08:

| | |
|---|---|
| hook rules | 11 |
| hard stops (fire every time) | 8, all on Bash, all guarding a *silent* failure |
| once-per-session nudges | 3 |
| rules gating a file Write | **1** — `30-reuse-first`, once per session, `src/*/ui/*.tsx` only, and it explicitly excludes `tests/` |

The harness is a shell-safety system, and a good one. Its eight hard stops each
guard a command that looks like it worked: jest piping that reads as hung, an
unquoted glob that prints a zero looking like a result, a piped exit code where
failure reads as success, backticks in a commit message that silently delete a
word. None guards a loud, self-correcting error, which is the correct design.

**The duplicate enforcer written this session passed through the one door with no
guard on it.** Nothing fired, and nothing could have.

---

## 7. What follows

Ranked by evidence, with what each is expected to buy and what it cannot.

**1. For duplicates: deliver the existing thing, do not gate the new one.**
Detection is measured at under 1% recall for this class and the benchmark that
suggested otherwise is 93% mislabelled, so a "duplicate detector" is not
available at any price. The only measured prevention pushed the candidate at the
author before they wrote. Concretely here: when a new file is created in a
directory that has a registry (`tests/sop/` has one, and 46 suites), put the
registry in front of the agent. That is delivery, not a check, and it is the
CodeBroker mechanism. Expect it to help, not to solve: A³-CodGen's context
injection still missed roughly half.

**2. For claims: gate on facts, never on self-review.** Self-review is measured as
net negative, so a rule saying "verify before claiming" is predicted by the
evidence to do nothing. What works is a precondition that consults reality.
SWE-agent's staged submit is the only shipped example of the right shape: the
first submit does not submit, it stages the diff and prints it back. The counter
is in code, not in a prompt. Claude Code's `Stop` hook can refuse to let a turn
end and **ships empty**. Candidate preconditions, all facts rather than
judgements: the working tree is clean, the gate has run since the last source
edit, every commit carries its `Backlog:` trailer.

**3. Do not add a rule per error class.** The alarm literature is unambiguous and
this is the recommendation most likely to be ignored. Two or three high-precision
controls beat ten mediocre ones, and a low-precision control actively degrades the
set. The existing eight hard stops are high precision; keep that bar.

**4. Do not build a rule for loud errors.** Argument-order mistakes and quoting
slips announce themselves and cost one retry. Guarding them spends budget that
the silent failures need. The eleven existing rules already encode this
distinction correctly.

**5. Measure escapes, not errors.** Shingo's framing is the one that fits: errors
are inevitable, defects are not, and the job is to break the link between an error
and something reaching a durable artifact. Zero retractions is not an available
target. Zero retractions *that reach a commit, a document or a decision* is.

---

## Disagreements and gaps

- **Prevention over detection is consensus, not measurement.** No controlled
  comparison of control-type versus warning-type mistake-proofing exists. The
  ordering is mechanistic and expert-ratified; the magnitude is unquantified.
- **The action hierarchy has a live critique.** Wood & Wiegmann (2020) argue it
  targets active failures and so treats symptoms, while conceding their own
  proposed replacement is unvalidated.
- **CoVe is the one self-check with a real effect** (FACTSCORE 55.9 → 71.4), and
  its mechanism is decomposition plus denying the checker sight of the draft. It
  is self-reported by its authors, partially corroborated by an independent
  paper's baseline table.
- **LLM semantic-clone detection may be genuinely improving.** Kitsios et al. (ASE
  2025) report LLMs losing only ~3% F1 on unseen functionality against ~31% for
  trained classifiers. Measured on short, self-contained, I/O-specified functions,
  which is the easy end. Worth re-checking in a year.
- **Not established:** any measurement of an agent duplicating code that already
  exists *in the repository it is editing* (the closest proxies are duplicate PRs
  and reuse failure); any ablation of a read-before-write gate; any evaluation of
  RFC or design review catching duplicate work; whether MAST/TRAIL taxonomies
  transfer to single-agent coding agents.
- **A verification incident worth recording.** Checking the CodeBroker figures via
  an LLM-backed page fetch returned "16 subjects", "15 components delivered", "13
  reused", "8 unknown" in quotation marks. Extracting the PDF text directly gave
  five subjects, 57 components, 20 delivered, 9 unanticipated. Every fetched
  figure was invented. The check that resolved it was reading the artifact. This
  is section 2's finding reproducing itself inside the research that documents it.

---

## Sources

Agent failures and self-correction: arXiv:2503.13657 (MAST), 2505.08638 (TRAIL),
2601.15195 (agentic PR rejections, MSR 2026), 2606.07297 (SWE-Explore),
2312.05772 (A³-CodGen), 2310.01798 (self-correction, verified at source),
2311.08516, 2402.08115, 2404.04298, 2306.09896, 2305.11738 (CRITIC),
2304.05128, 2309.11495 (CoVe), 2305.20050, 2203.11171, 2303.11366 (Reflexion),
2407.01489 (Agentless), 2305.15334 (Gorilla), 2304.09848, 2305.13300,
2310.13548 (sycophancy), 2401.11817, 2606.07783.

Human factors: Reason, *Human Error* (1990) and BMJ 2000;320:768–770; Shingo,
*Zero Quality Control* (1986); Norman, *The Design of Everyday Things*; Swain &
Guttmann NUREG/CR-1278 (THERP, 1983); Williams (HEART, 1986); VA NCPS / IHI RCA²
action hierarchy; Haynes NEJM 2009;360:491–499; Urbach NEJM 2014;370:1029–1038;
Leape NEJM 2014;370:1063–1064; HSE CHIS6 and the Texaco Milford Haven report;
Joint Commission Sentinel Event Alert 50 (2013); Drew PLoS ONE 2014;9(10):e110274.

Duplication: Juergens CSMR 2010; Gabel & Su FSE 2010; Roy/Cordy/Koschke SCP 2009;
Deissenboeck CSMR 2012; Krinke & Ragkhitwetsagul arXiv:2505.04311; Kitsios ASE
2025 (arXiv:2510.04143); Ye & Fischer ICSE 2002 (verified at source); Bacchelli &
Bird ICSE 2013; Mäntylä & Lassenius TSE 2009; Sadowski ICSE-SEIP 2018; *Software
Engineering at Google* ch. 9; Xu et al. EMSE 2020.

Practitioner: Claude Code permissions and hooks docs; Aider `editblock_coder.py`
and `base_coder.py`; SWE-agent `windowed_edit_linting` and `review_on_submit_m`;
OpenHands `openhands-aci`; GitHub Copilot coding-agent risk docs; Cursor run
modes; Jules plan-approval docs; OpenAI structured outputs; Pydantic AI;
Guardrails AI; NeMo Guardrails; LangGraph interrupts; MCP tools specification;
Anthropic, *Writing tools for agents*; Rusty Russell's API design scale.
