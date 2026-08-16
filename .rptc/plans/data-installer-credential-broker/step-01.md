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

## The one thing to settle before writing code

**Is a credential that works for `discover-stores` also subscribed to
`ACCS-REST-API`?** `discover-stores` mints tokens with the scope list at
`lib/ims.js:10`, which does not name `commerce.accs`. The Data Installer's
pre-flight is what actually cares, and it is the subscription — not the scope
string — that flips it from 400 to 200
(`accsCredentialProvisioner.ts:1-29` records this).

**Falsify it with the probe the research already ran**, before deciding which pair
to serve: mint a token from the candidate pair and call the Data Installer's
`get-websites-and-stores` against a known instance in `285361`. 200 with that
instance's own website codes means the pair is usable. Keep both controls from
`.rptc/research/data-installer-credential-home/research.md` — a nonsense instance
id (expect 400) and a bad secret (expect 401). Do not infer this from the
subscription list in the Console.

- **Usable** → the deployer can point the new inputs at the same pair.
- **Not usable** → mint a `demo-builder-s2s` credential in the service's own I/O
  project and subscribe `ACCS-REST-API` **as a direct S2S subscribe, not the
  axis-filtered path** — the filter reads `platformList` and silently drops an
  S2S-only service (`accsCredentialProvisioner.ts:19-23`). Subscribe the UNION.

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
