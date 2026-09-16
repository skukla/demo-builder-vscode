/**
 * A component's own screen, served by one of its actions and opened with a key.
 *
 * The ERP cannot use App Builder's static site: it deploys into the same Runtime
 * namespace as its integration, a namespace has ONE static site, and
 * `aio app deploy` empties it before uploading, so two apps with web assets delete
 * each other's pages (aio-lib-web `deploy-web.js`, read 2026-09-16). The ERP
 * therefore serves its screen from a web action that has no Adobe sign-in, and
 * that action's access control is a key Demo Builder generates.
 *
 * The key lives in SecretStorage only. It travels in the deploy's process env and
 * in the link the extension opens; never the manifest, `.env`, logs or a webview.
 *
 * @module features/app-builder/services/systemScreen
 */

import * as crypto from 'crypto';
import { secretKey } from './secretKey';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** The SecretStorage surface this module needs (matches vscode.SecretStorage). */
export interface ScreenKeyStore {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
    store(key: string, value: string): Thenable<void> | Promise<void>;
    delete(key: string): Thenable<void> | Promise<void>;
}

/** An entry that declares a screen. */
type ScreenEntry = AppBuilderComponentCatalogEntry & {
    screen: NonNullable<AppBuilderComponentCatalogEntry['screen']>;
};

/** Whether the entry declares a screen. */
export function hasScreen(entry: AppBuilderComponentCatalogEntry): entry is ScreenEntry {
    return entry.screen !== undefined;
}

function storageKey(projectPath: string, entry: ScreenEntry): string {
    return secretKey(projectPath, entry.id, entry.screen.keyEnvVar);
}

/**
 * The deploy env that carries the screen key, generating and storing the key the
 * first time. A redeploy reuses it, so a link already open keeps working.
 *
 * @returns `{ <keyEnvVar>: key }`, or `{}` for an entry with no screen
 */
export async function ensureScreenKeyEnv(
    store: ScreenKeyStore,
    projectPath: string,
    entry: AppBuilderComponentCatalogEntry,
): Promise<Record<string, string>> {
    if (!hasScreen(entry)) return {};
    const key = storageKey(projectPath, entry);
    let value = await store.get(key);
    if (!value) {
        value = crypto.randomBytes(32).toString('base64url');
        await store.store(key, value);
    }
    return { [entry.screen.keyEnvVar]: value };
}

/** The stored key, or undefined when the component was never deployed from here. */
export async function readScreenKey(
    store: ScreenKeyStore,
    projectPath: string,
    entry: AppBuilderComponentCatalogEntry,
): Promise<string | undefined> {
    if (!hasScreen(entry)) return undefined;
    return (await store.get(storageKey(projectPath, entry))) || undefined;
}

/** Forget the key when the component is removed. A no-op for an entry with no screen. */
export async function forgetScreenKey(
    store: ScreenKeyStore,
    projectPath: string,
    entry: AppBuilderComponentCatalogEntry,
): Promise<void> {
    if (!hasScreen(entry)) return;
    await store.delete(storageKey(projectPath, entry));
}

/**
 * The screen action's URL among the deployed URLs: the web URL whose last segment
 * is the declared action.
 */
export function deriveScreenUrl(
    entry: AppBuilderComponentCatalogEntry,
    deployedUrls: Record<string, string> | undefined,
): string | undefined {
    if (!hasScreen(entry)) return undefined;
    const suffix = `/${entry.screen.action}`;
    return Object.values(deployedUrls ?? {}).find((url) => url.includes('/api/v1/web/') && url.endsWith(suffix));
}

/**
 * The link that opens the screen. The trailing slash matters: the page resolves
 * its script and stylesheet from its own address.
 */
export function screenLink(screenUrl: string, key: string): string {
    return `${screenUrl.replace(/\/+$/, '')}/?key=${encodeURIComponent(key)}`;
}
