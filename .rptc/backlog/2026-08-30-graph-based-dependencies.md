---
id: PL-23
kind: feature
area: prerequisites
needs: []
value: low
status: backlog
---

# Graph-based dependency system

**Moved out of `docs/architecture/` on 2026-08-30.** It had sat there since being
written, describing "the planned evolution" of the prerequisite/plugin model — a
proposal, not architecture. Nothing had been built and no item tracked it, so a
reader of the architecture directory could not tell it apart from a description of
the system as it is.

## The problem it proposes to solve

Prerequisites can have "plugins", and that parent-child relationship is hardcoded to
one level. Anything needing a different shape — a component depending on another
component, a plugin needing its own prerequisite — has nowhere to go.

## What it proposed

Any entity may declare a relationship with any other, with install order derived by
topological sort and cycles detected rather than hanging.

## Before building it

The proposal predates the current model and its central claim should be re-checked:
`perNodeVersion` and the plugin mechanism have both changed since. Confirm the
two-level limit is still what hurts, and on which real case, before designing for it.

## The original document

Preserved in git history — `git show <sha>:docs/architecture/graph-based-dependencies.md`
— rather than carried forward, since its "Current State" section describes a model
that has already moved.
