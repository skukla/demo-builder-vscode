/**
 * Commerce credentials for an import, resolved per backend.
 *
 * The two backends are asymmetric and the asymmetry is the whole design:
 *
 * **PaaS has no gap.** The admin username and password are already in
 * `componentConfigs`, written when the project was built, and `getAdminToken`
 * elsewhere already treats them as the credential check.
 *
 * **ACCS has nothing.** Its REST API accepts only IMS OAuth2, so the pair comes
 * from an Adobe Developer Console **OAuth Server-to-Server** credential in a
 * project that has the *Adobe Commerce as a Cloud Service* API added. It cannot
 * be auto-provisioned — that API is product-profile gated on *Commerce Cloud
 * Manager*, which is the step that silently hides it from the Console UI. The
 * user creates it by hand and pastes it in once.
 *
 * **The ACCS pair lives in SecretStorage and nowhere else.** A value in
 * `componentConfigs` travels with the project on export unless its key is listed
 * in `SECRET_ENV_KEYS` (`components/config/envVarKeys.ts`) — so storing it there
 * would make a secret leave the machine the first time someone exported. Using
 * SecretStorage removes the question rather than answering it.
 *
 * **This module never says whether a credential WORKS.** For PaaS that is
 * `getAdminToken`; for ACCS nothing local can, which is exactly why the write
 * client has `operation_mode: 'validate'`. Resolution answers only "is there
 * something to try?".
 *
 * `getWorkspaceCredential()` is deliberately not reused here — wrong org, wrong
 * service, and it holds no secret. It is also deliberately not deleted: the
 * pending App Builder D2 plan names it as the pattern to mirror.
 *
 * @module features/data-installer/services/commerceCredentials
 */

import type { CommerceCredentials } from './dataInstallerWriteClient';
import { PAAS_ADMIN_PASSWORD, PAAS_ADMIN_USERNAME } from '@/features/components/config/envVarKeys';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';

/** Backend component ids, as they appear on a stack in `stacks.json`. */
const PAAS_BACKEND = 'adobe-commerce-paas';
const ACCS_BACKEND = 'adobe-commerce-accs';

/** SecretStorage key prefix. Per project — see {@link accsSecretKey}. */
const ACCS_SECRET_PREFIX = 'demoBuilder.dataInstaller.accs';

/** The minimum a caller must know about a project to resolve credentials. */
export interface CredentialProject {
    /** Backend component id from the project's stack. */
    stackBackend: string;
    componentConfigs: Record<string, Record<string, string | boolean | number | undefined>>;
}

/** The `vscode.SecretStorage` surface this module uses. Narrowed for testing. */
export interface SecretStore {
    store: (key: string, value: string) => PromiseLike<void>;
    get: (key: string) => PromiseLike<string | undefined>;
    delete: (key: string) => PromiseLike<void>;
}

/** Why credentials could not be resolved — a reason, never a message. */
export type CredentialGap = 'missing-paas-admin' | 'needs-accs-credentials' | 'unsupported-backend';

export type CredentialResolution =
    | { ok: true; credentials: CommerceCredentials }
    | { ok: false; reason: CredentialGap };

/**
 * Resolve what this project would authenticate an import with.
 *
 * Returns REASONS, never user-facing wording — the caller owns phrasing, the same
 * contract `dataInstallerConfig` follows.
 */
export async function resolveCommerceCredentials(args: {
    project: CredentialProject;
    secrets: SecretStore;
    /** Names the SecretStorage entry; ACCS only. */
    projectName?: string;
}): Promise<CredentialResolution> {
    const { project, secrets, projectName } = args;

    if (project.stackBackend === PAAS_BACKEND) {
        // Deliberately does not touch SecretStorage: a PaaS project must never
        // pick up a pair stored for some other project's ACCS backend.
        return resolvePaas(project);
    }
    if (project.stackBackend === ACCS_BACKEND) {
        return resolveAccs(secrets, projectName);
    }
    return { ok: false, reason: 'unsupported-backend' };
}

/** Store the ACCS pair. The only writer of this secret. */
export async function storeAccsCredentials(args: {
    secrets: SecretStore;
    projectName: string;
    clientId: string;
    clientSecret: string;
}): Promise<void> {
    const { secrets, projectName, clientId, clientSecret } = args;
    await secrets.store(accsSecretKey(projectName), JSON.stringify({ clientId, clientSecret }));
}

/** Forget the ACCS pair for one project. */
export async function clearAccsCredentials(args: {
    secrets: SecretStore;
    projectName: string;
}): Promise<void> {
    await args.secrets.delete(accsSecretKey(args.projectName));
}

/** Both halves or nothing — half a credential is a failure, not a partial success. */
function resolvePaas(project: CredentialProject): CredentialResolution {
    const username = lookupComponentConfigValue(project.componentConfigs, PAAS_ADMIN_USERNAME);
    const password = lookupComponentConfigValue(project.componentConfigs, PAAS_ADMIN_PASSWORD);
    if (!username || !password) {
        return { ok: false, reason: 'missing-paas-admin' };
    }
    return { ok: true, credentials: { kind: 'paas', username, password } };
}

/** Read the stored pair, treating anything unusable as absent. */
async function resolveAccs(
    secrets: SecretStore,
    projectName: string | undefined,
): Promise<CredentialResolution> {
    if (!projectName) {
        return { ok: false, reason: 'needs-accs-credentials' };
    }
    const raw = await secrets.get(accsSecretKey(projectName));
    if (!raw) {
        return { ok: false, reason: 'needs-accs-credentials' };
    }
    // A corrupted secret is "ask again", not a crash — the user can always
    // re-paste, and there is nothing to diagnose in an opaque store.
    try {
        const parsed = JSON.parse(raw) as { clientId?: unknown; clientSecret?: unknown };
        const clientId = typeof parsed.clientId === 'string' ? parsed.clientId : '';
        const clientSecret = typeof parsed.clientSecret === 'string' ? parsed.clientSecret : '';
        if (!clientId || !clientSecret) {
            return { ok: false, reason: 'needs-accs-credentials' };
        }
        return { ok: true, credentials: { kind: 'accs', clientId, clientSecret } };
    } catch {
        return { ok: false, reason: 'needs-accs-credentials' };
    }
}

/**
 * Per-project key.
 *
 * Not one global entry: a machine holds many projects, they can point at
 * different ACCS instances, and a shared key would silently authenticate an
 * import against whichever pair was stored last.
 */
function accsSecretKey(projectName: string): string {
    return `${ACCS_SECRET_PREFIX}.${projectName}`;
}
