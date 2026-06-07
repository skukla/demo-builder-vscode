# Step 6: Graduation Off-Ramp (detect stranded alpha + prompt)

**Purpose:** When the user is on `early-access` and running an `-alpha.*` build whose base version is met/exceeded by a final release, prompt them to switch back to stable/beta so they aren't stranded on the last alpha after the feature graduates.

**Prerequisites:**
- [x] Steps 1-5 green
- [x] Off-ramp is prompt-only with action buttons (CONFIRMED)

---

## Tests to Write First

### Part A — detection logic (pure): add to `tests/features/updates/services/updateManager-earlyAccess.test.ts`
Add `describe('graduation off-ramp detection')` for a new pure helper `shouldOfferGraduation(installedVersion, latestFinalVersion)` exported from `releaseTrack.ts`:

- [ ] installed `2.0.0-alpha.5`, latestFinal `2.0.0` → `true`
- [ ] installed `2.0.0-alpha.5`, latestFinal `2.0.1` → `true`
- [ ] installed `2.0.0-alpha.5`, latestFinal `1.9.0` → `false`
- [ ] installed `2.0.0` (final) → `false`
- [ ] installed `2.0.0-beta.1` (beta) → `false`
- [ ] installed garbage / latestFinal null → `false` (no throw)

### Part B — command surface: add to a checkUpdates test
Mirror the existing prompt pattern (`checkUpdates.ts:151-166` uses `vscode.window.showInformationMessage`). Mock `vscode.window.showInformationMessage` and `vscode.workspace.getConfiguration().update`.

- [ ] When channel `early-access`, installed `2.0.0-alpha.5`, final `2.0.0` exists → shows info message offering "Switch to Beta" / "Switch to Stable" / "Stay".
- [ ] "Switch to Beta" → calls `config.update('updateChannel', 'beta', ...)`.
- [ ] "Switch to Stable" → calls `config.update('updateChannel', 'stable', ...)`.
- [ ] "Stay"/dismiss → writes nothing.
- [ ] Not on early-access → no graduation prompt.

---

## Files to Create/Modify
- [ ] `src/features/updates/services/releaseTrack.ts` — add `shouldOfferGraduation()`
- [ ] `src/features/updates/services/updateManager.ts` — add `getLatestFinalVersion()`
- [ ] `src/features/updates/commands/checkUpdates.ts` — show the prompt
- [ ] Tests as above

---

## Implementation Details

### `releaseTrack.ts` — add pure helper
```typescript
/**
 * True when the installed version is an -alpha.* whose base (major.minor.patch)
 * is met or exceeded by a final release — i.e. the feature has graduated and the
 * user would otherwise be stranded on the last alpha. Never throws.
 */
export function shouldOfferGraduation(
    installedVersion: string,
    latestFinalVersion: string | null,
): boolean {
    if (!latestFinalVersion) return false;
    const parsed = semver.parse(installedVersion.replace(/^v/, ''));
    if (!parsed) return false;
    const isAlpha = parsed.prerelease.length > 0 && String(parsed.prerelease[0]) === 'alpha';
    if (!isAlpha) return false;
    const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    try {
        return semver.gte(latestFinalVersion.replace(/^v/, ''), base);
    } catch {
        return false;
    }
}
```

### `updateManager.ts` — expose the latest final
```typescript
/** Latest final (stable) version string, or null. Used by the graduation off-ramp. */
async getLatestFinalVersion(): Promise<string | null> {
    const release = await this.fetchLatestRelease(this.EXTENSION_REPO, 'stable');
    return release ? release.version : null;
}
```

### `checkUpdates.ts` — show the prompt
Import:
```typescript
import { shouldOfferGraduation } from '@/features/updates/services/releaseTrack';
```
Inside `execute()`, after the existing extension-update handling block (`:151-166`) and only when no extension update was applied:
```typescript
await this.maybeOfferGraduation(updateManager, extensionUpdate.current);
```
Add the methods:
```typescript
private async maybeOfferGraduation(
    updateManager: UpdateManager,
    installedVersion: string,
): Promise<void> {
    const channel = vscode.workspace.getConfiguration('demoBuilder')
        .get<string>('updateChannel', 'stable');
    if (channel !== 'early-access') return;

    const latestFinal = await updateManager.getLatestFinalVersion();
    if (!shouldOfferGraduation(installedVersion, latestFinal)) return;

    const choice = await vscode.window.showInformationMessage(
        `A final release (v${latestFinal}) now supersedes your preview build (v${installedVersion}). `
        + 'Switch off the early-access channel to keep receiving updates?',
        'Switch to Beta',
        'Switch to Stable',
        'Stay',
    );

    if (choice === 'Switch to Beta') {
        await this.setChannel('beta');
    } else if (choice === 'Switch to Stable') {
        await this.setChannel('stable');
    }
}

private async setChannel(channel: 'stable' | 'beta'): Promise<void> {
    await vscode.workspace.getConfiguration('demoBuilder')
        .update('updateChannel', channel, vscode.ConfigurationTarget.Global);
    this.logger.info(`[Updates] Update channel switched to ${channel} (graduation off-ramp)`);
}
```
(One `if/else if` chain, not a nested ternary — SOP-compliant.)

### REFACTOR
- Keep `shouldOfferGraduation` pure (in `releaseTrack.ts`) so it stays unit-testable without vscode.

---

## Acceptance Criteria
- [ ] `shouldOfferGraduation` correct for alpha/beta/final/garbage; never throws
- [ ] Prompt only shown on `early-access` when a final supersedes the installed alpha base
- [ ] Action buttons write `updateChannel`; "Stay"/dismiss writes nothing
- [ ] No auto-write without user choice
- [ ] Tests green

**Estimated Time:** 4-5 hours
