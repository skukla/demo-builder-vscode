# Component secret routing — the declaration decides where a credential lives

**Status: SHIPPED 2026-08-17.** The small version (steps 3 and 5) landed in
`ce840267` on 2026-08-13. Steps 1–2 and migration phases 1–3 landed 2026-08-17.
Moved from `.rptc/backlog/` on completion.

## What shipped, and where it lives

| Piece | Where |
|---|---|
| `secret: true` as a routing decision, separate from `type` as a render hint | `src/types/components.ts`, declared on the two Commerce credentials in `components.json` |
| **Phase 1** — one accessor: SecretStorage first, `componentConfigs` fallback | `components/services/commerceCredentialStore.ts` |
| **Phase 2** — write-through with a verified read-back | `components/services/commerceSecretMigration.ts`, wired into project creation AND the Configure save |
| **Phase 3** — converge every existing project on activation | `components/services/commerceSecretSweep.ts`, in the `extension.ts` upkeep chain |

## Two things the plan got wrong, corrected by building it

**1. The webview consumer does NOT simply become a handler round trip.** The plan
says it does. That is right for Configure and wrong for the wizard, and the
difference decided phase 2's shape:

- Configure renders a SAVED project — the value is in the webview only because the
  host sent it, so the host can resolve it instead.
- The wizard renders a credential the user is TYPING. No project exists, so there
  is no key and nothing saved. No round trip can produce it.

So the seam is "the HOST can always resolve them, and the webview only supplies
what it just collected". `discover-store-structure` accepts either, which is what
lets Configure stop sending a credential without breaking creation.

**2. Creation, not just save, had to write the secret.** The plan's phase 2 says
"on save". Doing only that means every NEW project writes its credential to the
manifest in the clear and cleans it up later. Creation is the first moment a
project path exists, which is the first moment the key scheme can address it — so
the migration runs there too, before the project is ever persisted.

## Still deliberately true after the migration

`SECRET_ENV_KEYS` still lists both credentials, and should. A value is RETAINED in
`componentConfigs` whenever a SecretStorage write cannot be verified, and a project
that has not yet been swept still holds one. Removing them from the export
blocklist would leak exactly those cases. The list shrinks when the sweep is proven
to have converged the field everywhere, not when the code that moves it ships.

---

## The original plan follows, unedited.

**Shipped, so do not redo:**

- ACCS OAuth fields declared on `adobe-commerce-accs` (optional, not required).
- The `SECRET_ENV_KEYS` guard — `tests/sop/credential-env-vars-registered.test.ts`.
- One reader per pair — `readPaasAdminPair` / `readAccsOAuthPair` in
  `envVarHelpers`, all three value-consumers collapsed onto them. When the value
  moves, these two functions change and the consumers do not; that is the seam
  point the remaining work builds on.
- The ACCS SecretStorage path (`storeAccsCredentials` et al.) is DELETED, not
  waiting to be wired. The remaining work re-introduces SecretStorage via the
  generalized `type: 'secret'` seam, not by resurrecting that code.

**Provenance.** Raised 2026-08-13 during Data Installer Stage 2 live verification.
The user rejected two earlier designs of mine in a row — a feature-specific
credential form, then collapsing the per-backend branch — and asked the two
questions this plan answers: can a config declaration be linked to SecretStorage so
things "do what they are meant to do and no more", and can each backend use its own
best-practice credential. Both answers are yes.

## Why

The Data Installer cannot import into an ACCS project. The modal says *"ACCS imports
need an Adobe OAuth Server-to-Server client id and secret. Add them before
importing."* — and there is nowhere to add them. `storeAccsCredentials` exists, is
tested, and is called from **tests only**: no UI, no command, no handler. The
instruction is impossible to follow.

The requirement itself is real, confirmed against the live service rather than
assumed:

| Probe | Answer |
|---|---|
| IMS token only | `400` — "Missing required authentication parameters. Provide either (client_id + client_secret) or (admin_username + admin_password)" |
| Bogus client id/secret | `401` — "Authentication failed: HTTP 400: invalid_client" |
| Control: bogus instance | identical 400 — so the message is not instance-specific |

So the service demands one of two credential pairs and really does validate them.

## Two false starts, recorded so they are not retried

**A Data Installer-specific credential form.** Wrong shape: it would have been a
third credential surface beside two that already exist. Credentials in this
extension are declared as component config fields, which yields the wizard's
component-config step and the Configure surface for free. PaaS is already solved
exactly this way and needs nothing.

**Collapsing the per-backend branch.** The service accepts *either* pair for either
backend, so it looked like `resolveCommerceCredentials` was branching on an
assumption. It is not. **Accepts is not best practice** — an admin
username/password against a SaaS instance is the legacy path. The branch is right;
what is missing is the ACCS collection surface.

## The two problems

**1. Nothing links a config DECLARATION to SecretStorage for ordinary components.**
Two mechanisms exist and neither fits:

| Mechanism | Where the value lands | Scope |
|---|---|---|
| `type: 'password'` in `components.json` | `componentConfigs`, in the clear | render hint only |
| `type: 'secret'` + `splitAppBuilderComponentSecrets` | VS Code SecretStorage | **App Builder components only** |

So a Commerce credential today goes in `componentConfigs` and is kept out of
exports by `SECRET_ENV_KEYS`, a hand-maintained list whose own docstring warns:
*"Adding a Commerce credential? Add it here, or it ships in a 'secret-free' file."*
A rule that depends on remembering is the failure mode, not the fix.

**2. ACCS has no credential fields at all.** One secret field exists in the entire
catalog: `ADOBE_COMMERCE_ADMIN_PASSWORD` on the PaaS component.

## The design

**`password` is a render hint; `secret` is a routing decision.** One field conflates
them today. Separating them is the whole idea: a field declared `secret` cannot
reach `componentConfigs`, `.env`, the persisted manifest, logs or an export —
not because something stripped it, but because it was never there.

### Best practice per backend, not "whatever the service takes"

| Backend | Credential | Why |
|---|---|---|
| `adobe-commerce-paas` | admin username + password | the Commerce admin REST model; the instance owns the identity |
| `adobe-commerce-accs` | OAuth Server-to-Server client id + secret | the Adobe IMS model for SaaS |

`resolveCommerceCredentials` keeps its per-backend branch. Both halves start
reading from the same declaration-driven place instead of two mechanisms.

### What already exists and is reusable

Both are generic in shape and App Builder-specific only in their types:

- `splitAppBuilderComponentSecrets(configs, catalog)` — strips `type: 'secret'`
  values out of configs and returns them separately.
- `secretKey(projectId, componentId, varName)` — per-project, per-component,
  per-var key, so two projects or two components never collide.

This is a generalization, not a new subsystem.

## Steps

Each is independently reviewable; 1 and 2 are shared infrastructure and the risk
sits there, not in the feature.

| # | Step | Touches | State |
|---|---|---|---|
| 1 | Generalize the secret seam to any component catalog entry | `components/`, `dashboard/` | open |
| 2 | Migrate `ADOBE_COMMERCE_ADMIN_PASSWORD` (and now `ACCS_OAUTH_CLIENT_SECRET`) from `componentConfigs` to SecretStorage | shared + existing projects | open |
| 3 | Declare the ACCS OAuth fields | `components.json` | **shipped** `ce840267` |
| 4 | Point `resolveCommerceCredentials` at the general path | `data-installer/` | folded into 3 — it reads declared config via the shared readers |
| 5 | Guard `SECRET_ENV_KEYS` so the list cannot silently fall behind | `components/` | **shipped** `ce840267` |

Step 2's scope GREW with step 3: the ACCS client secret now also sits in
`componentConfigs` (registered in `SECRET_ENV_KEYS`, so exports stay clean), and
migrates in the same pass as the admin password.

### Step 2 is the one with real risk — and it is bigger than "move a value"

Existing projects hold the password in `componentConfigs` in the clear, and retyping
the field does not move what is already saved. The sequencing is the real cost:
**three consumers read the value straight out of `componentConfigs`**, and one of
them cannot follow it to SecretStorage.

| Consumer | Runs in |
|---|---|
| `data-installer/services/commerceCredentials.ts` | extension host |
| `eds/services/storeStructureReader.ts` | extension host |
| **`components/ui/hooks/useAutoStoreDetect.ts`** | **the webview** |

SecretStorage is extension-host only. A webview cannot read it at all, so
`useAutoStoreDetect` needs a handler round-trip before the value can move. Strip the
old location first and auto-store-detect silently stops finding stores.

(An earlier draft of this plan said FIVE consumers. Two of those —
`storeFieldHelpers.ts` and `serviceGroupTransforms.ts` — reference the key NAME in a
field-catalog list and never read the value, so they are unaffected by where it
lives. A count is the cheapest kind of claim to check and the fastest to rot; this
one was wrong within the hour of being written.)

**Recommended: three phases, and phase 1 is what de-risks the rest.**

1. **One accessor, no storage change.** Route all five consumers through a single
   read that checks SecretStorage then falls back to `componentConfigs`. The webview
   consumer becomes a handler round-trip. Behaviour is identical, nothing moves, and
   it is independently valuable — five call sites reaching into a config map for a
   credential is the thing that made this migration expensive in the first place.
2. **Write-through with verified read-back.** On save: write to SecretStorage, read
   it back, and only on a successful read remove it from `componentConfigs`. There
   is never a state where the credential is in neither place — which was the whole
   argument against an eager strip.
3. **Converge on load.** A one-time migration doing the same write → verify → strip,
   so projects converge without waiting for a user to happen to open Configure and
   save.

This is eager, but only ever after the new home is proven to hold the value. The
rejected alternatives: a bare eager strip can leave a project with the credential
nowhere; fallback-read plus move-on-save is safe but may never converge, and
"eventually stops leaking" is not a property worth designing for when the file is
plaintext on disk.

**Phase 1 is worth doing even if phases 2-3 never happen** — same standalone
argument as step 5.

### Step 5 is the durable half, and it inherits a live dependency

`export_project_settings` was leaking `componentConfigs` into a file stamped
secret-free. **That is fixed** — `12f4b802`, 2026-08-11: `createExportSettings`
in `settingsSerializer.ts` now calls `stripSecretValues` when `includeSecrets` is
false. (Cited by symbol on purpose. This line was `:169` when written and was `:171`
an hour later; a precise-looking line number reads as more reliable and is less.) (Filed and fixed the same day; the
backlog item outlived the bug by two days and is now archived to `../complete/`.)

But read what the fix depends on: `stripSecretValues` filters against
`SECRET_ENV_KEYS` — the hand-maintained list. **The export is exactly as safe as
somebody's memory.** Its docstring says so outright: *"Adding a Commerce credential?
Add it here, or it ships in a 'secret-free' file."*

So step 5 is not bookkeeping. As declared secrets stop reaching `componentConfigs`,
the list shrinks to only what still lands there — and gains a guard: **a test that
fails when a component declares a credential-shaped field that is neither
`type: 'secret'` nor listed in `SECRET_ENV_KEYS`.** Same shape as the modal-hosting
guard: ask the source a question the runtime cannot be asked, so the rule does not
depend on the next person having read the docstring.

**Take step 5 even if everything else here is rejected.** It depends on neither the
seam nor the migration, and today nothing enforces the list at all — so if the
migration question stalls, this is the part that should still ship rather than
being held hostage to it.

### Later, not now

Console-free provisioning becomes an enhancement that FILLS these fields rather
than a parallel mechanism — and its gate is now OPEN. Verified live 2026-08-13,
with user approval, against the real workspace a project is bound to:

1. Read the project's Console binding (org/project/workspace) from the
   extension's own state — demonstrated over the extension MCP socket.
2. Create the OAuth S2S credential with the extension's exact SDK call
   (`createOAuthServerToServerCredential`, name `demo-builder-s2s`) — succeeded.
3. `aio console workspace download --orgId --projectId --workspaceId` (explicit
   ids, no selected-context dependence) — the downloaded JSON's
   `oauth_server_to_server` block carries `client_id` AND `client_secrets`
   (non-empty). Presence verified by key inspection; the value was never printed.

Same-day addendum, also measured: a fresh credential's scopes are `AdobeID,openid`
and the Data Installer pre-flight refuses it. **Subscribing `ACCS-REST-API` is the
entire fix** — scopes become `commerce.accs` + `additional_info.*`, and the same
pre-flight call returns 200 with the instance's store structure. No Admin Console
grant needed; the old "cannot be auto-provisioned" claim is disproven.

So the full loop needs nothing the extension does not already ship —
`ensureOAuthCredentialId`, the subscribe call, the workspace-download path
`runtimeCredentials.ts` already uses (0700 temp dir, deleted in `finally`), and a
write into the two declared fields. Two cautions for the implementer:

- **The subscribe axis filter has a bug this enhancement must route around or
  fix:** `ACCS-REST-API` carries `oauthServerToServerOnly: true` but a
  `platformList` of webapp types, and the filter reads only `platformList` — so
  `add_console_apis` silently drops the one service that is S2S-only. Call
  `subscribeOAuthServerToServerIntegrationToServices` directly with the union of
  existing codes + `ACCS-REST-API`, or teach the filter the flag.
- The secret must flow download → storage WITHOUT passing through logs or UI;
  the temp-file hygiene in `runtimeCredentials.ts` is the pattern to copy.

## What this does not fix

An ACCS user still visits the Developer Console once to create the credential,
until the enhancement above lands. This plan makes that a one-time paste into a
field that exists — rather than an error message pointing at nothing.

## Verification

- Step 1: a `type: 'secret'` field on a non-App-Builder component is absent from
  `componentConfigs`, the generated `.env`, the manifest and a settings export.
  Assert on all four; the export is the one a hand-maintained list got wrong.
- Step 2: a project with the old plaintext value still resolves credentials, and
  stops holding it in the clear after one save.
- Step 4: an ACCS project reaches a **dry run** — the first end-to-end proof, since
  a dry run writes nothing.
- Live: whether ACCS actually accepts the OAuth pair is unverified. The service
  says it wants one of two pairs; nobody has completed a run with either.

## Constraints

- **The repo is PUBLIC.** A credential must never reach `componentConfigs`, `.env`,
  the persisted manifest, logs, fixtures or a settings export.
- **Steps 1 and 2 are shared infrastructure**, not Data Installer code. They touch
  `components/` and `dashboard/` and affect every project that has ever saved a
  Commerce admin password. This is why the plan exists instead of a commit.
- **Do not widen the blast radius to fix a feature bug.** If review decides steps 1
  and 2 are too large for the value, step 3 alone (declare the ACCS fields the
  existing way) unblocks ACCS imports and leaves the seam for later — worse, but
  honest and small.
- **TDD, tests first**, and a RED run that touches no `src` file, per this repo.
- **Nothing typechecks test files** (`.rptc/backlog/2026-08-13-test-files-are-not-typechecked.md`),
  so a fixture here cannot be trusted to match a real shape. Two invented-shape bugs
  shipped in this feature on the day this was written. Derive fixtures from the real
  types and assert against real config, not against a hand-written literal.

## Kickoff prompt

> Read `.rptc/complete/component-secret-routing/overview.md`, then
> `src/features/dashboard/handlers/appBuilderComponentSecrets.ts` and
> `src/features/app-builder/services/secretKey.ts` — the two pieces being
> generalized. Confirm with the user which migration strategy step 2 uses (eager
> strip vs fallback-read + move-on-save); the plan deliberately leaves it open.
> Start at step 1, TDD, and do not touch steps 3-5 until 1 and 2 are green — the
> feature bug they unblock is not urgent enough to justify half-migrating every
> existing project's Commerce password.

## See also

- `docs/systems/data-installer.md` — the verified service contract
- `.rptc/plans/data-installer/HANDOFF.md` — the feature this unblocks
- `src/features/components/config/envVarKeys.ts` — `SECRET_ENV_KEYS` and why the
  list exists
- `12f4b802` — the `includeSecrets` export leak, fixed 2026-08-11. Its backlog
  item (`2026-08-11-export-settings-ignores-include-secrets.md`) describes a bug
  that no longer exists and is queued for archiving. What survives the fix is the
  dependency on `SECRET_ENV_KEYS`, which step 5 addresses.
