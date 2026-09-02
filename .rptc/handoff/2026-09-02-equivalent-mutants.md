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

---

# Not a mutant: a DA.live token is refused one way and accepted the other

Found while testing what a successful DA.live sign-in actually stores. Like the tool
annotations above, this is a decision rather than a defect — but it is about a
credential, so it should not live only in a transcript.

A DA.live token can arrive two ways, and they disagree about a token that states no
lifetime:

- **From the clipboard**, `validateDaLiveTokenStrict` refuses it, in those words: "This
  DA.live token carries no expiry, so it cannot be stored safely."
- **Typed into the box**, `validateAndStoreToken` uses the LENIENT
  `validateDaLiveToken`, which accepts it, and then stores it with an invented lifetime
  of 24 hours (`daLiveAuthPrompt.ts:503`).

So the same token is called unsafe on one path and given a made-up expiry on the other.
The clipboard path was hardened deliberately — there is a whole "clipboard token
identity" section of tests behind it — and the typed path appears simply not to have
been revisited.

**The options:**

1. **Use the strict check on both paths.** Consistent, and the refusal message already
   explains itself to the user. It would REJECT tokens that are accepted today, which is
   a behaviour change for anyone whose token genuinely carries no lifetime — worth
   knowing whether that happens in practice before choosing it.
2. **Keep the 24-hour default and drop the strict refusal**, on the grounds that a
   conservative default expiry is safer than refusing a working credential. Then the
   strict check's message is wrong and should go.
3. **Leave it**, if the clipboard path deserves to be stricter precisely because the user
   never looked at what they pasted. That is defensible — but it is currently implicit,
   and worth a comment saying so.

**Today's behaviour is now pinned on both paths** by
`tests/features/eds/handlers/daLive/daLiveAuthPrompt-tokenStorage.test.ts` and
`daLiveAuthPrompt-tokenStrict.test.ts`, so whichever way this goes, the test that has to
change is the one that says so in its own comment.

## daLiveAuthPrompt.ts:218 — an early return the next check already covers (2 mutants)

```ts
const clipped = (await vscode.env.clipboard.readText())?.trim();
if (!clipped) {
    return undefined;
}
const validation = validateDaLiveTokenStrict(clipped);
if (!validation.valid) { ...; return undefined; }
```

Deleting the empty-clipboard guard changes nothing observable: an empty string fails the
strict check on the next line and returns `undefined` by the other route. The only
difference is one debug log line, and asserting log text is exactly what the ratchet
refuses to reward.

**Nothing to decide.** The guard is not wrong — it skips a pointless validation call and
says what it means. It simply cannot be distinguished by a test, and that is worth
recording so the next person working this module does not spend an hour on it.

## stateManager.ts:144 — a timestamp that is read, defaulted, and then thrown away (3 mutants)

```ts
this.state = {
    version: parsed.version || 1,
    currentProject: validProject,
    processes: new Map(Object.entries(parsed.processes || {})),
    lastUpdated: new Date(parsed.lastUpdated || Date.now()),   // 144
};
```

All three mutants on that line survive, and no test can kill them, because the value
never reaches anything. Every read of `this.state.lastUpdated` in the file is at line
163 — inside `saveState`, nine lines after line 154 has already overwritten it with
`new Date()`. Nothing outside `stateManager.ts` reads the state file's `lastUpdated`
either (checked across `src/`; the other matches are unrelated `lastUpdated` fields on
component and manifest records).

So the parse, the `|| Date.now()` default, and the `Date` construction are all discarded.

**A small decision, and genuinely optional.** Either drop `lastUpdated` from the load —
it is written to the file and read back by nothing — or keep it, on the grounds that a
state shape should round-trip even where nothing currently depends on it. The first is
one line; the second wants a comment saying the value is deliberately unused, or the
next person will file this again.

## stateManager.ts:102 — a guard whose failure lands in the same place (2 mutants)

```ts
const parsed = parseJSON<{...}>(data);
if (!parsed) {
    this.logger.warn('Failed to parse state file, using defaults');
    return;
}
```

Removing the guard does not change the outcome. `parsed` is undefined, the next line
reads a property off it, that throws, and the surrounding `try/catch` swallows it into
exactly the same defaults the guard returns to. The only observable difference is which
of two log lines is written, and asserting log text is what the ratchet exists to refuse
to reward.

**Nothing to decide.** The guard earns its place by being explicit rather than by
changing behaviour — the reader should not have to know the catch is there.
