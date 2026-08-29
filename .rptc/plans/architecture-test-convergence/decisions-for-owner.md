# Decisions that need the owner

**Scheduled:** D-2 is the next work item once the fetching list reaches zero —
it is not parked. The owner asked for it to be revisited rather than filed
(2026-08-28). Until they pick an option, the loop's default is the
recommendation below (option 2), executed the same way the fetch conversions
were: one batch at a time, each gated, each shrinking the list.

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

**Raised** 2026-08-28 when batch 8 left a file's second problem untouched.
**REVISITED and largely ANSWERED the same day** at the owner's request. The
first version of this entry offered three options and a recommendation based on
counting. Reading the code changed the answer, so that version is replaced.

### What reading the code showed

The question assumed nobody had decided. Somebody had.

`src/features/eds/handlers/edsServiceCache.ts` already IS the "assemble this
feature's clients" builder the earlier recommendation proposed inventing. It
builds the four GitHub clients and the DA.live auth service, it CACHES them, and
ten call sites use it. So the policy question is settled in the code: this
feature assembles its clients in one place.

That splits the 34 rows into two genuinely different groups.

### Group 1 — real debt, with a measurable cost (13 files)

Thirteen files build their own `GitHubTokenService` instead of asking the
builder for one:

    cleanupDaLiveSites · storefrontSetupPhases · storefrontSetupHandlers
    configSyncService · authoringExperienceFlip · syncStorefront
    templateSyncService (x2) · updateCore · executorEdsPhase
    edsContentSetup · catalogPrewarmPhase · diagnostics

This is not a style preference. `GitHubTokenService` holds a `validationCache`
— the cached result of validating a token against GitHub, i.e. a network call.
A fresh instance starts with an empty cache. Thirteen bypassers therefore
re-validate against GitHub instead of reusing an answer the builder already has.
That is the cost, and it is why the builder caches in the first place.

**Verdict: fix.** Route them through `getGitHubServices` where the handler
context is reachable. Some are services holding only `secrets` and no context;
those need the token service handed in instead, which is the ADR-015 shape and
the same work.

### Group 2 — variants, correctly built where used (the rest)

`HelixService` (11 sites), `DaLiveContentOperations` (8) and
`ConfigurationService` (4) all take a **token provider** — per-project auth that
differs by call site. They are not one object rebuilt; they are differently
configured instances for different jobs. Two `new HelixService(...)` calls a few
files apart pass entirely different arguments: one a DA.live token provider, one
a GitHub token service, one neither.

Caching them behind a shared builder would serve the wrong credentials. Building
them where they are used, with the auth that call needs, is correct.

**Verdict, first pass: ratify.** That was HALF RIGHT, and the owner caught the
other half by asking whether this is the right way to handle variance. It is
not. See D-3.

### Group 3 — still open (4 files)

`ComponentRegistryManager` is built inline in projectResetService,
deployMeshHeadless and componentUpdater. It is not an EDS client and the token
argument above does not apply to it. It reads a config file from the extension
path. Whether that deserves a shared builder is a smaller, separate question —
left open rather than folded into an answer it does not fit.

### What this changes about the earlier recommendation

The earlier entry recommended "converge the clustered five" on the strength of
the counts. That was wrong about four of the five: clustering by TYPE NAME is
not evidence they do the same job, which is the repo's own standing rule about
name matches. Reading the constructors is what separated them.

**If we do nothing:** the 13 keep re-validating tokens against GitHub, and 17
correctly-written rows keep implying work that should not be done.


---

## D-3. Optional constructor parameters are the wrong way to express which credential a call needs

**Raised by the owner** 2026-08-28: "is this the right way to handle variance?"

### The short answer

No. The variance is real; the way it is expressed is not safe.

`HelixService` takes three OPTIONAL constructor parameters — a logger, a GitHub
token service, and a DA.live token provider. Different operations on it need
different credentials: minting a publish key needs the DA.live provider,
code-sync needs the GitHub one. Because all three are optional, **every
combination compiles**, including the ones that cannot work.

### The evidence that this bites

Two facts, both read from the repo rather than reasoned about:

1. **A call site passes `undefined` positionally to skip a parameter:**
   `new HelixService(logger, undefined, tokenProvider)` in
   `pdp/publishKeyRegistrar.ts:87`. That is the visible symptom of a shape
   asking the caller to pick a combination rather than a job.

2. **It has already caused a live failure.** The witness for reset step 7
   (`tests/features/eds/services/reset/edsResetConfigStep.test.ts:13`) records incident 2 in its own
   words: "the tokenProvider reaches HelixService — without it the CDN keeps
   serving a stale config.json (401, seen live 2026-08-15)". A HelixService
   built without the right credential compiled, ran, and left the CDN serving
   stale config until someone noticed in production.

Across 11 construction sites there are at least five distinct argument shapes.
The knowledge of which credential each operation requires lives as convention
spread over eleven files, and nothing checks it.

### The shape that would fix it

Replace the optional-parameter constructor with named factories that express
the JOB, each taking the credential that job actually requires:

    helixForPublishing(daLiveTokenProvider, logger)   // publish keys, config.json
    helixForCodeSync(githubTokenService, logger)      // code sync, preview
    helixForStatus(logger)                            // read-only status

A call site then picks a job, not a combination, and the compiler rejects a
publishing call built with GitHub credentials. The variance stays — it is real —
but it becomes a small closed set of named, checkable cases instead of eight
possible tuples of which some are silently wrong.

### Why this is NOT just "converge them into a shared builder"

The earlier group-2 reasoning was right that these instances must not be cached
or shared — the credentials genuinely differ per call. It was wrong to conclude
that constructing them inline is therefore fine. Both can be true: build at the
point of use, AND make the required credential impossible to get wrong.

### Recommendation and why it needs a decision rather than a quiet fix

**Do it, but not unattended.** Every other conversion this session was
behaviour-preserving and provable by unchanged tests. This one changes which
credential reaches a network call, and the failure mode is exactly the 2026-08-15
incident: it compiles, it runs, and the damage shows up in production later.
The mapping from each of the 11 sites to a named factory needs a human who knows
which operation each one is performing.

**Scope:** 11 construction sites, one class, plus the same question for
`DaLiveContentOperations` and `ConfigurationService` (which take a required
token provider and are therefore already safer — they may need nothing).

**If we do nothing:** the shape that produced one live 401 stays in place, and
the next call site to guess wrong fails the same silent way.

### MEASURED 2026-08-29, and it corrects the proposal above

Every construction site was read — both what it PASSES and what it then CALLS.
Two things change:

**There are 14 sites, not 11.** The three missed ones (`edsResetService` has two,
`contentAuthoringTools`, `catalogPrewarmPhase`) all pass both credentials.

**The proposed factory set does not fit the evidence:**

| What the site passes | Sites | D-3's factory |
|---|---|---|
| BOTH github + daLive | **10** | none proposed |
| github only | 2 | `helixForCodeSync` |
| daLive only | 2 | `helixForPublishing` |
| logger only | **0** | `helixForStatus` — no users at all |

So `helixForStatus` would be speculative, and the majority case — a flow doing
code-sync AND publishing, which every reset/setup/republish path is — has no
factory at all. Naming three jobs when the real distribution is 10/2/2 pushes ten
sites back onto the raw constructor, leaving the hazard where it is.

**The ten:** storefrontSetupPhases, storefrontRepublishService, edsResetService
(x2), edsResetConfigStep, refreshBlockLibraryHeadless, authoringExperienceFlip,
edsContentSetup, contentAuthoringTools, catalogPrewarmPhase.
**The two github-only:** configSyncService, checkGitHubAppHandler — both call
only `previewCode`.
**The two daLive-only:** publishKeyRegistrar (`createAdminApiKey`),
projectDeletionService (`deleteAdminApiKey`, `listAllPages`, `unpublishPages`).

### What the evidence supports instead

Three factories sized to the actual distribution, each taking its credentials as
REQUIRED parameters:

    helixForCodeSync(githubTokenService, logger?)        // 2 sites
    helixForPublishing(daLiveTokenProvider, logger?)     // 2 sites
    helixForSetupPipeline(github, daLive, logger?)       // 10 sites

The win is the one D-3 argued for, landing on the majority case rather than the
margins: on the ten, BOTH credentials become required, so the omission behind the
2026-08-15 stale-config 401 stops compiling. On the four, the compiler rejects a
publishing call built with GitHub credentials.

`helixForStatus` is not written until something needs it.

### ANSWERED 2026-08-29 by tracing, not by asking

The open question was whether the ten genuinely do both jobs. Traced each one to
the methods actually invoked — through the bundles and factories they are handed
to, not just the constructor call. **Seven genuinely need both. Three do not.**

The credential each method needs, read from `HelixAdminAuth`:

    getDaLiveToken()  <- previewPage, publishPage, createAdminApiKey,
                         deleteAdminApiKey, listAllPages, publishAllSiteContent,
                         previewAllContent, publishAllContent
    getGitHubToken()  <- getResourceStatus, previewCode, purgeCacheAll,
                         previewPage, publishPage

`previewAndPublishPage` calls previewPage THEN publishPage, so anything reaching
it needs both. That is what three of the passed-on instances turned out to be.

**Genuinely both (7)** — storefrontSetupPhases (pipeline: publishAllSiteContent +
purgeCacheAll + unpublishPages) · storefrontRepublishService (previewCode +
publishAllSiteContent + purgeCacheAll) · edsContentSetup (publishAllSiteContent +
purgeCacheAll) · contentAuthoringTools (preview/publish) · edsResetService:196,
refreshBlockLibraryHeadless and catalogPrewarmPhase (all reach
`previewAndPublishPage` — via blockLibraryPublish and PdpPublisher).

**Over-passing (3)** — each hands over a `daLiveTokenProvider` it never uses, and
calls only `previewCode`:

    edsResetService:100     variable is literally named helixServiceForCodeSync
    edsResetConfigStep:62   variable is literally named helixServiceForCode
    authoringExperienceFlip:155

Two of the three say what they are in the variable name. The type system had no
way to hold them to it.

**Already single-credential and correct (4)** — configSyncService,
checkGitHubAppHandler (github); publishKeyRegistrar, projectDeletionService
(daLive).

### NOT factories — the owner asked whether they belong here, and they do not

ADR-015 names six element kinds — Command, Handler, MCP tool, Service,
`create...Deps`, Accessor. Factory is not one, and the only element permitted to
construct outside `extension.ts` is a deps builder, defined as assembling **a
feature's service bundle** — not one object configured for one job. A factory
beside `HelixService` would also contain `new HelixService(` in a file that is
neither `extension.ts` nor `*Deps`, so it would ADD a construction-ledger row.
`helixService.ts` is in that ledger nowhere today.

So: no factories. That part stands.

### THE TRACE ABOVE WAS WRONG, and the incident's own witness test caught it

Attempted 2026-08-29 as a discriminated credential set — `job: 'codeSync' |
'publishing' | 'pipeline'`, each carrying exactly its credentials, all required.
Built it, converted all 14 sites plus 9 test constructions, both typecheckers
green. Three tests failed. One was this, in `edsResetConfigStep.test.ts`:

    hands the tokenProvider to HelixService — without it the CDN serves a stale config

That test exists BECAUSE of the 2026-08-15 incident. It failed on the change
meant to prevent that incident, which is the strongest signal available that the
change was wrong.

**The mistake:** the method→credential map was built with a regex looking for
`this.auth` / `getDaLiveToken` in each method body. `previewCode`, `purgeCacheAll`
and `getResourceStatus` reach the DA.live credential through a PRIVATE hop —
`this.tryAdminBearer()` → `auth.tryAdminBearer()` → `getDaLiveToken()` — which
the regex never followed. So all three were classified GitHub-only when they are
not.

**What follows:** the "three over-passers" were not over-passing.
`edsResetService:100`, `edsResetConfigStep:62` and `authoringExperienceFlip:155`
pass a DA.live provider because `previewCode` genuinely uses it.

### The real shape of the variance — and why a closed job set cannot express it

`tryAdminBearer` swallows its own failure, deliberately, and the comment says
why: *"Operations that never needed a DA.live token before must keep working
without one on an UNPROTECTED site; only a protected site actually requires it,
and there the 401 message says so."*

So whether a code-sync call needs the DA.live credential is a property of THE
SITE AT RUNTIME — is it access-protected? — not of the job being performed. A
`job: 'codeSync'` that FORBIDS a DA.live provider would have broken code-sync on
every protected site: the 401, the stale config.json, the 2026-08-15 incident,
recreated by the type meant to prevent it.

### What is actually true, and the two latent hazards it exposes

| Credential | Required by |
|---|---|
| GitHub | every Admin-API call: previewCode, purgeCacheAll, getResourceStatus, preview/publishPage |
| DA.live | all content ops (publish/list/unpublish, admin keys) AND any call above **on a protected site** |

Two sites pass GitHub only and call `previewCode`:

    configSyncService:170        previewCode(owner, repo, '/config.json')
    checkGitHubAppHandler:111    previewCode(...)

On an unprotected site they work. On a protected one they are the 2026-08-15
failure waiting to happen — the same call, the same missing header, the same
silent stale config. **Neither is currently in any ledger, because nothing
expresses this requirement.**

### Recommendation — needs the owner, and the question has changed

The safe shape is two jobs, not three, with DA.live required wherever the Admin
API is touched:

    { job: 'content';  daLive }            // publish/list/unpublish, admin keys — no GitHub needed
    { job: 'adminApi'; github; daLive }    // everything else; daLive required because
                                           // site protection is not statically knowable

That closes both latent hazards by construction. **Its cost is real and is the
decision:** `configSyncService` and `checkGitHubAppHandler` would have to obtain a
DA.live token provider they do not have today. That is not a mechanical edit —
it means finding the right provider at each of those call sites.

The alternative is to keep DA.live optional for admin-API jobs, document why, and
accept that the two sites stay latent.

**What I got wrong here, recorded because it is the useful part:** a regex over
method bodies is not a call graph. It missed one private hop and produced a
confident, wrong classification that survived a full build and both typecheckers.
The only thing that caught it was a test written by someone who had already been
burned by this exact failure.

---

## D-4. A class building its own private parts — not allowed, and now measured

**Raised by the owner** 2026-08-28: "a class building its own private parts —
why is it doing that? How is it allowed? That isn't part of our architectural
pattern, is it?"

### The answer: it is not allowed, and I nearly wrote an exception for it

ADR-015 says, verbatim: services are constructed in a feature's `create...Deps`
file "and those files, plus `extension.ts`, are the only places that construct
services." There is no exception for a class assembling its own helpers. And by
the ADR's own definition — "Service: owns a capability; the only layer doing
I/O" — a `ProjectFileLoader` that reads files IS a service.

So the 19 rows that had sat under "pending adjudication" for their whole life
are on the ledger correctly. While answering D-2 I was about to ratify them as
"internal composition, standard OO, fine." The owner asked the question that
stopped it. That category was invented in the moment and is not in the ADR.

### What it actually costs — CORRECTED 2026-08-28

The first version of this section ranked the 19 by "how many test suites
module-mock the parts this file builds", and put `WebviewClient` at the top with
59 suites. **That ranking was wrong**, and the owner's next question exposed it:
counting mocks says nothing about WHY a file is on the list. Three different
things were being counted as one.

Separating them:

| Category | Files | What it actually is |
|---|---|---|
| **Sibling service** | 27 | A service builds a DIFFERENT service. The real ADR-015 violation. |
| **Own parts** | 7 | A class builds its own private collaborators in its constructor. |
| **Self singleton** | 1 | A module exports one instance of the class it defines. Not composition at all. |
| **Self other** | 2 | A class instantiates itself outside a singleton export. Needs reading. |

Ranked by suites actually walled off:

**Sibling service — 27 files, 77 distinct suites.** The top six all wall off 41
suites each, and they cluster on the same three EDS clients:

    authoringExperienceFlip · refreshBlockLibraryHeadless · edsResetService
    storefrontRepublishService · edsContentSetup · projectDeletionService

**Own parts — 7 files, 19 distinct suites.** commandExecutor (13),
fileWatcher (12), authenticationService (6). The other four wall off NOTHING —
stateManager and three DA.live files build their parts and no suite has ever
needed to reach around them.

**Self singleton — 1 file, and it turns out it has no lawful alternative.**
`WebviewClient` is webview-side, and ADR-015's permitted construction sites are
all extension-side names. See PL-17: a third of the codebase is judged by a rule
that never scoped itself to them. That is a jurisdiction question, not debt this
program can discharge.

### Recommendation — revised with the corrected categories

**Start with the sibling-service group, not the mock counts.** Twenty-seven
files, seventy-seven suites, and — the part the first ranking missed — six of
them do the SAME thing: build an EDS client (Helix, DA.live content,
Configuration Service) inline for their own use. Those six are one piece of work,
not six, and they are the same six that EDS-11 is about. Fixing the credential
shape and handing the clients in are the same edit.

**Then the three own-parts files that cost something**: commandExecutor (13
suites), fileWatcher (12), authenticationService (6).

**Leave the four own-parts files that cost nothing** — stateManager and three
DA.live modules. They violate the rule as written and wall off zero suites.
Convert them when their file is touched for another reason.

**WebviewClient is not this program's to fix.** It is webview-side, and PL-17
asks whether the rule reaches webview code at all. Until that is answered, any
"fix" here is guessing at a rule that has not been written.

**Every ledger row now carries its measured reason instead of "pending
adjudication."** That phrase appears zero times in the file. A row either names
the suites it walls off, or says plainly that its cost is currently zero.
