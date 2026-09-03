# Everything left over, in one place

**Swept 2026-09-02** across 865 commits since 25 August, all 97 backlog items,
every shrink-only ledger, and every docblock in `src/` and `tests/`.

## The headline

The backlog is doing its job. Of 143 "we're not doing this now" statements in
commit messages, only 12 had no live item behind them — and 10 of those are
design decisions that were correct to make, not work anybody deferred.

**The leak is somewhere else.** Eighteen items are marked **shipped** or
**built** and still name work inside them. Nobody re-opens a finished item, so
that work is invisible: it doesn't appear in `next`, it isn't `stale`, and no
check looks for it. That is the class the WebviewClient leftover belongs to, and
it is the only category here that was genuinely lost rather than parked.

---

## A. Finished items that still name work — the invisible 18

These are marked done. They aren't.

### Marked `built` (code landed, not verified by use) — 5

| Item | What's actually left |
|---|---|
| **PL-38** | 34 `vscode` walls and 23 `WebviewClient` walls still hand-written. The 21 that delegate to local handles need those handles renamed across each suite and its consumers. Mechanical, wide, wants its own change. |
| **PL-13** | 10 `constructionBoundary` exemptions — six are the same shape (a service building its own `GitHubTokenService` instead of asking `edsServiceCache`), so probably one batch, not ten decisions. Plus 4 `layerDirection`. |
| **PL-31** | 22 pure re-export barrels left, and exactly one genuinely mixed (`project-creation/helpers/index.ts`, which declares `validateField`). |
| **PL-9** | Says "re-run the scan before working". Now stale in the good direction: the clone ledger is at **zero outstanding**. Worth closing. |
| **AB-7** | Fix shipped; **live proof still pending upstream**. |

### Marked `shipped` — 13, of which these carry real work

| Item | What's actually left |
|---|---|
| **PL-1** | The legacy manifest read path is still load-bearing — old manifests convert in memory on every load and are never rewritten. Two phases were designed and neither ran. Half the repo's `legacy` mentions depend on this. |
| **PL-8** | A named dedup worklist "one tidy pass" — never done. Overlaps what today's burn-down covered; needs re-measuring before trusting. |
| **PL-2** | Directories carrying recorded "leave" verdicts that were never revisited. |
| **PL-12** | A `pattern-conformance-scan` skill, conditional on the audit yielding ≥3 enforce verdicts. |
| **AB-6** | Research complete and narrowed; the headful drawer surface is unbuilt. |
| **AI-2d** | Owner-approved, designed, unbuilt. |
| **AI-1q** | Three native-competition datapoints recorded, not acted on. |
| **AI-1e** | An instruction for next time, not work: measure a deferred payload before calling a round trip waste. |

The rest (PL-28, AB-1d, AI-1d) name decisions already taken or things
deliberately excluded — no action.

---

## B. Ledger balances — quantified, guarded, grindable

Each of these is a number a check refuses to let rise. They are the honest size
of the remaining cleanup.

| Ledger | Balance |
|---|---|
| `canonical-fakes` — casts to a type that HAS a builder | Project **145**, Partial\<Project\> **38**, HandlerContext **13**, ExtensionContext **6** |
| `canonical-fakes` — every `as T` counted on the syntax tree | HandlerContext **100**, Logger **98**, StateManager **63**, CommandExecutor **9** |
| `type-erasing-casts` | `as any` **241**, `as never` **190** |
| `mock-wall-import-order` | **10** suites import their subject before the wall that mocks it |
| `clone-pairs` | **0 outstanding** (2 adjudicated) — finished today |
| `test-family-setup` | **0** |

The two cast ledgers are the big ones and they measure different things on
purpose — the smaller number was once reported as if it were the whole picture.

---

## C. Exclusions recorded only in code

Real work, written in a docblock where no index can see it. (Excluded from this
list: ~90 docblocks that say "deliberately" about a design decision — those are
rationale, not debt.)

- **~15 test families** carry the same sentence: *"Resolving the disputed ones
  is a separate decision, deliberately not taken here."* Each shares only the
  mocks every suite agreed on and leaves the disputed ones inline. Picking
  winners would change what some suites exercise while all stayed green — a real
  decision, taken nowhere.
- **`executorComponentLoading.testUtils`** — `executor-edsStandardFlow` mocks
  the same set plus four more; a superset, never compared.
- **`aiBundleFsMock`** — two suites not covered, each for a stated reason.
- **`daLiveContentOperations.testUtils`** — three suites keep their own
  `mockFetchResponse`; twelve suites use three different token literals.
- **`edsResetService.sharedMocks`** — `edsPipeline` excluded although two of
  three share it.
- **`stylesheet-bundles`** — duplicate global/inline CSS blocks not deleted:
  the global copies carry `!important` and the inline ones don't, so removing one
  changes which declaration wins.
- **`inExtensionMcpServer.testUtils`** — `connectAndInit` and
  `serverInfoOverSocket` still call `net.connect` with no timeout.

---

## D. Already visible — no action needed to find it

38 items sit in `backlog`, `active`, `open`, `gated` or `spiked`. They show up in
`backlog.mjs next` and need nothing from this sweep. The generated index at
`.rptc/backlog/README.md` is their home.

---

## The systemic gap, and the fix

An item can be marked `built` or `shipped` while its body still says what's left.
Nothing catches that:

- `backlog.mjs stale` finds work-in-progress items with **nothing** recorded — the
  opposite problem.
- `unlogged` finds commits that name an item but never reached it.
- Neither reads a finished item's body.

**Proposed check** for `rptc-hygiene-scan`: flag any item at `shipped` or `built`
whose body contains a forward-looking remainder ("remaining", "next step",
"follow-on", "not yet done") with no child item and no `superseded-by`. Today
that fires 18 times, which is the right first result for a check nobody has run.

The alternative — banning such sentences — would be worse. The sentences are
valuable; they just need somewhere to be seen.

---

## Postscript — what the two goal runs cost and produced

Distilled from the stream-json logs before they were deleted. The logs were
8.5 MB of raw transcript; the commits are the record, so only these numbers were
worth keeping.

| run | item | turns | tool calls | outcome |
|---|---|---|---|---|
| 2026-09-02 23:37 | PL-32 | 675 | 460 | 431 casts removed, both ceilings to zero |
| 2026-09-02 23:37 | PL-16 | 135 | 63 | two families closed; stopped early on a condition that meant "lower", not "done" |
| 2026-09-03 06:37 | PL-16 | 533 | 330 | 134 sites read, 128 converted, 6 dispositioned must-stay |

The middle row is the lesson. Same item, same machine, a quarter of the turns —
because the condition was satisfied by the first successful batch. Rewriting it
as *converted + must-stay = 134, ceiling equals the must-stay count* produced
four times the work and the artefact that was actually wanted: the six files
that cannot convert, each with the branch that depends on the key a builder
would supply.
