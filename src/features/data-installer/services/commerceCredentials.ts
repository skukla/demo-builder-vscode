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
 * **The ACCS pair is SPLIT, and asking where it lives has one answer only via
 * `commerceCredentialStore`.** As of 2026-08-17 the client SECRET is declared
 * `secret: true` and routes to VS Code SecretStorage; the client ID is not a
 * secret and stays in `componentConfigs`. So neither "it is in configs" nor "it is
 * in SecretStorage" is true of the pair — each half is looked up independently and
 * assembled here.
 *
 * This docstring has now been wrong in BOTH directions: it once claimed
 * SecretStorage "and nowhere else" when nothing wrote there, and then claimed
 * `componentConfigs` after half of it moved. Do not restate where the value lives;
 * name the accessor and let it answer.
 *
 * Export safety still comes from `SECRET_ENV_KEYS` (`components/config/envVarKeys.ts`)
 * as well: a write that could not be verified is RETAINED in configs, so
 * `stripSecretValues` remains the backstop rather than becoming redundant.
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
import {
    resolveAccsOAuthPair,
    resolvePaasAdminPair,
    type CommercePairDeps,
} from '@/features/components/services/commerceCredentialStore';

/** Backend component ids, as they appear on a stack in `stacks.json`. */
const PAAS_BACKEND = 'adobe-commerce-paas';
const ACCS_BACKEND = 'adobe-commerce-accs';

/** The minimum a caller must know about a project to resolve credentials. */
export interface CredentialProject {
    /** Backend component id from the project's stack. */
    stackBackend: string;
    componentConfigs: Record<string, Record<string, string | boolean | number | undefined>>;
    /**
     * Project path — the SecretStorage key scheme's project segment, the same one
     * `persistAppBuilderComponentSecrets` uses.
     *
     * Optional because an UNSAVED project has none, and a credential cannot be in
     * SecretStorage before the project it belongs to exists. Absent simply means
     * "config only", which is what every read did before the seam landed.
     */
    path?: string;
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
     * The credential store, consulted BEFORE `componentConfigs`.
     *
     * Wired 2026-08-17 (`.rptc/complete/component-secret-routing/`). Omitting it
     * degrades every resolution to config-only, which after migration means a
     * declared secret resolves to nothing and the caller reports "no usable
     * credentials". Pass it wherever one exists.
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
    const deps: CommercePairDeps = {
        ...(args.secrets ? { secrets: args.secrets } : {}),
        ...(project.path ? { projectId: project.path } : {}),
    };

    if (project.stackBackend === PAAS_BACKEND) {
        return resolvePaas(deps, project);
    }
    if (project.stackBackend === ACCS_BACKEND) {
        return resolveAccs(deps, project, args.broker);
    }
    return { ok: false, reason: 'unsupported-backend' };
}

/** Both halves or nothing — half a credential is a failure, not a partial success. */
async function resolvePaas(
    deps: CommercePairDeps,
    project: CredentialProject,
): Promise<CredentialResolution> {
    const pair = await resolvePaasAdminPair(deps, project.componentConfigs);
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
    deps: CommercePairDeps,
    project: CredentialProject,
    broker?: CredentialBroker,
): Promise<CredentialResolution> {
    const pair = await resolveAccsOAuthPair(deps, project.componentConfigs);
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

