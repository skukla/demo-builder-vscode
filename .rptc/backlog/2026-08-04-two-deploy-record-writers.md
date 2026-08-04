# The add path bypasses the "one deploy-record writer"

**Filed:** 2026-08-04
**Type:** Consolidation. Behaviour-preserving if done right.
**Origin:** Surfaced while fixing the failed-add debris — a failed add persisted
`status:'error'` with no reason, and nothing could say why.

## The inconsistency

`src/features/CLAUDE.md:123` documents the contract:

> `appBuilderDeployOutcome.ts` — `recordDeployOutcome`, the one keyed
> deploy-record writer every deploy path lands on.

It is not. `addAppBuilderComponent` builds its own state (`errorState` /
`meshState` / `integrationState` in `appBuilderComponentRunner.ts`) and writes it
through `persistResult` → `setAppBuilderComponent`, never touching
`recordDeployOutcome`.

That second writer is what dropped the failure reason: `recordDeployOutcome`
already merges `error` correctly —

```ts
if (outcome.status !== 'error') return undefined;
return outcome.error ?? existing?.error;
```

— including clearing a stale reason on a later success. The add path reimplemented
the write and omitted the field.

## Why it was not fixed with the bug

`recordDeployOutcome` merges onto an EXISTING entry (`...existing, ...outcome`).
A failed ADD has no existing entry — the add is what creates it — so the canonical
writer cannot be dropped in unchanged. Making it work means giving it a
create-or-merge mode, which is a refactor of the write path rather than a fix to
the reason being dropped. Out of scope for a bug fix; the fix passed the reason to
`errorState` instead, and its docstring points here.

## What to do

Give `recordDeployOutcome` an explicit create case (the identity fields
`kind`/`name`/`source` that `errorState` supplies today), then route the add's
success AND failure through it. Delete `errorState`/`meshState`/`integrationState`
once nothing constructs state outside the writer.

The payoff is the one this session kept paying for elsewhere: a field added to the
canonical writer reaches every path, instead of reaching whichever paths remembered.

## Risk

Moderate. The add path's states carry identity fields the redeploy path does not
need, so the merge has to distinguish "new entry" from "update". Well covered by
`appBuilderComponentRunner.test.ts` + `appBuilderComponentRunner-keyed-state.test.ts`;
the keyed-state suite exists precisely to pin which entry a write lands on.

## Related

The same class of defect three times on 2026-08-04: two mesh resolvers (removed the
wrong component), two status-dot implementations (one pulsed, one did not), and this.
Each was a documented single source with a live bypass.
