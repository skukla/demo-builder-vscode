/**
 * Where `DaLiveAuthService` keeps the DA.live access token: SecretStorage, with
 * the one-time move out of globalState run first.
 *
 * Every read, store and sign-out awaits that move before it touches the token,
 * so a stale globalState copy can never land on top of a newer sign-in or
 * survive a sign-out. The writes themselves stay in `daLiveTokenMigration`
 * (`storeDaLiveToken`, `forgetDaLiveToken`), the one place that writes or
 * deletes the stored token. Nothing here logs the token.
 *
 * Its own file so `daLiveAuthService.ts` keeps the session (who is signed in,
 * until when) and this keeps the storage.
 *
 * @module features/eds/services/daLive/daLiveTokenHome
 */

import type * as vscode from 'vscode';
import {
    DA_LIVE_TOKEN_SECRET_KEY,
    LEGACY_TOKEN_STATE_KEY,
    forgetDaLiveToken,
    migrateDaLiveTokenToSecretStorage,
    storeDaLiveToken,
} from './daLiveTokenMigration';

/** The token's storage, as the auth service uses it. */
export interface DaLiveTokenHome {
    /**
     * Move a token an older build left in globalState into SecretStorage
     * (verify-then-delete; see `daLiveTokenMigration`). Runs once per home.
     * Never rejects.
     */
    migrateLegacyToken(): Promise<void>;
    /**
     * The raw token, from SecretStorage. Falls back to a globalState copy only
     * when the keychain refused to take it, so an SC is never signed out by the
     * move itself.
     */
    read(): Promise<string | undefined>;
    /** Store the token, then drop a globalState copy the keychain once refused. */
    store(token: string): Promise<void>;
    /** Remove the token from SecretStorage and any globalState copy (sign-out). */
    forget(): Promise<void>;
}

/** The two lines the home writes to the log. */
interface TokenHomeLog {
    info(line: string): void;
    warn(line: string): void;
}

/**
 * Build the token's home over one extension context.
 *
 * @param context - the context whose SecretStorage and globalState hold the token
 * @param log - where the move's outcome and a failed read are written
 */
export function createDaLiveTokenHome(
    context: Pick<vscode.ExtensionContext, 'globalState' | 'secrets'>,
    log: TokenHomeLog,
): DaLiveTokenHome {
    /** The one-time move out of globalState, run at most once per home. */
    let legacyMigration: Promise<void> | undefined;

    const migrateLegacyToken = (): Promise<void> => {
        legacyMigration ??= migrateDaLiveTokenToSecretStorage(
            context.globalState,
            context.secrets,
            (line) => log.info(`[DA.live Auth] ${line}`),
        ).then(() => undefined);
        return legacyMigration;
    };

    /** Drop a globalState token copy, if an older build left one. */
    const clearLegacyToken = async (): Promise<void> => {
        if (context.globalState.get(LEGACY_TOKEN_STATE_KEY) !== undefined) {
            await context.globalState.update(LEGACY_TOKEN_STATE_KEY, undefined);
        }
    };

    return {
        migrateLegacyToken,
        read: async () => {
            await migrateLegacyToken();
            try {
                const stored = await context.secrets.get(DA_LIVE_TOKEN_SECRET_KEY);
                if (stored) {
                    return stored;
                }
            } catch {
                log.warn('[DA.live Auth] Could not read the token from SecretStorage');
            }
            return context.globalState.get<string>(LEGACY_TOKEN_STATE_KEY);
        },
        store: async (token) => {
            // Let any pending move finish first, so an old globalState token cannot
            // be copied over this one afterwards.
            await migrateLegacyToken();
            await storeDaLiveToken(context.secrets, token);
            // A copy the keychain once refused to take is now stale; drop it.
            await clearLegacyToken();
        },
        forget: async () => {
            // A move still in flight would otherwise write the token back afterwards.
            await migrateLegacyToken();
            await forgetDaLiveToken(context.secrets);
            await clearLegacyToken();
        },
    };
}
