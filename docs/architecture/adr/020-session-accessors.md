# ADR-020: Session accessors — the one place other than the root that may construct

**Status**: Accepted (2026-08-29, owner-ratified; split from ADR-015 on 2026-08-30)

**Date**: 2026-08-29

> **Split out of [ADR-015](015-dependency-architecture.md) on 2026-08-30.** ADR-015 had
> accumulated seven rule sections across roughly seven pages, against practice that an
> ADR records *"a single decision"* in *"one or two pages"* (Nygard 2011). This is one of
> the decisions that had been appended to it. ADR-015 keeps the dependency-flow decision;
> the reasoning below is unchanged, only rehoused.

---

## Context

[ADR-015](015-dependency-architecture.md) rules that services are constructed in
`extension.ts` or a feature's `create...Deps` file. That rule has one exception, and it
went unwritten until the owner asked where it was documented — by which time two more
`getX()` modules had been written by copying a third that was permitted only by being
named in an enforcement allowlist.

A named exemption is not a principle: it explains one file and teaches nothing.

## Session accessors — the one construction site this ADR did not name

**Raised by the owner** 2026-08-29: *"our architecture ADR allows us to use
factories? Where is this principle documented?"* — after two `getX()` accessor
modules appeared the same afternoon, having been told that morning that factories
have no place here.

**It was documented nowhere.** `edsServiceCache` had done exactly this since
before the ADR, and was permitted by being named in the enforcement file's
allowlist. A named exemption is not a principle: it explains one file and teaches
nothing, so the next two were written by copying it and the ADR never learned.

**The rule, stated:**

> A **session accessor** is a module whose only job is to MEMOISE one instance of
> a service whose state must outlive a single call — `getX(...)` returning a
> module-level singleton, plus a `resetX()` for tests and host reload. It may
> construct. Nothing else may.

**Why it is not the "factory" that was rejected.** That proposal was
`helixForCodeSync(...)` / `helixForPublishing(...)` — several constructors for the
same class, chosen per call site, to make a credential set checkable. It creates
no instance identity and introduces a seventh element kind for a job the type
system already does. A session accessor creates exactly ONE instance and exists
for identity alone. Same syntax, opposite purpose.

**When it is warranted, and when it is not.** Only when the thing built
accumulates state that a second instance would fork. All three live cases are
caches: EDS clients (a token-validation cache), the component registry (a
transform memo), prerequisites (CLI results). A stateless service gets no
accessor — build it where it is used.

**Two lists, because they answer different questions.** The enforcement file
separates SESSION_ACCESSORS (memoise; build once however often called) from
per-call COMPOSITION_POINTS (assemble a fresh bundle each time). The lifetime rule
below applies only to the second. Before the split it excluded `edsServiceCache`
by filename, which is the same mistake as the allowlist — a name where a property
belongs.

**How the gap surfaced, because it is the durable part.** The architecture scan
reads `git ls-files`, so a NEW UNTRACKED FILE is invisible to every rule. The gate
ran green before the commit and the rule fired after it, against a file the
scanner could not see when it mattered. Both accessors reached `develop` that way.

## A cache is only as useful as the lifetime of the object that owns it

Added 2026-08-29, and it is the same question the construction rule asks, aimed at
TIME instead of COUNT. That rule asks *would a second instance fork this state?*
This one asks *does this instance live long enough for its state to be worth
carrying?*

**A composition point that runs more than once must not construct a class that
accumulates state.** `extension.ts` runs once, so it may. `createPanelHandlerContext`
and `createHeadlessHandlerContext` do not: all six webview surfaces call the panel
one PER INCOMING MESSAGE — 17 call sites between them.

**The evidence.** `PrerequisitesCacheManager` exists to skip repeated CLI checks;
its own header says a hit is under 10ms and a miss is 500–3000ms, for "95%
reduction in repeated prerequisite checks". It is an instance field of
`PrerequisitesManager`, which the panel composition point builds. So it is empty
every time it is consulted, and cannot hit — pinned in
`tests/features/prerequisites/services/prerequisiteCacheLifetime.test.ts`, whose
CONTROL shows the cache works fine when one manager is reused, so the fault is
lifetime and not a broken cache.

**Three caches of this kind exist, and the comparison is the whole rule:**

| Cache | Owner built | Hits? |
|---|---|---|
| `AuthCacheManager` | once, in `extension.ts` | yes |
| `edsServiceCache` | module-level, memoised | yes |
| `PrerequisitesCacheManager` | per message | **never** |

Same pattern three times; the only variable is how long the owner lives.

**It caught a change made the same day.** `ComponentRegistryManager` memoises
`transformToGroupedStructure` in `transformedRegistry`, and was moved INTO the
panel composition point that morning — a change that removed three dynamic
imports and an 18-suite mock wall, and did nothing for caching, because it went
from "three sites each building one per call" to "one factory building one per
message". Neither shared. The rule says so; the commit message did not.


## Consequences

**Positive.** One instance means one cache, so the memo actually pays. The `resetX()`
half makes the singleton testable, which is what keeps it from becoming a hidden global.

**Negative.** A session accessor is a module-level singleton, which is the shape this
architecture otherwise rejects. It survives on a narrow justification — identity — and
that justification has to be checked each time, not assumed.

**Neutral.** The enforcement file separates `SESSION_ACCESSORS` (memoise) from per-call
`COMPOSITION_POINTS` (fresh bundle each time). The lifetime rule applies only to the
second.

## Alternatives rejected

**Per-call-site factories** — `helixForCodeSync(...)` / `helixForPublishing(...)`, several
constructors for one class chosen by caller, proposed to make a credential set checkable.
Rejected: it creates no instance identity and adds a seventh element kind for a job the
type system already does. Same syntax as a session accessor, opposite purpose.

**Leaving it as an allowlist entry.** That is what existed. It permitted one file by name
and taught nothing, so the next two were written by imitation and the ADR never learned.
