/**
 * Commerce credentials for an import, resolved per backend.
 *
 * The two backends are asymmetric and the asymmetry is the whole design:
 *
 * **PaaS has no gap.** The admin username and password are already in
 * `componentConfigs`, written when the project was built, and `getAdminToken`
 * elsewhere already treats them as the credential check.
 *
 * **ACCS needs an OAuth pair.** Its REST API accepts only IMS OAuth2, so the
 * pair comes from an Adobe Developer Console **OAuth Server-to-Server**
 * credential. The user can paste one in, or let the extension provision it —
 * `accsCredentialProvisioner` creates the credential and subscribes
 * `ACCS-REST-API` to it, proven live 2026-08-13. An earlier version of this
 * docstring said auto-provisioning was impossible; that was wrong.
 *
 * **The ACCS pair lives in `componentConfigs`**, keyed on the
 * `adobe-commerce-accs` component — the same place a hand-pasted pair goes, so
 * there is one storage path and not two. An earlier version of this docstring
 * claimed SecretStorage "and nowhere else", which was never true of the shipped
 * code and is the kind of claim a reader trusts instead of checking.
 *
 * Export safety comes from `SECRET_ENV_KEYS` (`components/config/envVarKeys.ts`)
 * instead: `ACCS_OAUTH_CLIENT_SECRET` is listed there, so `stripSecretValues`
 * removes it from secret-free exports. The `secrets` parameter below is unused
 * and kept only for call-site stability — see its own note.
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
import { readAccsOAuthPair, readPaasAdminPair } from '@/features/components/services/envVarHelpers';

/** Backend component ids, as they appear on a stack in `stacks.json`. */
const PAAS_BACKEND = 'adobe-commerce-paas';
const ACCS_BACKEND = 'adobe-commerce-accs';

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
export type CredentialGap =
    | 'missing-paas-admin'
    | 'needs-accs-credentials'
    | 'unsupported-backend'
    | 'no-credential-service';

export type CredentialResolution =
    | { ok: true; credentials: CommerceCredentials }
    | { ok: false; reason: CredentialGap };

/**
 * What the shared-credential broker came back with.
 *
 * Two distinct failures, because they need different people to act. Deciding
 * WHICH is the wiring's job — it is the part that knows whether a discovery
 * service is configured — so this module stays a pure reader.
 */
export type BrokerOutcome =
    | { ok: true; credentials: { clientId: string; clientSecret: string } }
    | { ok: false; reason: 'not-configured' | 'unavailable' };

/** Ask the shared service for a pair. Supplied by the caller, never constructed here. */
export type CredentialBroker = () => Promise<BrokerOutcome>;

/**
 * Resolve what this project would authenticate an import with.
 *
 * Returns REASONS, never user-facing wording — the caller owns phrasing, the same
 * contract `dataInstallerConfig` follows.
 */
export async function resolveCommerceCredentials(args: {
    project: CredentialProject;
    /**
     * Unused, and kept only so callers need not change while the seam lands.
     * Both backends now read DECLARED config; when a credential moves to
     * SecretStorage (see `.rptc/backlog/component-secret-routing/`), this is where
     * the store gets consulted.
     */
    secrets?: SecretStore;
    projectName?: string;
    /**
     * The shared-credential fallback, for ACCS projects that declare no pair of
     * their own. Optional so a caller that has no way to build one — no settings
     * access, no Adobe session — behaves exactly as it did before this existed.
     */
    broker?: CredentialBroker;
}): Promise<CredentialResolution> {
    const { project } = args;

    if (project.stackBackend === PAAS_BACKEND) {
        return resolvePaas(project);
    }
    if (project.stackBackend === ACCS_BACKEND) {
        return resolveAccs(project, args.broker);
    }
    return { ok: false, reason: 'unsupported-backend' };
}

/** Both halves or nothing — half a credential is a failure, not a partial success. */
function resolvePaas(project: CredentialProject): CredentialResolution {
    const pair = readPaasAdminPair(project.componentConfigs);
    if (!pair) {
        return { ok: false, reason: 'missing-paas-admin' };
    }
    return { ok: true, credentials: { kind: 'paas', ...pair } };
}

/**
 * Read the OAuth pair declared on the ACCS component.
 *
 * Symmetric with {@link resolvePaas} on purpose: both halves or nothing, from the
 * same declared-config surface, so a user supplies either backend's credential
 * where they already supply everything else about it.
 *
 * **No admin-pair fallback.** The service accepts `admin_username`/`admin_password`
 * for ACCS too, but that is the legacy path — OAuth Server-to-Server is the IMS
 * model for SaaS. Accepting both here would quietly make the worse credential the
 * easy one.
 */
async function resolveAccs(
    project: CredentialProject,
    broker?: CredentialBroker,
): Promise<CredentialResolution> {
    const pair = readAccsOAuthPair(project.componentConfigs);
    if (pair) {
        return { ok: true, credentials: { kind: 'accs', ...pair } };
    }
    if (!broker) {
        return { ok: false, reason: 'needs-accs-credentials' };
    }

    // A broker failure is never fatal: this runs in front of a modal and inside
    // project creation, and both already handle "no credentials". Anything the
    // broker throws collapses to the gap it was asked to fill.
    const outcome = await broker().catch(
        () => ({ ok: false, reason: 'unavailable' }) as BrokerOutcome,
    );
    if (outcome.ok) {
        return { ok: true, credentials: { kind: 'accs', ...outcome.credentials } };
    }
    return {
        ok: false,
        reason: outcome.reason === 'not-configured' ? 'no-credential-service' : 'needs-accs-credentials',
    };
}

