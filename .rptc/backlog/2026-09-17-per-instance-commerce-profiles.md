---
id: PL-61
kind: question
area: platform
needs: []
value: high
status: open
---

# What does a product profile per Commerce instance change for each SC?

Filed 2026-09-17 from the owner: Adobe is moving Admin Console licensing to a product
profile per Commerce (ACCS) instance. AB-18 already showed one effect: a credential that
uses profiles an SC is not a developer on makes their Adobe project read-only. This
item maps every path in the extension (and the services it relies on) that depends on a
Commerce product profile. Code-only survey, same day; nothing was run live.

## The map

| Path | Who calls Commerce | Profile-gated? | Likely effect |
|---|---|---|---|
| ERP integration subscribe (`apiServiceResolution.ts` `toServiceSubscriptionInfo`) | SC's sign-in subscribes the workspace S2S credential to `ACCS-REST-API` | Yes (code): one catalog profile is named; several throw | Breaks (several profiles), or could subscribe a profile the SC is not a developer on, which would make the project read-only the way AB-18 describes. It never picks the project's own tenant |
| ERP integration at run time, and App Management install | The workspace S2S credential (the SC's token only reaches the app's own actions) | Inferred: Commerce answered 401 until the subscription existed (`17759e61f`) | Breaks for an instance whose profile the credential lacks |
| Commerce integration starter kit | Workspace S2S credential | Not stated (its `requiredApis` has no `ACCS-REST-API`) | Unknown; may hit the same 401 on ACCS |
| Data Installer per-project provisioner (`accsCredentialProvisioner.ts`) | SC's sign-in subscribes the workspace credential with `licenseConfigs: null` (checked) | Yes | Breaks as soon as the org offers more than one profile ("requires selection of a product") |
| Data Installer shared pair (`get-commerce-credentials`, ADR-014) | A shared S2S pair in the discovery service | Yes; ADR-014 measured one pair reaching an instance it was never set up for, under today's single ACCS product | Probably breaks: the pair would need every instance's profile, or one pair per instance |
| Store discovery (`discover-stores`) | The service's shared S2S pair; the SC's token is only validated | Inferred | Needs admin work: the shared pair must hold each tenant's profile |
| PDP render (`render-pdp`) | No Commerce call; it fetches the aem.live template | No | Unaffected |
| PDP pre-publish SKU check, catalog prewarm, storefront config, API Mesh | Public Catalog Service GraphQL with store headers | No | Unaffected |
| Org API catalog, Manage APIs, `add_console_apis` / `set_console_apis` | SC's sign-in | The picker already disables rows the SC lacks a profile for; the agent tools go through the ERP subscribe path, which does not check | ACCS-REST-API likely shows as needing a profile; an agent adding it repeats AB-18 |
| Project and workspace teardown | SC's sign-in | Not itself | Blocked once the project is read-only (AB-18); nothing detects it today |
| Commerce Admin link | SC's browser session | Adobe's call | Unaffected by the extension |

Both subscribe paths (the ERP one and the Data Installer provisioner) are wrong in the
same way under per-instance profiles: neither selects the instance's own profile. The
provisioner's docstring already says it could move onto the shared subscriber; doing that
with instance-aware profile selection fixes both.

## Questions for the Admin Console / licensing team

1. Does an S2S credential need exactly its own tenant's profile, and will other instances
   then refuse it? (ADR-014's cross-instance reach was measured under one product.)
2. Can a Developer-role SC be made a developer on their own tenant's profile, and by whom?
   (The owner is not one on Bodea's.) This decides whether the extension warns or blocks.
3. Will each per-instance profile appear as its own `licenseConfigs` entry for the org,
   with the tenant id visible, so code can match profile to instance?
4. For shared service credentials (store discovery, the Data Installer pair): is there an
   org-wide profile, or must an admin add each new tenant's profile?
5. Does a project's read-only state lift once the user is added to the profile, or the
   profile is removed from the credential?
6. Does `commerce.accs` come from the subscription or from the token request? Two paths
   work without requesting it (`accs-discovery-service/actions/lib/ims.js`,
   `s2sDeployEnv.ts`).

## Not established

- How Bodea's project came to use 38 profiles (not our `ACCS-REST-API` subscription,
  owner-confirmed; AB-18).
- How the starter kit authenticates to ACCS (its source was not read).
- No Adobe document on per-instance ACCS profiles was found.

## Likely work once answered

- One subscriber for both paths that selects the project's tenant profile (its id is in
  the backend URL) and checks the SC is a developer on it first (AB-18).
- Explain a read-only project instead of failing teardown (AB-18).
- Admin runbook for the shared service credentials, or per-instance credentials there.

## Shipped so far

- 2026-09-17  docs(backlog): PL-61, and what our subscription did not do (`bbb976fb7`)
