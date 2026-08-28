# Decisions that need the owner

Things the conversion work surfaced that are real choices, not discoverable
facts. Each one names what was measured, the recommendation, and what happens
if we do nothing.

---

## D-1. Should the handler context carry the shell executor?

**Raised** 2026-08-28, during the fifth conversion batch.

### What's going on, plainly

ADR-015 says only the outer edge of the app — commands, handlers, MCP tools —
is allowed to reach into the service registry and pull out a shared object.
Everything inside receives what it needs as an argument. That rule is working:
this batch moved five more files inside the line, and the checker confirmed
every new registry lookup landed on a legal edge.

But handlers already receive a bag of shared things (the logger, the state
manager, the VS Code context). The shell executor — the object that runs
commands like `npm install` — is not in that bag. So each handler that needs
it reaches for the registry instead.

That works in production. It costs something in tests: a test driving a
handler now has to load a fake executor into the registry before every single
test, because the shared test setup empties the registry after each one. I had
to add that to three test files in this batch alone.

### The choice

Put the executor in the handler bag. Then handlers stop reaching for the
registry entirely, and the test setup disappears — the fake just goes in the
bag the test already builds.

### What it would cost (measured 2026-08-28)

| | Count |
|---|---|
| Source files that take a handler context | 113 |
| Test files that build a handler context fixture | 143 |
| Registry lookups of the executor in handlers/commands today | 19 |

Most of the 143 test files would need one line added to a shared fixture
builder, not 143 separate edits — but the blast radius is the whole handler
layer, so it is not a change to slip into an unrelated batch.

### Recommendation

**Do it, as its own dedicated batch, after the current conversion queue is
empty.** Reasons, in order:

1. The per-test registry seeding I just added is the kind of thing that
   multiplies. Three files today; every future handler conversion adds more.
2. It removes 19 registry lookups outright rather than relocating them.
3. It is mechanical and provable — the tests either pass unchanged or they
   don't, and the architecture checker already measures the before/after.

**If we do nothing:** nothing breaks. Handlers keep fetching legally, and each
new handler test pays a three-line setup cost. The rule still holds either way.

### Not decided here

Whether the same argument applies to the other shared objects handlers fetch
(authentication, secrets). Same shape, same trade-off — worth answering in one
sitting rather than one object at a time.

---

## D-2. Is "a service builds its own helper" allowed, or does it converge too?

**Raised** 2026-08-28, when batch 8 cleared a file's fetching problem and left
its second problem untouched.

### What's going on, plainly

There are two lists of architecture debt, not one.

The first list — **fetching** — is what every batch so far has been draining.
A service reaches into a global registry mid-work to grab a shared tool. That
one is settled: ADR-015 says don't, and the list is shrinking batch by batch.

The second list — **building** — is different and has never been ruled on. A
service creates its own helper objects with `new`, rather than being handed
them. ADR-015 says construction belongs in startup or in a dedicated
"assemble this feature's parts" file. But 34 files do it inline, and every one
of those rows carries the same placeholder reason: *pending adjudication —
may be ratified*.

Nobody has decided. So the rows sit there, and the checker keeps them honest
(it won't let them be quietly deleted) but nothing drains them.

### Why this is a real question, not an oversight

Fetching and building fail differently.

**Fetching hides a dependency.** Reading the function signature tells you
nothing about what it touches. That is what made the tests need a fake registry
and what the conversions have been removing.

**Building states the dependency plainly** — the `new` is right there — but
hard-codes *which* implementation, so a test cannot substitute a different one
without intercepting the module.

They are not equally bad, and it is defensible to accept the second while
rejecting the first. That is exactly what needs deciding.

### What's actually in the 34 (measured 2026-08-28)

Ignoring `new Error`, `new Date`, `new Map` — plain language constructs nobody
means to ban — the real ones cluster tightly:

| Constructed | Times |
|---|---|
| HelixService | 11 |
| DaLiveContentOperations | 8 |
| GitHubTokenService | 7 |
| GitHubFileOperations | 4 |
| ConfigurationService | 4 |
| ComponentRegistryManager | 4 |

Five of those six are EDS network clients. That is one decision, not 34: the
EDS feature builds its clients where it uses them.

### Three options

1. **Ratify it.** Say construction of a feature's own clients is allowed inside
   that feature, note it in ADR-015, and delete the list. Cheapest; costs the
   ability to substitute those clients in tests without module mocks.
2. **Converge the clustered five.** Give the EDS feature one "assemble the
   clients" file, which is the pattern ADR-015 already names, and leave the
   long tail. Medium cost, removes most of the list.
3. **Converge all 34.** Most consistent, most work, and the tail is one-offs
   where the payoff is smallest.

### Recommendation

**Option 2.** The clustering is the argument: five of the six are the same
feature building the same kind of thing, so one file absorbs most of the list
and the remaining rows are individually judgeable rather than a backlog.
Option 1 is tempting but forecloses the test-substitution benefit exactly where
the network clients make it most valuable — those are the collaborators a test
most wants to fake.

**If we do nothing:** the fetching list drains to zero, this one stays at 34,
and the checker keeps it from rotting. Nothing breaks; the work is just never
finished.
