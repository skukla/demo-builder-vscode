# Keep a credential's APIs on deploy, attach the Commerce profile, and record the failure

## Context

Moving Bodea onto the "Kukla Bodea" Adobe project exposed a Demo Builder bug that affects
every SC: **a deploy wipes APIs from the workspace's server-to-server credential.** The
subscriber (`src/features/app-builder/services/apiSubscriber.ts`, `subscribeOAuthServices`)
PUTs only the codes this deploy needs, each with `licenseConfigs: null`, and Adobe REPLACES
the credential's list with it. Measured live on 2026-09-19: the ERP redeploy removed
ACCS-REST-API (and its one product profile) from Kukla Bodea / Stage. The integration then
could not put it back — Commerce requires a product profile, and the extension never picks
one ("Service ACCS-REST-API requires selection of a product"). Two smaller gaps showed up in
the same run: that failure was not recorded on the tile (it kept a two-day-old error), and
the org service list, which the new credential forced, timed out at 60s.

**How this relates to the 2026-09-18 fix (`coveredAlready` / `alreadySubscribed`).** That fix
SKIPS the PUT when the credential already holds every required API, which is why Bodea's old
credential (all APIs present) never lost its hand-added profiles. It does not make the PUT
itself safe: Kukla Bodea's credential held only ACCS-REST-API and lacked four free services,
so the skip didn't apply and the full PUT replaced the list. The skip stays — it still saves
the slow org-catalog download — and this change makes the PUT that runs when something IS
missing keep everything already there.

The owner wants all of it fixed in the extension and proven by making Bodea work through the
extension and its agent tools only — nothing by hand in Developer Console.

## Behaviour after the fix

1. **A deploy never drops an API.** The credential's current subscriptions are read first
   and carried into the PUT unchanged, profiles included. An API leaves only when it is in
   `removing` (Manage APIs unchecking it) — the one existing path for removal.
2. **The extension attaches the Commerce profile itself.** When a required API needs a
   product profile and the credential doesn't already have it, the extension picks the
   org-offered profile that names the project's configured Commerce tenant
   (`deriveAccsTenantId`, `components/services/envVarHelpers.ts`) — the rule we applied by
   hand. Exactly one match → attached. None or several → a plain refusal naming the tenant
   and what was found; nothing is guessed.
3. **An API-step failure on a redeploy is recorded** on the component, so the tile shows
   today's reason instead of an old one.
4. **The org service list gets 150s** instead of 60s (`TIMEOUTS.ORG_SERVICES_FETCH`); Adobe
   measured 43–131s this week. The fast-failure single retry is unchanged.

## Design

- **Read current subscriptions with their profiles.** New client call
  `getSubscribedServices(orgId, idIntegration)` → `{ sdkCode, licenseConfigs }[]`, built
  from `getIntegration().sdkList` plus `getSDKProperties(code).licenseConfigs` (the reads we
  used by hand today). Lives in `authentication/services/adobeOrgServices.ts`, passed through
  `adobeEntityFetcher.ts`, `authenticationService.ts` and `apiSubscriberClientAdapter.ts`.
  Never throws; unknown → the subscriber refuses to PUT rather than PUT blind (a PUT built
  from an unknown current list is exactly the wipe).
- **Build the PUT as a merge** in `subscribeOAuthServices` and `subscribeApiKeyServices`:
  current entries (minus `removing`) keep their `licenseConfigs`; required entries not yet
  present are added — free ones with `null`, profile ones via the tenant match, in the shape
  Adobe's own installer sends (`{ op: 'add', id, productId }`, from
  `aio-lib-console-project-installation/configure-apis.js`).
- **The tenant reaches the subscriber on `OrgTarget`** as an optional `commerceTenant`. The
  three callers that have the project set it: `appBuilderComponentRunnerDeps.ts`,
  `ensureMeshApiSubscribed.ts`, `consoleApiHandlers.ts`.
- **Which services need a profile:** the org service definition's `licenseConfigs` is
  non-empty (the same field `apiAccessCatalog.ts` reads).
- **Runner:** `deployAppBuilderComponent` (`appBuilderComponentRunner.ts`) records an error
  outcome when the pre-deploy subscribe throws, as the deploy failure path already does.
- **Timeout:** `timeoutConfig.ts` 60000 → 150000, with the measurement cited.

Branch: `fix/keep-credential-apis` off develop (a general fix). Then develop is merged into
`feature/erp-integration`, since that's the branch Bodea is proven on.

## Verification

- Unit (TDD), with argument assertions on the PUT body, because a mocked client cannot see a
  malformed call otherwise:
  - an existing ACCS-REST-API with its profile survives a deploy that doesn't need it;
  - a code in `removing` is dropped;
  - a missing ACCS-REST-API gets exactly the tenant's profile;
  - no match or several matches → the refusal, and no PUT at all;
  - an unknown current list → no PUT;
  - a free service still goes with `null`;
  - the runner records the API-step failure;
  - the three callers pass the tenant.
- `npm run gate`. Push only when the owner says.
- **Live proof, through the extension's agent tools only** (ERP build in the owner's
  Extension Development Host, confirm dialogs clicked by the owner):
  1. `redeploy_integration erp-integration` — adds ACCS-REST-API with Bodea's instance
     profile, deploys and installs into Commerce. A read-only check of the credential
     afterwards shows every service kept, plus ACCS with exactly 1 profile.
  2. `redeploy_integration demo-erp` — the credential keeps ACCS (no wipe).
  3. `republish` for the storefront config, so it uses the new mesh, and a check that the
     storefront answers.
  4. Only then, and on the owner's word naming the project, `delete_adobe_project` for the
     old one.

## As built (2026-09-19) — where it differs from the plan above

- **Built on `feature/erp-integration`, not a develop fix branch** (owner's call). Develop's
  subscriber still has the old resolver: it ignores `oauthServerToServerOnly`, so on develop
  ACCS-REST-API's profile row and AppBuilderDataServicesSDK are never sent at all. The ERP
  branch's `apiServiceResolution.ts` (16 September) already handles that, and this work sits
  on it. Both reach develop together when the ERP branch merges.
- **A single offered profile still needs no tenant** — the branch's earlier behaviour. The
  tenant decides only when the org offers several (105 for Commerce here).
- **`toServiceSubscriptionInfo` is deleted.** Its one caller now builds the merged list
  (`subscriptionList.ts`).
- **`ServiceLicenseConfig` gained `description`**, where the tenant id actually appears
  (names are "Default - <token>"), read live.
