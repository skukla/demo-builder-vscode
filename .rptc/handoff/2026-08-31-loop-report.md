# Loop report — 2026-08-31, Track 4

Branch `loop/2026-08-31-track4`, pushed. Gated at every commit: 1199 suites,
15525 tests.

## The short version

Track 4 was the last open track of the four-track programme. Its work is the
architecture exemption ledger — every file that breaks a rule the codebase now
enforces, each with a written reason.

**It went from 30 rows to 6, and every one of the 6 that remains is either
already ratified or a decision only you can make.** There is no mechanical work
left in it.

Two whole categories are now empty. `constructionBoundary` held 39 rows when the
bucket was first measured; `featureBarrels` held five. The barrel rule changes
character with that: it was a shrink-only ledger, and with nothing left to record
it is now a ban — a new feature barrel fails the build with nowhere to write it
down.

## What was fixed, and what it turned out to be

Very little of this was the tidy-up the rows described. In most cases the rule
pointed at a file and the actual defect was somewhere adjacent.

| The row said | What it was |
|---|---|
| `ProgressUnifier` constructs across a layer | Core's progress engine named a feature's type; the type belonged in shared vocabulary |
| Two commands live in `core/` | They were never core code — filed in the wrong directory for years |
| Five feature barrels | ADR-022 already ruled; `eds` had 41 export lines and five were ever used |
| Six types-purity rows | Three only needed type-only imports. The other three are RUNTIME CODE living in `src/types/` — a different problem than the row described |
| `DiagnosticsCommand` doesn't extend the base | It had no state manager handed in, so it fetched one from the global locator **four times** |
| Five files build their own GitHub token service | The shared accessor demanded a whole context to read a secrets store, so four of them *could not call it* |
| Handler builds a data-installer client | Its "warn once per endpoint" contract was silently broken — the dedupe lived on an object rebuilt every call |
| Manager builds its own cache | True, and the command above it was building a whole second manager with a second empty cache |
| Three `core/state` files reach into a feature | Two were modules misfiled in a feature directory; one is a real modelling question |
| Authentication barrel | **13 of its 14 test mocks were dead** |

## Your decisions — 6 open

Nothing here is blocked on effort. Each needs a call.

### 1. AB-7 — live proof of the integration-removal fix
Code shipped 2026-08-28 (`2b5be4ce0`) with its own suite. Proving it undeploys
touches live Adobe resources. Blocked once by a Console outage that only appeared
from inside the extension host.
**Do:** retry on your next real add/remove. If it fails only from the host, log
the request the SDK sends and diff it against a working call from outside.

### 2. `serviceLocator` names two classes it stores
Type-only imports of `AuthenticationService` and `SidebarProvider`. The ledger
said to extract interfaces — they are classes, and one has 44 public methods
across 855 lines, so the copy would be worse than the import. Converting callers
is not it either: all 48 are files the rule explicitly lets fetch.
**Recommend: ratify.** A locator has to name what it locates. The alternative is
typed tokens, which removes the naming but rewrites the DI shape and 50+ sites.

### 3. `errors.ts` is not a types file
Measured: converting every import to type-only produces 17 "cannot be used as a
value" errors. It declares error classes and the functions that build them.
**Recommend: move it** to `@/core/errors`.

### 4. `shell.ts` is not either
Same measurement, 1 error: it uses `os`.
**Recommend: decide on sight** — it may be one function away from being pure.

### 5. `typeGuards.ts`
Genuinely runtime: needs six values including `COMPONENT_IDS`.
**Recommend: ratify.** A type guard is the one kind of runtime code that belongs
beside the types it narrows.

### 6. `apiOwners` calls a feature's catalog loader
`core/state` resolves an App Builder catalog entry by calling into
`features/components`. Unlike its two siblings this is NOT a misfiled module: the
loader reads a catalog JSON shipped inside the feature and four features use it.
**The question is whether core/state should resolve a catalog entry at all, or be
handed the answer.** A modelling decision, not a move.

`CommandManager` is the seventh row and needs nothing: it is the registrar that
builds all 25 commands, so it cannot be one of them. Ratified in place.

## Found and not fixed

- **A flaky test.** `inExtensionMcpServer` → "reports the build label" timed out
  once under full-suite load, passed 3/3 alone, and passed with my changes
  stashed. A socket-binding race the suite's own comment says it makes visible
  rather than fixes.
- **`PR-1`'s status.** Its research and your direction shipped, but whether that
  makes it `planned` is a judgement about intent, not a fact on disk.

## Things worth keeping from how this went

**Two no-op edits.** Twice an edit was built on indentation reconstructed from
memory rather than read. The match failed, the file was never written — and the
checks then passed, on unchanged code. A green check after a no-op edit is
indistinguishable from a green check after a real one.

**A control that depended on a violation.** Retiring the last feature barrel
broke the rule's own positive control, which ended with "at least one barrel
exists". Cleaning the codebase broke the check that proved the rule worked. It
now asserts against literals plus a corpus-size floor.

**A test that went hollow.** Moving a dedupe to module scope made a
"the warning never contains a token value" assertion pass against an EMPTY call
list. It now asserts the callback fired before asserting what it did not contain.

**Two fixtures that were lying.** `{} as unknown as HandlerContext` and
`ctx as never` — both typechecked, both passed, because everything touching the
context was mocked. Narrowing one accessor exposed both.

## Record corrections

- `AB-7` backlog → built (its fix had shipped three days earlier; I recommended
  it as work off its title without reading its body)
- `AB-2` backlog → spiked · `EDS-6` backlog → gated, with `waiting-on` named
- `PL-13`'s prose claimed 75 ledger rows and 23 fetch-boundary files; the disk
  said 30 and 0
