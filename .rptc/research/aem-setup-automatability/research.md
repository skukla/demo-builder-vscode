# Research: AEM-Sites setup — what the builder can/should automate (capability map)

**Date:** 2026-06-11
**For:** Commerce-Connect Slice 2 (AEM Sites as EDS content source) — scoping what the extension owns vs guides
**Companion:** `.rptc/research/aem-content-source-auth/research.md` (the auth-mechanism finding this builds on)
**Method:** web search + Adobe API specs/SDK source + **the extension's own `src/features/eds/` source** (the strongest evidence — confirmed primary).
**Source honesty:** `www.aem.live` and `experienceleague.adobe.com` consistently **403 direct fetch**; their claims rest on search extracts (Medium where mechanism inferred). In-repo source claims are **High** (read directly). Adobe API/SDK signatures + Cloud Manager/UMAPI endpoints are **High** (specs/READMEs). EDS-site create-via-API is the weakest link (**Med**, UI-only inferred).

---

## Headline: most of this is already built

The extension **already implements the full DA.live EDS flow** in `src/features/eds/`. The AEM-Sites delta is small. Confirmed in-repo (High):

| Capability | Where it already lives |
|---|---|
| Adobe IMS login (`aio auth login`, token off disk) | `TokenManager`, `authenticationService.ts` |
| Console SDK init + org/project/workspace pickers | `adobeSDKClient.ts`, `adobeEntityFetcher.ts` (`getOrganizations`/`getProjectsForOrg`/`getWorkspacesForProject`) |
| **Programmatic OAuth S2S credential creation** | `adobeEntityFetcher.createWorkspaceCredential()` → Console SDK `createOAuthServerToServerCredential(...)`, with 409-reuse |
| GitHub OAuth + repo-from-template | `githubRepoOperations` |
| Code Sync app **detection** (NOT auto-install) via `admin.hlx.page/status/...` + UI install URL | `githubAppService` |
| `fstab.yaml` generation + commit | `fstabGenerator`, `githubFileOperations` |
| **Site registration via Configuration Service** `PUT admin.hlx.page/config/{org}/sites/{site}.json` (IMS Bearer) | `configurationService.ts` (currently sends `{url, type:'markup'}` for DA.live) |
| Preview/publish + status | `helixService` |

**So the AEM-Sites work is mostly (a) Cloud Manager program/env identification (new) and (b) pointing `content.source` at the AEM-author `franklin.delivery` mountpoint instead of `content.da.live` — plus guide+verify of the in-AEM auth tab.** This is reuse-and-extend, not build-new.

**Verified against the repoless-satellite code path (corrects two earlier worries):**
1. **The seam is `configurationService.registerSite`, NOT `fstabGenerator`.** The repoless satellite registers via the **Configuration Service** `PUT admin.hlx.page/config/{org}/sites/{site}.json` (`storefrontSetupPhase3.ts:238`, `storefrontSetupPhases.ts:57`), which already threads a `contentSourceType` param and builds `content: { source: { url, type } }`. `fstabGenerator.ts` is **canonical-only DA.live cleanup that never runs on the satellite path** (confirmed; Slice-2 plan line 12) — so the AEM delta is the registration `source` payload's `url`+`type`, not an fstab branch. (The nested `type: markup` form still applies, but as the Config Service `source` value, not as committed fstab.)
2. **No config-endpoint ambiguity.** `configurationService.ts` (→ `admin.hlx.page/config`) does **site registration**; `daLiveConfigService.ts` (→ `admin.da.live/config`) does only **DA.live user-access grants** (`edsHelpers.ts:735 grantUserAccess`) + cleanup. AEM-Sites registration correctly rides `configurationService`; the `admin.da.live` path is DA.live-permissions-only and N/A to AEM (AEM owns its own read auth). The "which endpoint?" worry was a false alarm.

---

## Per-step capability table

| # | Step | API exists? | UX-assistable? | Hard blockers | Verdict |
|---|---|---|---|---|---|
| 1 | Adobe IMS login | Yes (shipped). High | yes (shipped) | none | **automate fully** — done |
| 2 | Org/project/workspace selection | Yes — Console SDK + CLI fallback (shipped). High | yes (shipped) | none | **automate fully** — done |
| 3 | AEM program + environment **identify** / create | List: Yes — `@adobe/aio-lib-cloudmanager` `GET /api/programs`, `listEnvironments(programId)`; author host from env HAL `rel/author` link. High. **Create-env/EDS-site: no clean public create** (UI one-click only; +Helix4↔5 migration endpoint). Med | partial | Cloud Manager **roles** (Business Owner to create; Deployment Mgr to read) on a **separate** credential; provisioning is licensed/slow infra | **guide + verify** — *identify & pick* the env via API (UX-assist, read-only); **don't auto-create** programs/EDS sites |
| 4 | EDS repo (fork `aem-boilerplate-xcom`) + Code Sync install | Repo: Yes (shipped). Code Sync **status**: Yes (shipped). Code Sync **install**: **No API** — GitHub App consent URL. High | partial | **GitHub App install is GitHub-UI / org-admin consent** — no API | **repo: automate fully** (done) / **Code Sync: UX-assist** — open install URL, poll status to verify |
| 5 | EDS content-source **registration** | Yes — fstab commit **or** Config Service `PUT admin.hlx.page/config/{org}/sites/{site}.json` (both shipped-adjacent). High | **yes** | Config Service needs IMS token w/ aem.live-org admin — **auto-granted to whoever installed Code Sync** (step 4 gates it) | **automate fully** — extension already does this; **only the `content.source` URL value changes** (AEM author `franklin.delivery` vs `content.da.live`) |
| 6 | In-AEM EDS **auth config** (Auth tab: Site Auth Token + tech acct + Product Profile READ) | Token paste + tech-acct verify: **AEM-author-UI-only** (tech acct auto-generated per env). High. Profile membership: UMAPI `POST usermanagement.adobe.io/.../action/{orgId}`. High | **no** (token/profile); partial (membership) | **No Adobe API writes the Site Auth Token into AEM.** UMAPI needs System-Admin integration; granting READ is privilege escalation; `_org_admin` not UMAPI-grantable | **guide + verify** — show exact tech-acct ID/steps, **verify read works** (probe `franklin.delivery`); **MUST NOT** silently add a tech acct to a READ profile (anti-pattern) |
| 7 | OAuth S2S credential creation | Yes — Console SDK; **extension already calls it** (`createWorkspaceCredential`). High | yes (shipped) | Minted cred lands on App Builder workspace, not the AEM-author tech acct AEM auto-provisions; wiring it as the site's content identity is security-gated | **UX-assist *only on explicit opt-in*** — **anti-pattern for the happy path**: prefer AEM's auto-generated read-only tech acct; don't silently mint content-read S2S creds |
| 8 | Universal Editor authoring + first publish | Publish/preview: Yes — Helix Admin API (shipped, `helixService`). UE authoring interactive. High | partial | UE editing is human/browser; "is it correct" is human judgment | **guide + verify** — extension can trigger preview/publish + verify render; authoring stays manual |

---

## Build this way / don't

**Own via API + extension UX (proven, low-risk):**
- **Read-only Cloud Manager identification** (3) — list programs/envs with `@adobe/aio-lib-cloudmanager`, user picks the AEM-author env whose `franklin.delivery` host becomes the mountpoint. Natural extension of the existing org/workspace picker.
- **Repo from `aem-boilerplate-xcom`** (4 repo) + **content-source wiring** (5) — highest-leverage reuse: the extension already forks templates, commits `fstab`, and calls the Config Service. **Only the `content.source` URL value changes.** Ship it.
- **Publish/verify** (8) — reuse `helixService` + a `franklin.delivery` read probe to confirm the round-trip.

**Only guide + verify (capability exists but human/UI/admin-gated):**
- **Code Sync app install** (4) — keep "open install URL → poll `admin.hlx.page/status`"; never claim installed without the status poll.
- **In-AEM Authentication tab** (6 token/tech-acct) — render exact tech-acct ID + steps, then verify read. AEM-author-UI-only; no Adobe API writes the token.
- **Cloud Manager EDS site/program creation** (3 create) — UI-gated + licensed; identify-don't-create.

**Leave fully manual / automation = anti-pattern (security boundary):**
- **Product Profile READ membership** (6) — UMAPI *can* add a tech acct to a READ profile, but silently doing so is privilege escalation. Require a System Admin; surface + verify.
- **Minting the content-read S2S identity** (7) — even though `createOAuthServerToServerCredential` is already wired, the native AEM-Sites flow uses AEM's **auto-generated read-only technical account** (`getContentSourceAuthorization() → null`). Don't make the happy path auto-create a content-granting S2S cred. Reserve programmatic S2S for the App Builder/mesh workspace use it already serves.

**The architectural line:** the extension owns **code + content-source plumbing** (repo, fstab/Config Service, publish) end-to-end via API+UX, and owns **Cloud Manager + the AEM auth tab only as read/guide/verify**. Every identity/entitlement-granting act (Product Profile, S2S content credential, GitHub App consent) stays a human-admin decision the extension **prompts-and-verifies but never silently performs.**

---

## Needs-a-live-account open items

1. **Config Service body shape for an AEM-author source** — what `content.source` value/`type` does `PUT admin.hlx.page/config/{org}/sites/{site}.json` expect for a `franklin.delivery` mountpoint vs DA.live's `{url, type:'markup'}`? (`configurationService.registerSite`.)
2. **Does AEM's auto-generated read-only technical account suffice** for `franklin.delivery` reads without the extension provisioning any separate Console S2S credential? (auth-research open #4.)
3. **Cloud Manager EDS-site create** — any non-UI/API provisioning path + exact roles, or strictly UI one-click? (Med: UI-only.)
4. **UMAPI Product-Profile target** — exact profile/group name + code for the EDS/`franklin.delivery` READ entitlement. (auth-research open #2.)
5. **Is `x-content-source-authorization` exercised on the native push path** — decides if the extension passes any token. (auth-research open #3.)
6. ~~Which config endpoint registers an AEM-author source~~ — **RESOLVED in code:** registration rides `configurationService` (`admin.hlx.page/config`); `admin.da.live/config` is DA.live-user-access-only. No live test needed for this.
</content>
