/**
 * The private halves of the access keys a project made for its private ACO catalog views (PL-60):
 * VS Code SecretStorage, one entry per project, keyed by ACO's key id. ACO holds only the public half,
 * so nothing but this store can sign for that key.
 *
 * @module features/components/services/acoAccessKeyStore
 */

import type { AcoSecretStore } from './acoCredentialStore';

const PREFIX = 'demoBuilder.acoAccessKeys';

/** The key for a project's access keys, by the project's path (as the other project secrets are). */
export function acoAccessKeysKey(projectPath: string): string {
    return `${PREFIX}.${projectPath}`;
}

async function readAll(store: Pick<AcoSecretStore, 'get'>, projectPath: string): Promise<Record<string, string>> {
    const raw = await store.get(acoAccessKeysKey(projectPath));
    if (!raw) return {};
    try {
        return JSON.parse(raw) as Record<string, string>;
    } catch {
        return {};
    }
}

/** The private key for one ACO key id, or undefined when this project did not make it. */
export async function readAcoAccessKey(store: Pick<AcoSecretStore, 'get'> | undefined, projectPath: string, keyId: string): Promise<string | undefined> {
    return store ? (await readAll(store, projectPath))[keyId] : undefined;
}

/** Keep a private key under the id ACO gave it. */
export async function saveAcoAccessKey(store: Pick<AcoSecretStore, 'get' | 'store'>, projectPath: string, keyId: string, privateKey: string): Promise<void> {
    const all = await readAll(store, projectPath);
    await store.store(acoAccessKeysKey(projectPath), JSON.stringify({ ...all, [keyId]: privateKey }));
}

/** Drop one private key. */
export async function forgetAcoAccessKey(store: AcoSecretStore, projectPath: string, keyId: string): Promise<void> {
    const { [keyId]: _gone, ...rest } = await readAll(store, projectPath);
    if (Object.keys(rest).length > 0) await store.store(acoAccessKeysKey(projectPath), JSON.stringify(rest));
    else await store.delete(acoAccessKeysKey(projectPath));
}

/** Drop every private key a project holds, when the project goes. */
export async function forgetAcoAccessKeys(store: Pick<AcoSecretStore, 'delete'>, projectPath: string): Promise<void> {
    await store.delete(acoAccessKeysKey(projectPath));
}

/**
 * Move a project's private keys after a rename. The old entry goes only once the new one reads back the
 * same, as the other project secrets are moved.
 *
 * @returns false when the copy could not be verified, so the old entry was left
 */
export async function moveAcoAccessKeys(store: AcoSecretStore, oldPath: string, newPath: string): Promise<boolean> {
    if (oldPath === newPath) return true;
    const raw = await store.get(acoAccessKeysKey(oldPath));
    if (!raw) return true;
    await store.store(acoAccessKeysKey(newPath), raw);
    if ((await store.get(acoAccessKeysKey(newPath))) !== raw) return false;
    await store.delete(acoAccessKeysKey(oldPath));
    return true;
}
