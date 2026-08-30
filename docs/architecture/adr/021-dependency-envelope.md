# ADR-021: The dependency envelope — one bundle per feature, and only two kinds

**Status**: Accepted (2026-08-30; split from ADR-015 the same day)

**Date**: 2026-08-30

> **Split out of [ADR-015](015-dependency-architecture.md) on 2026-08-30.** ADR-015 had
> accumulated seven rule sections across roughly seven pages, against practice that an
> ADR records *"a single decision"* in *"one or two pages"* (Nygard 2011). This is one of
> the decisions that had been appended to it. ADR-015 keeps the dependency-flow decision;
> the reasoning below is unchanged, only rehoused.

---

## Context

[ADR-015](015-dependency-architecture.md) says dependencies "arrive as parameters" and
that a feature's `create...Deps` file builds the bundle. It never said **how many bundles
a feature gets**, so the answer became one per function.

## The dependency ENVELOPE — one per feature, and only two kinds

This ADR said dependencies "arrive as parameters" and that a feature's
`create...Deps` file builds the bundle. It never said **how many bundles a feature
gets**, so the answer became "one per function". Six services need a GitHub token
service; they receive it six different ways:

| File | Receives it as | Through |
|---|---|---|
| `authoringExperienceFlip` | `context.secrets` | `AuthoringExperienceFlipDeps` |
| `configSyncService` | `secrets` | `ConfigSyncParams` |
| `catalogPrewarmPhase` | `context.context.secrets` | `HandlerContext` |
| `edsContentSetup` | `deps.secrets` | `EdsContentDeps` |
| `templateSyncService` | `this.secrets` | class constructor |
| `updateCore` | `ctx.secrets` | `UpdateContext` |

Measured 2026-08-30: `create...Deps` — the pattern this ADR named — exists **4
times in the repo**, while `eds` alone defines **35** distinct `*Deps` / `*Params`
/ `*Context` types, `project-creation` 13, `updates` 3. The named convention lost
to the unnamed one by an order of magnitude, because only one of them was written
down.

**THE CONVENTION. A function or class may receive its dependencies in exactly two
envelopes, and they are not interchangeable:**

1. **SERVICES arrive in the feature's ONE deps bundle** — the type its
   `create...Deps` file builds, named `<Feature>Deps`. One per feature. A service
   that needs a collaborator takes it from that bundle; it does not get its own
   bespoke bundle type.
2. **DATA arrives as ordinary parameters** — config values, ids, callbacks,
   progress reporters. A per-function `XParams` object holding only data is fine
   and expected; that is not what this rule is about.

**The line between them is "would I otherwise have constructed or fetched this?"**
If yes it is a service and belongs in envelope 1. If it is a value the caller
already had, it is data and belongs in envelope 2.

**Forbidden, and why:**

- **A per-function type that carries SERVICES.** This is the thing that produced
  six shapes for one dependency. It is invisible per file — each looks tidy — and
  only shows up when you ask how many ways one collaborator is delivered.
- **A service taking `HandlerContext`.** That is a boundary type carrying the whole
  world; a service that accepts it has fetched by another name, with the hidden
  dependencies this ADR exists to remove. Commands, handlers and MCP tools take
  `HandlerContext` — that is their contract. Services do not.
- **Mixing services and data in one bespoke type.** `UpdateContext` and
  `ConfigSyncParams` both do this, which is why neither could be replaced by the
  shared accessor without changing every caller.

**Status: GUIDANCE, not enforced.** No check counts envelopes today. The
construction rule already flags the *symptom* — a service building its own
collaborator — and that ledger is where these six appear. What was missing was any
statement of what to do instead, so each fix invented its own answer. Enforcing the
envelope itself needs a detector that can tell a service from a value, which is a
judgement a regex does not make; until one exists, this section is what a reviewer
points at.

**Migration is by ledger, not by sweep.** The existing bespoke types are not
violations to be fixed on sight — they are the state this rule was written to stop
growing. Convert one when you are already changing the file, and prefer collapsing
a feature's several bundles into its one `<Feature>Deps` over adding a seventh.

**Where a reasonable person differs:** the alternative is to hand each service its
collaborator as a bare parameter and have no bundle at all. That is the most
faithful reading of "dependencies arrive as parameters", and it was rejected here
only because a service needing four collaborators then takes four parameters that
every caller must thread. The bundle is the concession; making it one per FEATURE
rather than one per FUNCTION is what keeps the concession from becoming the drift.


## Consequences

**Positive.** One collaborator is delivered one way, so a service can be moved or a
dependency swapped without six different call shapes to reconcile.

**Negative.** Converting an existing service changes its signature and every caller,
which is why migration is by ledger rather than by sweep.

**Neutral.** Nothing enforces the envelope; the construction rule flags the symptom (a
service building its own collaborator) and the ledger is where those appear.
