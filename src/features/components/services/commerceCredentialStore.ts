/**
 * Where a Commerce credential lives — asked in ONE place.
 *
 * Phase 1 of `.rptc/complete/component-secret-routing/`, and the READ half of the
 * whole scheme: SecretStorage first, `componentConfigs` second. It shipped first
 * and alone so that phase 2 could be a WRITE-only change — by then exactly one
 * function knew where to look.
 *
 * The fallback is not legacy. It is load-bearing in three ongoing states: a value
 * whose write could not be verified and was RETAINED, a project the activation
 * sweep has not reached, and the half of a pair that is not declared `secret` and
 * therefore never moves.
 *
 * The plan's own reasoning for doing this first: five call sites reaching into a
 * config map for a credential is what made the migration expensive in the first
 * place. There are three (verified 2026-08-17, not inherited — the plan warns its
 * own count was wrong within the hour):
 *
 *   `data-installer/services/commerceCredentials.ts`   extension host
 *   `eds/services/storeStructureReader.ts`             extension host
 *   `components/ui/hooks/useAutoStoreDetect.ts`        THE WEBVIEW
 *
 * ## The webview consumer cannot simply become a handler call, and here is why
 *
 * The plan says it becomes a round trip. That is right for Configure and WRONG for
 * the wizard, and the difference decides phase 2:
 *
 * - **Configure** renders a SAVED project. The value reached the webview because
 *   the host sent it at init, so the host can resolve it instead and the webview
 *   never needs it. This is the one that moves.
 * - **The wizard** renders a credential the user is TYPING. No project exists yet,
 *   so there is no SecretStorage key to read and nothing has been saved. The value
 *   is legitimately webview state, and no round trip can produce it.
 *
 * So the seam is not "the webview stops knowing credentials" — it is "the HOST can
 * always resolve them itself, and the webview only supplies what it just collected".
 * `discover-store-structure` accepts either, which is what lets Configure stop
 * sending them in phase 2 without breaking creation.
 *
 * @module features/components/services/commerceCredentialStore
 */

import {
    ACCS_OAUTH_CLIENT_ID,
    ACCS_OAUTH_CLIENT_SECRET,
    PAAS_ADMIN_PASSWORD,
    PAAS_ADMIN_USERNAME,
} from '../config/envVarKeys';
import { lookupComponentConfigValue, type ConfigMap } from './envVarHelpers';

/**
 * Namespace for credentials declared as component config fields.
 *
 * Deliberately NOT the App Builder prefix (`secretKey.ts`). Sharing it would be
 * tidier and would silently reinterpret every already-stored App Builder secret,
 * because that scheme's middle segment is a component id from a different catalog.
 * Two namespaces, no collision, no migration of a thing that is already working.
 */
const COMMERCE_SECRET_PREFIX = 'demoBuilder.componentSecret';

/**
 * The SecretStorage key for a component config field.
 *
 * Per-project and per-component, so two projects pointing at the same Commerce
 * instance keep separate credentials and deleting one never reaches the other.
 *
 * @param projectId - stable project identifier
 * @param componentId - the component declaring the field (e.g. `adobe-commerce-accs`)
 * @param varName - the env var name (e.g. `ACCS_OAUTH_CLIENT_SECRET`)
 */
export function commerceSecretKey(
    projectId: string,
    componentId: string,
    varName: string,
): string {
    return `${COMMERCE_SECRET_PREFIX}.${projectId}.${componentId}.${varName}`;
}

/** The reads this module needs. Matches `vscode.SecretStorage`'s `get`. */
export interface SecretReader {
    get(key: string): Thenable<string | undefined>;
}

export interface CommercePairDeps {
    /** Absent when no SecretStorage is available — then this is a config-only read. */
    secrets?: SecretReader;
    /** Stable project id for the key scheme. Absent = unsaved project, config only. */
    projectId?: string;
}

/** A credential pair, in the shape both backends' readers already return. */
export interface CommercePair {
    clientId: string;
    clientSecret: string;
}

export interface PaasPair {
    username: string;
    password: string;
}

/**
 * Read one value: SecretStorage first, then the config map.
 *
 * A SecretStorage miss is not an error. It is the normal answer for any key that
 * is not declared `secret`, for a retained write, and for an unswept project.
 */
async function readOne(
    deps: CommercePairDeps,
    componentId: string,
    varName: string,
    configs: ConfigMap,
): Promise<string | undefined> {
    if (deps.secrets && deps.projectId) {
        const stored = await deps.secrets.get(
            commerceSecretKey(deps.projectId, componentId, varName),
        );
        if (stored) return stored;
    }
    // Each half is looked up INDEPENDENTLY. Falling back through the pair readers
    // instead would apply their both-or-nothing rule to the fallback itself: once
    // the secret moves to storage, `readAccsOAuthPair(configs)` returns undefined
    // and the id — sitting right there in config — becomes unreadable too. That
    // half-and-half split is not an edge case, it is the steady state after
    // migration, so the pair would be lost the moment the migration succeeded.
    return lookupComponentConfigValue(configs ?? {}, varName);
}

/**
 * The ACCS OAuth pair for a project, wherever it lives.
 *
 * Both halves or nothing — the rule the sync readers already hold, kept here so a
 * half-migrated project cannot present as configured.
 */
export async function resolveAccsOAuthPair(
    deps: CommercePairDeps,
    configs: ConfigMap,
    componentId = 'adobe-commerce-accs',
): Promise<CommercePair | undefined> {
    const clientId = await readOne(deps, componentId, ACCS_OAUTH_CLIENT_ID, configs);
    const clientSecret = await readOne(deps, componentId, ACCS_OAUTH_CLIENT_SECRET, configs);

    // Both-or-nothing applies HERE, to the assembled pair — never to either
    // lookup, which is what made a half-migrated project unreadable.
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** The PaaS admin pair for a project, wherever it lives. Same both-or-nothing rule. */
export async function resolvePaasAdminPair(
    deps: CommercePairDeps,
    configs: ConfigMap,
    componentId = 'adobe-commerce-paas',
): Promise<PaasPair | undefined> {
    const username = await readOne(deps, componentId, PAAS_ADMIN_USERNAME, configs);
    const password = await readOne(deps, componentId, PAAS_ADMIN_PASSWORD, configs);

    return username && password ? { username, password } : undefined;
}
