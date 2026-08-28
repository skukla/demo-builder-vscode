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
