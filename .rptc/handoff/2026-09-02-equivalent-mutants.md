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

## installHandler.ts:183 — `prereq.install?.dynamic` optional chaining (1 mutant)

```ts
const isDynamicInstall = prereq.id === 'node' && prereq.install?.dynamic;
```

Stryker replaces `?.` with `.`, which would throw if `prereq.install` were undefined.

**Why no test can kill it without lying.** `install` IS optional on
`PrerequisiteDefinition` (`src/features/prerequisites/services/types.ts:63`), so the
compiler requires the `?.`. But a prerequisite with no `install` cannot REACH this line:
`getInstallSteps` returns `null` for one
(`src/features/prerequisites/services/installation/InstallStepBuilder.ts`, first
statement), and the handler throws `No installation steps defined` on a null plan
(`installHandler.ts:605`) well before `executeInstallSteps` runs.

Killing it would mean mocking `getInstallSteps` to return a plan for a prerequisite that
has no install block — a combination the real collaborator cannot produce. That is the
contortion the mutation skill names, so it is recorded instead.

**Nothing to decide here** — unlike the `:424` entry below, this needs no owner call and
no code change. The `?.` is required by the type and correct as written.

**What the same measurement DISPROVED, so it is not assumed again.** The neighbouring
`prereq.id === 'node'` conjunct on this line LOOKED equivalent by the same argument
(a non-Node prerequisite never gets `targetVersions`, so both branches of the step-count
compute the same total). It is not: `isDynamicInstall` is read a second time at
`installHandler.ts:211`, where the dynamic path runs the install steps and SKIPS the
default step. A non-Node prerequisite declaring `dynamic` therefore loses its default
step if the guard goes. That mutant is now killed by a test, and the equivalence claim
was only avoided because the report was read per-mutant instead of reasoned about.

## installHandler.ts:76-81 — a whole branch that cannot run (5 mutants, NO coverage)

```ts
function determineNodeVersionsForInstall(prereq, nodeVersions, version) {
    if (prereq.perNodeVersion) { ... }
    if (prereq.id === 'node') {          // 76
        if (version) { return [version]; }   // 77-79
        return nodeVersions.length ? nodeVersions : undefined;   // 80
    }
    ...
}
```

Not a survivor and not equivalent — five mutants with NO COVERAGE, because nothing can
reach these lines. This is dead code, which this repo does not keep.

**The proof, in four steps, all in `installHandler.ts`:**

1. The function has exactly ONE caller — line 589, `targetVersions ||
   determineNodeVersionsForInstall(prereq, nodeVersions, version)`.
2. `targetVersions` is assigned in exactly one place, line 584, inside
   `if (prereq.id === 'node')` at line 581.
3. Line 583 returns from the handler when `resolveNodeTargetVersions` says
   `earlyReturn`, and that function returns `earlyReturn: true` for every case where
   `targetVersions` is missing or empty (lines 122-126). So if line 589 is reached with
   `prereq.id === 'node'`, `targetVersions` is a NON-EMPTY array.
4. A non-empty array is truthy, so `||` short-circuits and the call never happens.

Therefore the function only ever runs when `prereq.id !== 'node'`, and the branch at 76
is unreachable.

**What to do.** Deleting lines 76-81 is provable by the compiler and the suite, and this
repo's standing rule is that obsolete code is removed rather than left in place. The loop
did not do it for the same reason it left `:424` alone: this is production code in the
install path, the only thing pushing for the change is a mutation report, and neither of
those is a good enough reason to edit it while nobody is watching.

It is a few minutes of work with the evidence above already gathered.

**A caution if you take it.** The branch reads as the obvious behaviour for the Node
prerequisite — "use the explicit version if given". Someone will re-add it. If it goes,
the reason it CANNOT run belongs in a comment on the remaining function, or the deletion
will be undone by the next person who notices Node is unhandled there.

---

# Not a mutant: a safety annotation two tools disagree about

Found while writing tests for the annotations in `siteTools.ts`. Not a mutation finding
and not urgent — but it is about what an AGENT is told before touching a live storefront,
so it should not sit only in a session transcript.

`src/features/ai/server/storefrontTools.ts` declares `republish` and `sync_content` with
`annotations: { readOnlyHint: false, destructiveHint: true }`. Its own file comment
explains they need no confirm gate because they are "idempotent (safe to re-run) … same
class as the existing `sync_storefront` tool."

`sync_storefront` is declared `destructiveHint: false`.

So three tools the source calls one class carry two different answers to "is this
destructive", and the two that say yes are the two with no confirmation gate. An agent
reading `tools/list` is told these are destructive and simultaneously allowed to call
them unprompted.

**Two defensible fixes, and they point opposite ways** — which is exactly why this is
the owner's call and not the loop's:

1. If they really are idempotent, they match `sync_storefront`: `destructiveHint: false`,
   plus `idempotentHint: true`, which is the MCP annotation for the claim the comment
   already makes in prose and which no tool in this repo currently uses.
2. If pushing config and content to a live CDN IS destructive, then the annotation is
   right and `sync_storefront` is the one that is wrong — and the missing confirm gates
   are a real gap rather than a deliberate omission.

**Verified before writing this down:** descriptor-registered tools were checked first and
are NOT affected — they derive `readOnlyHint` from `readOnly` and `destructiveHint` from
`confirm` in `toolDescriptors.ts`, so the two vocabularies cannot drift there. A first
pass that read `readOnlyHint` across all 114 tools reported 48 of them as declaring no
annotations at all; that was the census reading the wrong field for the descriptor form,
not a gap. Only the `registerTool` form writes the annotation block by hand, and only
there can two tools of one class disagree.
