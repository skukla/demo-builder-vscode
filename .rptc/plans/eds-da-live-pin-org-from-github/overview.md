# DA.live namespace picker — replace user-typed input with a GitHub-orgs picker

**Status:** Locked-in design. Ready to implement once scheduled.
**Filed:** 2026-06-10
**Origin:** Field issue with Leah Rayard (and Maddie) on `v1.0.0-beta.114`. Both are first-time DA.live users; the wizard's DA.live-auth step rejects them with "Organization not found" before the create pipeline gets a chance to install AEM Code Sync, copy content, and register the site.

## What we're fixing

The Demo Builder wizard asks the user to type a "DA.live organization name" as free text, then verifies it against `https://admin.da.live/list/{orgName}/`. Two problems with this:

1. **The user is typing blind.** They have no idea what the right value is. The DA.live "org" is actually their GitHub username (or a GitHub org they're a member of), but the wizard's input prompt doesn't say that. Leah typed her Adobe ID slug (`leah`) and got 404; her real namespace is `leahrayard`.
2. **The verification fails for first-time DA.live users even when they type the right name.** DA.live's admin API only recognizes a namespace once the AEM Code Sync GitHub app has been installed on the corresponding GitHub user/org. Until then, `admin.da.live/list/{orgName}/` returns 404 regardless of what the user types.

The extension's create pipeline already handles first-time setup correctly — `storefrontSetupPhase3.ts` detects missing AEM Code Sync, prompts install via `https://github.com/apps/aem-code-sync/installations/select_target`, and proceeds once installed. The pre-auth verification gate runs *before* that pipeline can fire, so first-time users never get there. **This plan replaces the user-typed input with a picker populated from the user's actual GitHub org memberships, removes the verification gate, and lets Phase 3 handle first-time AEM Code Sync setup as designed.**

## The design

After the existing "Setup GitHub" step completes, the wizard fetches the user's GitHub org memberships and presents a picker:

```
Signed in as: leahrayard ✓

GitHub namespace for this demo:
  ◉ leahrayard (Personal account)
  ○ adobe
  ○ adobe-commerce
  ○ demo-system-stores
  ○ hlxsites
```

She picks per demo. The list comes from `GET /user/orgs` plus her personal account from GitHub OAuth. No typing, no guessing what's valid, no "404 organization not found" failures — every option in the picker is an org she's verifiably a member of.

The choice is **per-demo**, not per-team. This matches the real SC workflow:

- Demo A → personal namespace for a quick prototype
- Demo B → team org for an official showcase
- Demo C → personal namespace again

She picks each time. Most picks are one-click confirmations of the default.

## How the default selection works

A VS Code setting `demoBuilder.eds.githubOrg` controls which option is **pre-selected** in the picker. It does not override or hide options — just preselects:

- **Setting empty (default for most SCs):** picker pre-selects `leahrayard (Personal account)` → one click to confirm
- **Setting = `demo-system-stores` (team standardized):** picker pre-selects `demo-system-stores` → one click to confirm, but she can still pick something else for this demo
- **Setting = a value that's not in her org list:** picker falls back to personal account as preselection; logs a debug warning so we can see this case in field logs

A team admin can set the setting globally via VS Code's shared settings to nudge a team-wide preference without forcing it.

## How this relates to "Setup GitHub"

The native GitHub auth step is unchanged. VS Code's `vscode.authentication.getSession('github', ...)` still handles the login. The auth flow establishes **who** the user is (her identity). The picker decides **where** the demo goes (the namespace target). They're separate concerns:

| Concern | Source |
|---|---|
| **WHO** is authenticated (identity) | VS Code's native GitHub auth — unchanged |
| **WHERE** the demo lives (namespace) | Picker, populated from the identity's org memberships |

A single GitHub token representing one identity can act across multiple namespaces (her personal user + every org she's a member of) — this is standard GitHub multi-org behavior. The picker just enumerates the choices and lets her decide per-demo.

## Files we're changing

### Backend

**`src/features/eds/handlers/edsDaLiveAuthHandlers.ts:271-311`** — DELETE the pre-auth verification block (`GET /list/{orgName}/` for existence + `HEAD` for write access). The picker only shows orgs the user is a member of, and the create pipeline's Phase 3 catches the AEM Code Sync case. This gate becomes redundant.

**`src/features/eds/handlers/edsGitHubAuthHandlers.ts` (or wherever the OAuth completion is handled)** — after `vscode.authentication.getSession` returns, fire one additional call to `GET https://api.github.com/user/orgs` with the session token, store the returned org list alongside the session info. This is what populates the picker.

**`src/features/eds/handlers/edsHelpers.ts` (or a new `edsNamespaceResolver.ts`)** — add a small helper:

```ts
function getDefaultNamespace(
    workspaceConfig: vscode.WorkspaceConfiguration,
    githubUser: string,
    availableOrgs: string[],
): string {
    const setting = workspaceConfig.get<string>('demoBuilder.eds.githubOrg', '').trim();
    if (setting && availableOrgs.includes(setting)) {
        return setting;
    }
    return githubUser;
}
```

This resolves which option starts pre-selected in the picker. Falls back to personal user if the setting points at an org the user isn't a member of.

**`src/features/eds/handlers/storefrontSetupPhase1/2/3.ts`** — every reference to the user-typed org name reads from the picker's selected value instead. Most code already takes `daLiveOrg` as a parameter, so this is wiring rather than logic change.

### Wizard UI

**`src/features/eds/ui/...` (location TBD — find the DA.live step component)** — replace the org-name text input with a picker component:

- Adobe Spectrum `Picker` or `RadioGroup` (depending on visual weight) populated from the fetched orgs
- Default selection from `getDefaultNamespace(...)` resolver
- Label: "GitHub namespace for this demo"
- No "Verify" button — verification happens implicitly via the picker only showing valid options

### Config

**`package.json`** — add the setting:

```json
"demoBuilder.eds.githubOrg": {
    "type": "string",
    "default": "",
    "description": "Default GitHub organization to pre-select in the wizard's namespace picker. When empty, your personal GitHub username (from OAuth) is used as the default. You can still pick a different namespace per demo. Set this globally (e.g., 'demo-system-stores') if your team standardizes on a default."
}
```

## OAuth scopes

The wizard's existing GitHub OAuth flow likely requests something like `['repo']`. To fetch org memberships, we also need `'read:org'`. Verify the current scope set in the OAuth call:

```ts
vscode.authentication.getSession('github', ['repo', 'read:org'], ...)
```

If `read:org` isn't already requested, add it. This triggers a one-time re-auth for existing users on their next demo — they'll see the standard VS Code "permission has changed" prompt. Minor friction, acceptable trade.

## API endpoint for repo creation

GitHub differentiates repo creation by owner type:

- Personal user: `POST /user/repos`
- Org: `POST /orgs/{org}/repos`

The extension's current code probably uses one path. During implementation, verify which is in use and handle both:

```ts
const isPersonalAccount = pickedNamespace === githubUser;
const endpoint = isPersonalAccount
    ? '/user/repos'
    : `/orgs/${pickedNamespace}/repos`;
```

If the existing code already takes the owner as a parameter and routes correctly, no change needed.

## AEM Code Sync install — team-org context

For a personal namespace, Phase 3's existing install prompt works as-is — the user has admin rights on their own GitHub user, so they can complete the install.

For a team-org namespace where AEM Code Sync isn't yet installed, the user may not have admin rights to install it. Phase 3 should detect this case and surface a contextual error rather than the standard install prompt:

```
AEM Code Sync isn't installed on demo-system-stores yet. This requires
a GitHub org admin to install. Ask your team admin to install it from:
https://github.com/apps/aem-code-sync/installations/select_target
```

The check: when the create pipeline detects missing Code Sync AND the target namespace is an org (not the personal user), use the admin-needed messaging. Otherwise use the existing self-install prompt.

This is a small addition to `storefrontSetupPhase3.ts` — pass an `isTeamOrg` flag (true when the picked namespace ≠ the OAuth user's login) and branch the error message accordingly.

## Tests

| Test | What it covers |
|---|---|
| `getDefaultNamespace` returns personal when setting is empty | Default behavior, most SCs |
| `getDefaultNamespace` returns setting value when set and user is a member | Team-default case |
| `getDefaultNamespace` falls back to personal when setting points at a non-member org | Stale/invalid setting |
| Picker renders personal account + all fetched orgs | UI render |
| Picker preselects from `getDefaultNamespace` | UI default behavior |
| Picker-selected value flows through to all pipeline phases | End-to-end namespace propagation |
| Phase 3 install prompt uses admin-needed messaging when isTeamOrg | New branch in Code Sync prompt |
| Verification gate removal does not introduce regressions | Existing pre-auth tests removed; create-pipeline tests still pass |
| Tip-saver tests deleted (block no longer exists) | Removal verification — tests asserting on the tip flow should be removed, not updated |
| Cleanup command picker renders + advances on selection | Step 7 — cleanup command UX matches wizard |

Estimate: 12-14 test deltas (~7 new, ~5-7 updates/removals to existing).

## Execution plan

### Step 1 — OAuth scope + org fetching

- Update `getSession` call to include `read:org` if not already present
- After session returns, call `GET /user/orgs` with the token
- Plumb the resulting org list through to the wizard step

### Step 2 — Default resolver + setting

- Add `demoBuilder.eds.githubOrg` to `package.json` with description
- Add `getDefaultNamespace(workspaceConfig, githubUser, availableOrgs)` helper
- Tests: 3 cases (empty / set-and-valid / set-but-invalid)

### Step 3 — Picker UI

- Replace text input in DA.live step with Spectrum picker
- Populate from org list + personal user
- Preselect via `getDefaultNamespace`
- Tests: render correctness + preselect behavior

### Step 4 — Pipeline namespace wiring

- Pass picked namespace through to `storefrontSetupPhases.ts`, then to Phase 1 (repo create), Phase 2 (Helix config), Phase 3 (Code Sync + DA writes)
- Remove the pre-auth verification block in `edsDaLiveAuthHandlers.ts:271-311`
- Verify repo creation endpoint handles both personal and org targets
- Tests: end-to-end namespace propagation

### Step 5 — Phase 3 team-org messaging

- Add `isTeamOrg` flag to Phase 3's Code Sync check
- Branch the error message between self-install (personal) and admin-needed (team org)
- Test: assert correct message in each case

### Step 6 — Remove obsoleted setting + dead code

See the "Obsoleted code and settings" section below for the full delete list.

- Delete `demoBuilder.daLive.defaultOrg` from `package.json`
- Delete the tip-saver block at `edsHelpers.ts:213-237`
- Delete the input-box prompt at `edsHelpers.ts:517` (and any helper code only used by it)
- Delete the fallback at `edsDaLiveAuthHandlers.ts:69`
- Delete the `defaultOrg` prop, state, and effect in `DaLiveServiceCard.tsx:58-92`
- Update or delete tests that asserted on the tip-saver, default-fallback, or pre-fill behavior
- (Optional cleanup) Delete the `daLive.defaultOrgTipShown` key from `globalState` on activation

### Step 7 — Convert "Manage DA.live Sites" cleanup command to picker

- `cleanupDaLiveSites.ts:34, 39`: replace the input prompt with the same picker pattern from Step 3
- Reuse the org-fetching helper from Step 1
- Reuse the default-resolver from Step 2
- Test: cleanup command picker renders + advances to the chosen org's site list

This shares the picker plumbing already added in Steps 1-3, so the marginal cost is small (~30 min + 1-2 test cases). Keeping the cleanup command's UX consistent with the wizard prevents it from feeling stale after the wizard ships.

## Obsoleted code and settings (delete outright — no soft deprecation)

The pre-picker design relied on a user-typed org input with a "default value" setting and a one-time tip-saver flow. All of that becomes dead code with the picker. Per the project's no-soft-deprecation policy, delete outright; don't leave "(Deprecated)" stubs.

### Setting

- **`demoBuilder.daLive.defaultOrg`** in `package.json` (DA.live config block). Replaced by `demoBuilder.eds.githubOrg`, which has different framing (GitHub namespace, not just a DA.live string) and different semantics (picker pre-selection, not text-input auto-fill).

### Code

- **`edsHelpers.ts:213-237`** (the entire tip-saver block) — pops up after successful DA.live auth offering to save the typed org name as the default. Nothing to save now; picker handles defaults via the new setting.
- **`edsHelpers.ts:517`** — input-box prompt that pre-fills from the setting. Goes away because the entire DA.live-step input box goes away.
- **`edsDaLiveAuthHandlers.ts:69`** — fallback that reads the setting when payload has no org. Picker always provides a value; fallback unreachable.
- **`DaLiveServiceCard.tsx:58-92`** — `defaultOrg` prop, the `orgValue` text-input state, the `useEffect` that syncs prop into state. The entire org text input UI element goes away; replaced by the picker.

### State key

- **`globalState['daLive.defaultOrgTipShown']`** — orphaned once the tip-saver block is removed. Add to the same removal commit so we don't leave dangling state keys. Existing users who saw the tip have the key set; it just stops being read. Optional cleanup pass to delete the key from `globalState` on extension activation; low priority, can be deferred.

### "Manage DA.live Sites" cleanup command

**`cleanupDaLiveSites.ts:34, 39`** — the **"Manage DA.live Sites"** command (separate from the wizard) reads `demoBuilder.daLive.defaultOrg` to pre-fill its input prompt. Converted to the same picker pattern as the wizard in Step 7 so the cleanup command's UX stays consistent and the obsoleted setting is fully removed across the codebase.

## Risk + rollback

**Risk 1 — OAuth scope expansion.** Adding `read:org` to the GitHub OAuth request prompts existing users to re-authorize. This is a one-time, standard VS Code UX (banner-style notification "GitHub permissions have changed"). Acceptable trade for the better UX. If a user denies the new scope, the picker falls back to "personal account only" — the org list is just empty.

**Risk 2 — Picker complexity for users with many orgs.** Some SCs may be members of 10+ GitHub orgs (especially internal Adobe folks). The picker could get unwieldy. Mitigation: alphabetical sort, personal account always pinned at top, search/filter affordance if the list exceeds N orgs. Defer the filter UX until we see real-world feedback — most SCs probably have 2-3 relevant memberships.

**Risk 3 — `read:org` doesn't surface all relevant orgs.** Some Adobe internal orgs may have visibility restrictions that prevent `/user/orgs` from listing them. If an SC's team org doesn't appear in the picker despite their membership, they have no way to target it. Mitigation: log a warning in the picker UI ("Don't see your team org? Check your GitHub org visibility settings") with a link to GitHub docs. Probably not a launch blocker.

**Rollback:** revert is a single commit. The `demoBuilder.eds.githubOrg` setting stays in `package.json` as a no-op if rollback happens. Users wouldn't notice anything beyond the picker reverting to a text input.

## What this plan does NOT solve

- **Auto-detecting which AEM Code Sync installations exist on the user's behalf.** GitHub doesn't make this trivial to enumerate, and the install prompt is the correct fallback. Defer.
- **Cross-org access discovery (collaborators on individual repos).** Less common case; collaborator-only access to a single repo without org membership is unusual for the SC workflow. Picker uses org-level membership only.
- **Visibility/permission of orgs the SC sees vs. uses.** `read:org` returns orgs they're a member of; doesn't enforce write permission. The picker shows the option; the actual write call may fail with 403 if the SC's membership doesn't include write. Phase 1's repo-create error surfaces that cleanly.
- **Persisting the picker choice as a per-project preference.** Each demo is a fresh wizard run; no "last used" memory. The setting handles the "always default to X" case at the user-config level. If a "remember last choice" affordance is needed, file as a follow-up.

## Kickoff prompt

```
Implement the eds-da-live-pin-org-from-github plan (see
.rptc/plans/eds-da-live-pin-org-from-github/overview.md).

This is locked-in design — no UX questions remaining. Implementation
order is the 7 steps in the "Execution plan" section. Use TDD where
the test pattern is obvious; for the picker UI, render-and-assert tests
following the existing wizard step test patterns.

Hot files (add):
  - src/features/eds/handlers/edsGitHubAuthHandlers.ts (fetch /user/orgs)
  - src/features/eds/handlers/edsHelpers.ts (or new edsNamespaceResolver.ts —
    add getDefaultNamespace helper)
  - src/features/eds/handlers/storefrontSetupPhase{1,2,3}.ts (consume picked namespace)
  - DA.live step component in wizard UI (replace text input with picker)
  - package.json (add demoBuilder.eds.githubOrg setting)

Hot files (delete code from):
  - package.json (remove demoBuilder.daLive.defaultOrg setting)
  - src/features/eds/handlers/edsHelpers.ts:213-237 (tip-saver block)
  - src/features/eds/handlers/edsHelpers.ts:517 (input-box prompt)
  - src/features/eds/handlers/edsDaLiveAuthHandlers.ts:69 (default-org fallback)
  - src/features/eds/handlers/edsDaLiveAuthHandlers.ts:271-311 (pre-auth gate)
  - src/features/eds/ui/components/DaLiveServiceCard.tsx:58-92 (org text input)
  - src/features/eds/commands/cleanupDaLiveSites.ts:34,39 (defaultOrg pre-fill;
    replaced with picker in Step 7)

Verify during implementation:
  - Current OAuth scopes include 'read:org' (add if missing)
  - Repo creation endpoint handles both /user/repos and /orgs/{org}/repos
  - Phase 3 install messaging differentiates personal vs team-org Code Sync
    case (admin-needed framing for team orgs)
  - No remaining references to demoBuilder.daLive.defaultOrg in src/ or tests/

Tests: 10-12 deltas as listed in the "Tests" section. End-to-end wizard
verification by manually creating a demo against (a) the personal account
and (b) a team org once both code paths land.

Target: ship as part of beta.115 or next release window.
```
