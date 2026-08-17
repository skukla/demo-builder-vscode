# Step 02 — `resolveCommerceCredentials` gains a broker fallback

**Repo:** this one. **Blocks release. Depends on step 01 being deployed** to
exercise live; the unit work can land first.

## Why

`resolveAccs` (`commerceCredentials.ts:117-123`) reads the declared pair and
returns `needs-accs-credentials` when there is none. For a project that selected no
App Builder components there will never be one. The fallback asks the shared
service instead.

## The seam, and the trap in it

**Two of the five call sites pass `{ project }` and nothing else** — no context, no
token, no service URL:

| Call site | Passes | After this step |
|---|---|---|
| `importHandlers.ts:258` (list scopes) | project + secrets + name | add broker |
| `importHandlers.ts:382` (prepareImport) | project + secrets + name | add broker |
| `exportHandlers.ts:168` | project + secrets + name | add broker |
| `sampleDataInstallDeps.ts:29` | **project only** | **must add broker** |
| `edsResetUI.ts:476` | **project only** | **must add broker** |

The bottom two are the ones this feature exists for. `sampleDataInstallDeps` is the
install that runs during project creation — precisely the no-App-Builder-components
path. If it keeps passing `{ project }`, the broker never fires where it matters
and every unit test still passes. **Write a test that fails if either of those two
call sites forgets the broker.**

`sampleDataInstallDeps` already has `context` in scope (`buildSampleDataDeps`
takes it). `edsResetUI`'s `confirmSampleDataRemoval` does not — it takes
`(project, vscode)`. Thread what it needs rather than reaching for a singleton.

## The property this breaks, honestly

The comment above `edsResetUI.ts:476` says the call "makes no network request at
all, it reads componentConfigs", and uses that to justify running before a modal.
**That becomes false.** Do not leave the comment standing — it is exactly the kind
of claim the next reader trusts instead of checking.

The call is still worth keeping ahead of the prompt (it replaced a three-minute
wasted reset), on three conditions:

- one GET, `TIMEOUTS.QUICK`
- any failure — timeout, 401, 403, no service configured — degrades silently to
  "no credentials", never to an error dialog
- the in-session cache below means the modal path pays for it at most once

## Approach

1. **`services/commerceCredentialBroker.ts`** — one function, no `vscode`, no
   ambient fetch. Injected `fetchImpl`, a token provider and a URL, the way
   `dataInstallerClient` is built. Returns `{ clientId, clientSecret } | undefined`;
   it never throws and never returns a reason string that could carry a secret.
   Model the request on `publishKeyRegistrar.ts:103-115` (Bearer + JSON) and the
   response unwrap on `commerceStoreDiscovery.ts:140-190` — including its
   status-plus-body error capture, which is what makes a 403 diagnosable from Debug
   Logs alone.
2. **URL derivation belongs in `accsDiscoveryConfig.ts`**, next to
   `selectDiscoveryService` (`:48-63`), not in `pdp404Snippet.ts`. Swap the trailing
   `/discover-stores` for `/get-commerce-credentials` and return `undefined` for
   anything that does not match that shape, so a misconfigured setting cannot build
   a request to an arbitrary host — the rule `pdp404Snippet.ts:285-297` already
   applies to its own sibling derivation.
   **Select with `project.adobe?.organization`**, the same argument the discovery
   path passes. Its documented fallback (matching `orgId`, else the first entry) is
   what serves a project with no Adobe binding. One selection rule, already tested.
3. **`resolveCommerceCredentials` gains one optional dep** — a
   `broker?: () => Promise<{ clientId, clientSecret } | undefined>`. Only
   `resolveAccs` consults it, and only after the declared pair comes back empty.
   PaaS must never reach it.
4. **One new `CredentialGap`, and only one** — `no-credential-service`, for "no
   discovery service is configured". That case is the user's to fix, and it is
   invisible today: riding on `demoBuilder.accsDiscovery.services` means a user who
   never set up store discovery gets no broker and no hint that one exists.
   A service that answers and has nothing, or refuses with 403, keeps the existing
   `needs-accs-credentials` — same remedy, supply a pair — with the distinguishing
   HTTP detail going to Debug Logs rather than into the type.
5. **A Diagnostics check.** `src/commands/diagnosticsChecks.ts` has no
   discovery-service check of any kind today. Add one that reports whether a service
   is configured and whether `get-commerce-credentials` answers, following the
   `ok`/`warning`/`unknown` split the other checks use. This is the other half of
   "ensure it happens": without it, a silently unconfigured broker looks identical
   to a feature that was never built.
6. **Cache in memory for the session**, keyed by resolved URL. One modal flow calls
   resolution several times (dry run, then start) and the endpoint should see one
   request. Clear on nothing; a process restart is the natural boundary.

## The rule that keeps consolidation real

**Never persist the brokered pair — not to `componentConfigs`, not to
SecretStorage.** `provision-accs-credentials` writes to `componentConfigs`
(`importHandlers.ts:335-341`) and it is right to, because that pair belongs to the
user's own workspace. The shared pair is different on both counts:

- **N copies of one org-wide write credential** undoes the only security argument
  this plan has. One pair replacing N is the whole case for it.
- **A cached copy goes stale on rotation** and keeps failing with nothing to clear
  it. Re-fetching costs one GET behind a token the user must already hold, so
  persistence buys offline use and nothing else.

SecretStorage is a live mechanism here and `commerceCredentials.ts:54-59` reserves
a `SecretStore` interface plus an unused `secrets` param for it — but there is no
writer for the ACCS pair (`storeAccsCredentials` was deleted; only a test docstring
remembers it). That seam is the right home for **the user's own** pair, and wiring
it is `.rptc/complete/component-secret-routing/overview.md`, not this plan. The
broker result lives in memory and goes into the request.

## Tests

New `tests/features/data-installer/services/commerceCredentialBroker.test.ts`, plus
additions to `commerceCredentials.test.ts`:

| Assertion | Why |
|---|---|
| declared pair wins; broker not called | the plan's stated precedence |
| no declared pair → broker pair returned as `kind: 'accs'` | the feature |
| broker returns undefined → `needs-accs-credentials` | unchanged refusal |
| no service configured → `no-credential-service`, broker never called | the case only the user can fix |
| broker throws/times out → `needs-accs-credentials`, no throw | degrade, never break |
| PaaS project never calls the broker | wrong credential shape |
| no broker dep passed → today's behaviour exactly | the four other callers |
| resolution result and logs contain no secret | asserted on the string, as the service tests do |
| `buildSampleDataDeps` and `confirmSampleDataRemoval` pass a broker | the trap above |

## Do not

- Do not add a VS Code setting. `demoBuilder.accsDiscovery.services` already gates
  this: no service configured, no broker. A new setting would also need a default,
  and defaults are how an endpoint reached this public repo before.
- Do not make the broker a `DataInstallerWriteClient` concern. It authenticates to
  our service with the user's IMS token; the write client authenticates to another
  team's service with the Commerce pair. Different trust boundaries.
- Do not "unify" `CREDENTIAL_MESSAGES` across `importHandlers.ts:55` and
  `exportHandlers.ts:42`. Read both: they are import-worded and export-worded
  variants of the same keys, not a copy-paste. Leaving this note so the next sweep
  does not undo it.
