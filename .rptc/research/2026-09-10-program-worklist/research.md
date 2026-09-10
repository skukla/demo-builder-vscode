# The work list, remade — 2026-09-10

Rebuilt after a full pass over the program. 114 backlog items. Ranked against what
was actually measured rather than against how they were filed — which moved three of
them, though not all in the same direction: **two were finished and said otherwise,
one had never reached a user and said it had.**

After the pass: **57 shipped, 53 unfinished, 3 dropped, 1 superseded.**

The program is **14 active days old** (ADR-015/016 ratified 2026-08-28), 1,574
commits. Repo state right now: **1,555 suites · 29,351 tests · 0 errors · 13
warnings**, all thirteen `max-lines` in the judgement tier and none blocking CI.

---

## Tier 0 — resolved: two shipped, one demoted (3)

**Resolved 2026-09-10, and they did not all land the same way.** `shipped` means
done AND USED. The check that decided it: the last release is **v1.0.0-beta.145,
cut 2026-08-28** — before this entire program — and **1,628 commits sit on develop
unreleased**, all 46 CSS commits among them.

So the question is who each one's USER is:

- **PL-33 and PL-54 → shipped.** Their user is the build and the agent, and both
  have been used heavily since landing. PL-54's rules fired four times in real work
  the day they went in.
- **PL-21 → `built`, not shipped.** Its user is an SC, and no SC has seen it. Every
  phase of its sequence is complete and the fingerprint is clean, but user-facing
  CSS that has never been in front of a user is exactly what `built` is for.

| item | verdict |
|---|---|
| **PL-33** every convention enforced | **SHIPPED.** The last unenforced one — vendor CSS in the lowest cascade layer — went in at `b304e7a2f` once PL-21 made it TRUE rather than aspirational, and has run on every gate since. **109 conventions, all 109 enforced.** |
| **PL-54** nudge-rule coverage | **SHIPPED.** All 13 routing gaps closed; **25 hook rules, 25 proofs**, every rule naming a stated convention. Four of them fired in real work the day they landed. |
| **PL-21** CSS | **DEMOTED active → built.** Every ratchet is terminal — `!important` **0**, inline styles **0/0**, unlayered **0**, `vendorLayerBundles` **8 of 8**, 168 interaction cells with no regression — and its five-step sequence is complete. But it ships CSS to an SC, and no SC has run it. |

---

## Tier 1 — the one gated queue (1, and it is large)

### EDS-8 — 31 coupled god files

Re-valued **low → high** and re-homed `eds` → `platform` today, because its own body
said *"a guideline, not a gate: eslint does not flag these and CI does not fail"* —
which stopped being true on 2026-09-10.

**Now gated:** `tests/sop/god-file-ratchet.test.ts` pins `godFileCandidates` **68**
and `godFileCoupled` **31**, shrink-only; `.claude/hooks/rules/49-god-file.rule`
states the measurement when you edit an oversized file.

**Two numbers on purpose.** `decompose-god-file` is explicit that a file over
threshold WITHOUT coupling should be left alone, so the population is not the work
list. `appBuilderComponentRunner.ts` is 1,122 lines with 11 imports and a 7-symbol
surface; `edsPipeline.ts` is 973 lines with ONE export. Long, and not god files.

The queue, worst coupled first:

```
1082  vs 400   daLiveContentCopy.ts        1 seam cut, 3 left (~250/73/73 lines)
 929  vs 500   dashboardHandlers.ts        19 imports, 21 exports
 910  vs 500   appBuilderComponentHandlers.ts
 857  vs 400   authenticationService.ts    47-symbol surface — the worst coupling
 857  vs 400   githubFileOperations.ts
 857  vs 350   repoSelectionInline.helpers.tsx
 848  vs 400   daLiveBlockLibraryOperations.ts
 824  vs 400   helixService.ts
```

**Sizing it honestly:** one seam took a full working block including re-anchoring 8
mutation-ledger rows. 31 files is a program, not a sitting. The ratchet is what makes
it safe to do slowly.

---

## Tier 2 — built, waiting on use (4)

`built` means code landed and nobody has used it. Only a person closes these.

| item | what to do |
|---|---|
| **AB-7** *(high, and it is a real defect)* | `remove_integration` reports success while leaving deployed code running in the Runtime namespace. The manifest goes clean; the code does not. **This one is user-facing and silent** — it should be verified before anything in Tier 3. |
| **PL-14** ADR-016 enforcement tooling | Seven artifacts built; waiting to be lived with. |
| **EDS-12** reset parity | Resetting the same EDS project does less from the dashboard than from the projects list. Two code paths, one job. |
| **PL-21** CSS *(joined from Tier 0)* | Needs a release cut, or an owner pass in the Extension Development Host: hover and focus on the layered surfaces, sidebar tile labels, terminal output on a light theme, the Manage APIs list. |

---

## Tier 3 — open high questions (5)

These have no "done"; they close on evidence.

| item | the question, and what would answer it |
|---|---|
| **PL-42** | Read the redundancy lists and delete what pins nothing. Concrete, mechanical, and the lists already exist. |
| **PL-50** | 160 modules measured against suites that merely share their name. Mutation mean is **90.9% across 622 modules**, so the headline is healthy — this asks whether the attribution is real. |
| **PL-46** | Functional testing that drives real VS Code, and where to start. The one gap no current instrument covers. |
| **AI-1b** | 104 tools, agents reach 20 of them. |
| **AI-8** | Audit the context files against what the research actually says. |

---

## Tier 4 — active epics, and what each is really waiting on

| epic | open children | blocked on |
|---|---|---|
| **PL-30** the four-track program | 7 of 12 | Tracks 1 and 2 done; 3 and 4 substantially done. What remains is Tier 1 plus PL-26/PL-27. |
| **PL-11** test health | 3 of 12 | PL-29 needs it |
| **PL-29** Track 2 docs | — | **NEEDS PL-11** |
| **AI-1** agent surface | 5 of 16 | AI-1a and AI-1b both need AI-1c |
| **AI-2** see what the agent is doing | 1 of 3 | — |
| **AB-1** App Builder app family | 3 of 5 | children gated on AB-1 |
| **AB-6** event-provider lifecycle | — | active; pulled off develop in `4a3889049` |

---

## Tier 5 — the rest

**25 med**, **13 low**. Nothing in either tier is blocking anything above it. Notable
only because they are mis-filed rather than unimportant:

- **PL-39** — "an item can be marked done while its own body says what is left."
  This session hit exactly that four times.
- **PL-27** — "is any of our 37 skills doing a job a check should hold?" Today
  converted three skills' guidance into hook rules, which is a partial answer.
- **PL-51** — test suites rebuilding a mock wall their family helper already owns.
  Adjacent to Tier 1's method.

---

## The order I would take it

1. **AB-7** — verify it. It is a shipped defect that reports success, and everything
   else here is internal.
2. **Cut a release.** This is the finding underneath Tier 0 and it applies to
   everything: 1,628 commits and 46 CSS commits sit on develop, and the last tag is
   from before the program started. Nothing user-facing from these 14 days has
   reached anyone.
3. **EDS-8, one file per block** — start with `daLiveContentCopy`'s three remaining
   seams, then `dashboardHandlers`. The ratchet holds the line between sessions.
4. **PL-42** then **PL-50** — both are reads over lists that already exist, and PL-50
   decides whether the 90.9% mutation figure means what it appears to.
5. **PL-46** — the only genuinely uncovered surface.

## What this list is NOT

It does not re-litigate anything shipped, and it does not carry the 55 finished items
forward. It also does not promote a `low` item because it is easy — the ranking is
"what is blocked until this exists", which is what `value` is supposed to mean here
and mostly does.

---

## Added 2026-09-10 — the release bar, and a gap the count could not report

### If `built` becomes the release bar

It moves **four** items from "waiting" to "releasable": PL-14, AB-7, PL-21, EDS-12.
Done goes **57 → 61 of 115**.

But the number is not the point. The bar change does not alter what is on develop —
**1,628 commits, 46 of them CSS, and the last tag predates the program.** Under a
`built` bar those are releasable NOW, which makes "cut a release" the immediate
action rather than a later one. `built` also stops meaning "waiting on a person" and
starts meaning "in the next cut", which is a cleaner definition: `shipped` then
records that it actually reached someone, instead of blocking on it.

The one caution: three of the four are `high` and one of them (**AB-7**) is a defect
where `remove_integration` reports success while leaving deployed code running.
Releasing on `built` means releasing that fix unverified. Worth verifying that single
item before the cut rather than adopting a slower bar for everything.

### PL-55 — two architectural domains have no convention at all

Filed today, after the owner said the architecture program had conventions never
started. Checked, and it is right.

**109 conventions, all enforced** is a completeness-shaped number that measures
something else: how many of the rules we WROTE DOWN are checked. It cannot report the
ones never written. Sixty-eight of the 109 are UI and tests — the two tracks that
actually ran — and two domains got nothing:

- **Reversibility: zero.** It is non-negotiable #1 in `CLAUDE.md` — *"a thing that
  cannot be undone is a finding"* — with no convention and no enforcer. The one
  reversibility-adjacent convention gates an irreversible agent tool behind
  `confirm: true`, which is a different rule. **AB-7 is what an unenforced principle
  looks like in production.**
- **Error handling: zero**, in both the handbook and the generated index, against a
  `src/core/errors/` that exists and a global SOP that names the rule. Verified with
  two positive controls (cascade layers 17 lines, dependency injection 4), so the
  search was aimed correctly.

This is the same shape as the god-file finding hours earlier: a stated rule with no
cadence. **A convention count cannot report its own gaps** — something has to compare
the rules against an independent list of what the codebase says it cares about.
