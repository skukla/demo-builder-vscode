# Step 5: Wire the Gate into `checkExtensionUpdate` (beta fallback)

**Purpose:** Resolve an "effective channel" before fetching the extension release: if the configured channel is `early-access` but the collaborator gate fails, downgrade to `beta`. Stable/beta are unaffected.

**Prerequisites:**
- [x] Steps 1-4 green

---

## Tests to Write First

### New file: `tests/features/updates/services/updateManager-earlyAccess.test.ts`
Reuse `updateManager.testUtils.ts` mocks. Mock the gate:
```typescript
jest.mock('@/features/updates/services/collaboratorGate', () => ({
    isRepoCollaborator: jest.fn(),
    clearCollaboratorCache: jest.fn(),
}));
```
Plus the standard `vscode`, logging, timeoutConfig, validation, `global.fetch` mocks.

#### Group 1: early-access honored for collaborators
- [ ] config `'early-access'`; `isRepoCollaborator` → `true`; fetch array includes `2.0.0-alpha.1` + beta + final; assert `result.latest === '2.0.0-alpha.1'`; assert the array endpoint (`/releases?per_page=20`) was hit.

#### Group 2: fallback to beta when gate denies
- [ ] config `'early-access'`; `isRepoCollaborator` → `false`; same array; assert `result.latest === '1.2.0-beta.1'` (alpha excluded).
- [ ] config `'early-access'`; gate → `false`; assert it does NOT install the alpha even though alpha is highest semver.

#### Group 3: gate not consulted for non-EA channels
- [ ] config `'stable'`; assert `isRepoCollaborator` NOT called.
- [ ] config `'beta'`; assert `isRepoCollaborator` NOT called.

#### Group 4: gate failure path is graceful
- [ ] config `'early-access'`; `isRepoCollaborator` rejects → `checkExtensionUpdate` still resolves; treated as `false` → beta fallback (assert no throw).

### Re-point Step 2 test
- Move the "early-access picks alpha" assertion (previously ungated) into Group 1 here with `isRepoCollaborator → true`; remove the temporary Step 2 note.

---

## Files to Create/Modify
- [ ] `src/features/updates/services/updateManager.ts` — add effective-channel resolution
- [ ] `tests/features/updates/services/updateManager-earlyAccess.test.ts` (new)
- [ ] `tests/features/updates/services/updateManager.testUtils.ts` — add `createMockReleasesArray()` (final + beta + alpha)

---

## Implementation Details

### `updateManager.ts` edits

1. Import the gate (top of file):
```typescript
import { isRepoCollaborator } from './collaboratorGate';
```

2. Add a private helper:
```typescript
/**
 * Resolve the channel actually used for fetching. early-access is honored only
 * for verified repo collaborators; otherwise it falls back to beta. Never throws.
 */
private async resolveEffectiveChannel(configured: UpdateChannel): Promise<UpdateChannel> {
    if (configured !== 'early-access') return configured;
    const allowed = await isRepoCollaborator(this.context.secrets, this.logger);
    return allowed ? 'early-access' : 'beta';
}
```

3. Update `checkExtensionUpdate` (`:52-70`):
```typescript
async checkExtensionUpdate(): Promise<UpdateCheckResult> {
    const currentVersion = this.context.extension.packageJSON.version;
    const configuredChannel = this.getUpdateChannel();
    const channel = await this.resolveEffectiveChannel(configuredChannel);

    const latestRelease = await this.fetchLatestRelease(this.EXTENSION_REPO, channel);
    // ...rest unchanged (:58-69)
}
```

Note: `checkAllProjectsForUpdates` keeps using `getUpdateChannel()` and already collapses EA→beta for components (Step 2). The gate is only relevant to the extension's alpha track, so it is NOT called in the components loop (avoids extra GitHub calls per check).

### REFACTOR
- Single non-nested ternary in the helper. Confirm gate invoked only for EA.

---

## Acceptance Criteria
- [ ] Collaborators on EA get the alpha; non-collaborators get beta
- [ ] Gate not called for stable/beta
- [ ] No throw on gate failure; beta fallback
- [ ] All prior tests still green

**Estimated Time:** 3-4 hours
