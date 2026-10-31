/**
 * Where a project's ACO ingestion credential lives: VS Code SecretStorage, one entry per project,
 * never a project file (PL-60, owner 2026-10-31 P2). Demo Builder puts it there when it provisions
 * the credential in the project's Adobe workspace (`acoProvisioning.ts`) and takes it away when ACO
 * leaves the project; the project's delete and rename carry it (`projectSecretCleanup.ts`).
 *
 * The client id is not a secret, but it is kept beside the secret so the pair is one read and one
 * delete, and so no project file names a credential at all.
 *
 * @module features/components/services/acoCredentialStore
 */

import type { AcoCredential } from '@/types/aco';

/** Its own namespace: neither the Commerce field scheme nor the App Builder one. */
const ACO_CREDENTIAL_PREFIX = 'demoBuilder.acoCredential';

/** The SecretStorage surface this uses (matches `vscode.SecretStorage`). */
export interface AcoSecretStore {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
    store(key: string, value: string): Thenable<void> | Promise<void>;
    delete(key: string): Thenable<void> | Promise<void>;
}

/** The key for a project's ACO credential, by the project's path (as the other project secrets are). */
export function acoCredentialKey(projectPath: string): string {
    return `${ACO_CREDENTIAL_PREFIX}.${projectPath}`;
}

/** The project's ACO credential, or undefined when none is kept or it cannot be read. */
export async function readAcoCredential(store: Pick<AcoSecretStore, 'get'> | undefined, projectPath: string): Promise<AcoCredential | undefined> {
    const raw = await store?.get(acoCredentialKey(projectPath));
    if (!raw) return undefined;
    try {
        const saved = JSON.parse(raw) as Partial<AcoCredential>;
        if (typeof saved.clientId === 'string' && saved.clientId && typeof saved.clientSecret === 'string' && saved.clientSecret) {
            return { clientId: saved.clientId, clientSecret: saved.clientSecret };
        }
    } catch {
        // Unreadable: treated as none, and replaced by the next provisioning.
    }
    return undefined;
}

/** Keep the project's ACO credential. */
export async function saveAcoCredential(store: Pick<AcoSecretStore, 'store'>, projectPath: string, credential: AcoCredential): Promise<void> {
    const { clientId, clientSecret } = credential;
    await store.store(acoCredentialKey(projectPath), JSON.stringify({ clientId, clientSecret }));
}

/** Drop the project's ACO credential; nothing happens when none is kept. */
export async function forgetAcoCredential(store: Pick<AcoSecretStore, 'delete'>, projectPath: string): Promise<void> {
    await store.delete(acoCredentialKey(projectPath));
}

/** What a rename's move of the credential did. */
export type AcoCredentialMove = 'none' | 'moved' | 'not-verified';

/**
 * Move the credential to the project's new path after a rename. The old entry is deleted only once
 * the new one reads back the same, as the other project secrets are moved (`reKeyProjectSecrets`).
 */
export async function moveAcoCredential(store: AcoSecretStore, oldPath: string, newPath: string): Promise<AcoCredentialMove> {
    if (oldPath === newPath) return 'none';
    const raw = await store.get(acoCredentialKey(oldPath));
    if (!raw) return 'none';
    await store.store(acoCredentialKey(newPath), raw);
    if ((await store.get(acoCredentialKey(newPath))) !== raw) return 'not-verified';
    await store.delete(acoCredentialKey(oldPath));
    return 'moved';
}
