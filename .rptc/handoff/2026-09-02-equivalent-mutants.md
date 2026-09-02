# Equivalent mutants found while working the worklist

Mutants that cannot be killed by any test, with the evidence. Recorded rather than
worked around, per the mutation skill: the honest end state for a module is "every
decision either constrained or marked equivalent WITH A REASON", not "all killed".

## installHandler.ts:424 — `prereqId === 'node' &&` is redundant (4 mutants)

```ts
function buildFinalStatusMessage(prereqName, prereqId, installResult, finalNodeVersionStatus) {
    if (prereqId === 'node' && finalNodeVersionStatus && finalNodeVersionStatus.length > 0) {
```

**Why no test can kill them.** `finalNodeVersionStatus` is assigned in exactly one
place — inside `if (prereq.id === 'node')` at line 655 — and the same `prereq.id` is
passed as `prereqId` at line 456. The two are perfectly correlated by the only caller,
so the first conjunct can never be false while the others are true. Flipping it changes
nothing observable.

**Verified:** `buildFinalStatusMessage` has one caller (grep across `src/`), and
`prereqId` appears nowhere else in the function besides that guard.

**The decision for the owner, and why the loop did not take it.** The conjunct is dead,
which makes `prereqId` a dead PARAMETER — a four-line simplification (drop the
conjunct, drop the parameter, update one call site), provable by the suite.

The loop filed it instead of doing it because the only reason to make the change is a
mutation score, and editing production code to move a metric is exactly what should not
happen while nobody is watching. It is also defensible to leave: the guard is defensive
for a second caller that does not exist yet.

**Either answer is fine; a third is not** — do not "fix" it with a test that contorts
the caller into producing the impossible combination.

**If kept**, the honest record is a disable comment naming the reason:

```ts
// Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: the
// only caller sets finalNodeVersionStatus exactly when prereq.id === 'node', so this
// conjunct cannot be independently false — equivalent, not untested.
```

Note the imprecision if you do: Stryker's granularity is per-mutator-per-line, and this
line also carries mutants that ARE killed. Disabling those mutators there ignores the
killed ones too, lowering the denominator as well as the survivor count.
