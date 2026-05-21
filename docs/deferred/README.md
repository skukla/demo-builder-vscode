# Deferred Work

Work that is **planned but not active**. Each file in this directory is a self-contained plan with the context, scope, execution batches, and kickoff prompt needed to pick the work up later — possibly months later, possibly by a different agent.

## Convention

- **Filename**: `YYYY-MM-DD-<short-topic>.md` — the date the work was deferred, not the date it'll be picked up
- **Required sections** in each doc: Provenance · Goal/Scope · Execution plan · Constraints · Kickoff prompt
- **Status changes**: when a deferred item is picked up, move the doc to `docs/research/` (active) or delete it once shipped (the commit history is the record)

This directory is the **single source of truth** for "things we explicitly decided to defer." If something belongs here it should not also live in `TODO` files, the CHANGELOG, or scattered comments.

## Index

### Structural baseline ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md))

Numbers-first measurement pass to map the codebase's actual size, complexity, and coupling after ~1 year of AI-assisted development. **Run after Cycle D ships.** Produces a report that informs subsequent trim cycles.

### Legacy / soft-deprecation cleanup ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md))

~30 inventoried items across `src/` — `@deprecated` JSDoc, "Kept for backward compatibility" type variants, deprecated API aliases. Spans many features outside the AI Layer Pivot scope. **3 zero-caller deletions are ready any time** if a small trim task is wanted between cycles. Full execution plan in batches L1–L5.

The legacy cleanup is **downstream of the structural baseline** — the baseline will probably surface higher-leverage trim targets, and the legacy items may rank lower than they appear today.
