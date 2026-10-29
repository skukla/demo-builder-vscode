/**
 * The workspace credential the Commerce REST client signs with, kept across window reloads.
 *
 * WHY. Reading it is three Adobe Console calls, and Console's first answer to one of them
 * has been failing after about 60s and succeeding on the retry (2026-09-24, again
 * 2026-10-01): every reload made the first Commerce call — the setup guide's first check —
 * wait a minute. The IMS mint from a saved credential takes under a second. Owner-approved
 * 2026-10-01.
 *
 * SECRET SAFETY (repo is PUBLIC). Only the three fields the IMS mint needs are kept, in VS
 * Code SecretStorage and nowhere else: never the manifest, a log, a webview or an agent.
 * A credential IMS refuses — rotated, or its workspace recreated — is deleted by the client
 * the moment that happens and read from Console again, so a stale copy cleans itself up.
 *
 * @module features/ai/server/savedRestCredential
 */

/** What the IMS mint needs. */
export interface RestCredential {
    clientId: string;
    clientSecret: string;
    imsOrgCode: string;
}

/** The SecretStorage surface this uses (matches vscode.SecretStorage). */
export interface CredentialStore {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
    store(key: string, value: string): Thenable<void> | Promise<void>;
    delete(key: string): Thenable<void> | Promise<void>;
}

const keyFor = (workspaceId: string): string => `demoBuilder.commerceRest.credential.${workspaceId}`;

/** The saved credential for a workspace, or undefined when none is kept (or it is unreadable). */
export async function readSavedCredential(
    store: CredentialStore | undefined,
    workspaceId: string,
): Promise<RestCredential | undefined> {
    const raw = await store?.get(keyFor(workspaceId));
    if (!raw) return undefined;
    try {
        const saved = JSON.parse(raw) as Partial<RestCredential>;
        if (saved.clientId && saved.clientSecret && saved.imsOrgCode) {
            return { clientId: saved.clientId, clientSecret: saved.clientSecret, imsOrgCode: saved.imsOrgCode };
        }
    } catch {
        // Unreadable: treated as none, and replaced on the next save.
    }
    return undefined;
}

/** Keep a credential read from Console; only the fields the mint needs. */
export async function saveCredential(
    store: CredentialStore | undefined,
    workspaceId: string,
    credential: RestCredential,
): Promise<void> {
    const { clientId, clientSecret, imsOrgCode } = credential;
    await store?.store(keyFor(workspaceId), JSON.stringify({ clientId, clientSecret, imsOrgCode }));
}

/** Drop a saved credential IMS refused. */
export async function forgetCredential(
    store: Pick<CredentialStore, 'delete'> | undefined,
    workspaceId: string,
): Promise<void> {
    await store?.delete(keyFor(workspaceId));
}
