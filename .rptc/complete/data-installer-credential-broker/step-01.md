# Step 01 — `get-commerce-credentials` in `accs-discovery-service`

**Repo:** `skukla/accs-discovery-service` (sibling checkout, branch `main`).
**Blocks release.** Step 02 cannot be exercised live until this deploys.

## Why this is small

The service already holds an OAuth S2S pair in the Commerce org and already carries
the guard chain this endpoint needs. `discover-stores/index.js:105-111` reads
`IMS_CLIENT_ID`/`IMS_CLIENT_SECRET` from action inputs to mint a Commerce token;
`register-publish-key/index.js:59-69` is the same IMS-then-domain chain over a
credential write. This step adds a third action that runs the chain and returns a
pair instead of consuming one.

## The one thing to settle before writing code — RESOLVED 2026-08-16

**Is a credential that works for `discover-stores` also subscribed to
`ACCS-REST-API`?** `discover-stores` mints tokens with the scope list at
`lib/ims.js:10`, which does not name `commerce.accs`. The Data Installer's
pre-flight is what actually cares, and it is the subscription — not the scope
string — that flips it from 400 to 200
(`accsCredentialProvisioner.ts:1-29` records this).

**Measured, not inferred.** `get-websites-and-stores` — the read the dry run uses,
which cannot start work by accident — against a real instance in `285361`, using
the pair already in the service's `.env`. Run twice, identical both times:

| Leg | Result |
|---|---|
| **The test** — service pair vs the real instance | **200**, `success: true`, websites `[base]` |
| Control — instance | nonsense 22-char id → **400** `Pre-flight check failed for all configured site types (accs, local)` |
| Control — credential | real id, bad secret, same instance → **401** `invalid_client` |

**Yes: the existing pair carries the entitlement.** Both controls failed as
required, which is what makes the 200 load-bearing — the endpoint really does
refuse instances it cannot reach, and really does authenticate the credential
per-request. The credential control is the leg that closes the "maybe it returns
200 to anything" reading, and it is why the research insisted on it.

So the deployer points the new inputs at the same values, and **no
`demo-builder-s2s` needs minting.** The `.env` is set accordingly (gitignored).

Had it come back 400, the alternative was to mint one in the service's own I/O
project and subscribe `ACCS-REST-API` **as a direct S2S subscribe, not the
axis-filtered path** — the filter reads `platformList` and silently drops an
S2S-only service (`accsCredentialProvisioner.ts:19-23`). Recorded in case the
credential is ever rotated to a narrower one.

Either way the action reads **its own input names**, never `IMS_CLIENT_ID`.

## Approach

1. **New inputs, deliberately separate.** Add `COMMERCE_S2S_CLIENT_ID` and
   `COMMERCE_S2S_CLIENT_SECRET` to `.env.example` and to the new action's `inputs`
   in `app.config.yaml`. They may hold the same values as `IMS_CLIENT_ID`/`SECRET`
   today; the names stay distinct because the two credentials have different blast
   radii — one is consumed inside the runtime, the other is handed to callers. Two
   lines of YAML buys the ability to narrow or rotate one without breaking store
   discovery.
2. **`actions/get-commerce-credentials/index.js`.** GET only — it dispenses, it
   does not mutate. Copy the chain from `register-publish-key/index.js:44-81`
   verbatim in order; do not re-derive it:

   | Rung | Failure | Status |
   |---|---|---|
   | `Authorization` header present | missing | 401 |
   | `validateCallerToken` | invalid/expired/no email | 401 |
   | `ALLOWED_EMAIL_DOMAINS` set | **absent** | **503 — fail closed** |
   | `validateCallerEmailDomain` | domain not allowed | 403 |
   | both `COMMERCE_S2S_*` set | absent | 503 |
   | any other method than GET | POST/PUT/DELETE | 405 |

3. **Response**: `{ success: true, data: { clientId, clientSecret } }`, matching
   the envelope `discover-stores/index.js:130-137` returns, so the extension's
   existing unwrap logic applies unchanged.
4. **Register it** in `app.config.yaml` beside `register-publish-key` with the same
   annotations — `require-adobe-auth: false` + `final: true`. `final` is what blocks
   invoke-time param override, and it only does so while `require-adobe-auth` is
   false (the comment at `app.config.yaml:55-58` records why).
5. **Logging**: step names only. The pair must never reach `logger`, a URL, or an
   error message — the same line `accsCredentialProvisioner` holds.

## Tests — `tests/get-commerce-credentials/index.test.js`

Mirror `tests/register-publish-key/index.test.js` (mock `../../actions/lib/ims`,
one `params()` builder, one case per rung). Beyond the chain, three that are
specific to dispensing:

- **the secret never appears in a rejection body** — assert against every non-200
  path, not just one
- **a rejected caller never reads the inputs** — the pair must not be assembled
  before the chain passes
- **405 on POST**, so a write-shaped request cannot be mistaken for a supported
  call later

## Deploy and rotation

Deploy with `npm run deploy` (it stamps `BUILD_SHA`/`BUILD_VERSION`). **Rotation is
`.env` + redeploy**, the same path `ENCRYPTION_KEY` already takes — not
`aio runtime action update --param`. Adobe warns that an update call must carry
ALL params or the omitted ones disappear, and that trap is avoidable rather than
worth verifying. Say so in the README so nobody reaches for `--param` later.

## Do not

- Do not reuse `IMS_CLIENT_ID` by name inside this action. The indirection is the
  point.
- Do not add an instance/org parameter. The pair reaches every ACCS instance in its
  org (measured 2026-08-16); a parameter would imply a narrowing that does not exist.
- Do not log the caller's full email — `register-publish-key` logs "caller domain
  verified" and that is the standard.

## Done when

The action is deployed, the guard-chain suite is green, a live GET with a real IMS
token returns a pair, and the same GET with a non-allowlisted domain returns 403.
