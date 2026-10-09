/**
 * Move the DA.live access token out of globalState and into SecretStorage.
 *
 * Until 2026-10-09 the token sat in `globalState`, which VS Code keeps as plain,
 * unencrypted data on disk, while every other credential the extension holds was
 * already in SecretStorage (the OS keychain). The owner approved the move that day.
 * This is the one-time copy for an SC who signed in before it, so nobody has to
 * sign in again.
 *
 * The sequencing is the one `commerceSecretMigration` uses, for the same reason:
 *
 *   **write → read back → only then remove the old copy.**
 *
 * A keychain that refuses the write, or accepts it and stores nothing, leaves the
 * globalState copy exactly where it was; the SC stays signed in and the next run
 * tries again. Only the token moves. Expiry, email and org are not secrets and
 * stay in globalState.
 *
 * This module is also the ONE place that writes or deletes the stored token
 * (`storeDaLiveToken`, `forgetDaLiveToken`); `tests/templates/spine-chokepoints`
 * pins that. Nothing here logs the token.
 *
 * @module features/eds/services/daLive/daLiveTokenMigration
 */

import type * as vscode from 'vscode';

/** Where the token lives now (SecretStorage). */
export const DA_LIVE_TOKEN_SECRET_KEY = 'demoBuilder.daLive.accessToken';

/** Where builds before 2026-10-09 kept it (globalState). Read only to move it out. */
export const LEGACY_TOKEN_STATE_KEY = 'daLive.accessToken';

/** `moved`: now in SecretStorage only. `retained`: still in globalState. `none`: nothing to move. */
type DaLiveTokenMigrationResult = 'moved' | 'retained' | 'none';

/** Store the token in SecretStorage. Throws if the keychain refuses. */
export async function storeDaLiveToken(
    secrets: Pick<vscode.SecretStorage, 'store'>,
    token: string,
): Promise<void> {
    await secrets.store(DA_LIVE_TOKEN_SECRET_KEY, token);
}

/** Delete the token from SecretStorage (sign-out). */
export async function forgetDaLiveToken(
    secrets: Pick<vscode.SecretStorage, 'delete'>,
): Promise<void> {
    await secrets.delete(DA_LIVE_TOKEN_SECRET_KEY);
}

/**
 * Copy a globalState token into SecretStorage, verify it, then delete the
 * globalState copy. Never throws. Safe to run any number of times.
 *
 * A globalState copy always wins over one already in SecretStorage: only an older
 * build writes that key, so finding one there means it is the newest sign-in.
 */
export async function migrateDaLiveTokenToSecretStorage(
    globalState: Pick<vscode.Memento, 'get' | 'update'>,
    secrets: Pick<vscode.SecretStorage, 'get' | 'store'>,
    log?: (line: string) => void,
): Promise<DaLiveTokenMigrationResult> {
    const legacy = globalState.get<string>(LEGACY_TOKEN_STATE_KEY);
    if (typeof legacy !== 'string' || legacy === '') {
        return 'none';
    }

    try {
        await storeDaLiveToken(secrets, legacy);
        // The read-back is the safety property: a write that reports success
        // and keeps nothing must not cost the SC their session.
        if ((await secrets.get(DA_LIVE_TOKEN_SECRET_KEY)) !== legacy) {
            log?.('DA.live token: SecretStorage write not verified, left in globalState');
            return 'retained';
        }
    } catch {
        // The error text is not logged: it is the keychain's, and nothing
        // guarantees it never echoes the value it was handed.
        log?.('DA.live token: SecretStorage refused the write, left in globalState');
        return 'retained';
    }

    try {
        await globalState.update(LEGACY_TOKEN_STATE_KEY, undefined);
    } catch {
        log?.('DA.live token: copied to SecretStorage, globalState copy not removed');
        return 'retained';
    }

    log?.('DA.live token: moved from globalState to SecretStorage');
    return 'moved';
}
