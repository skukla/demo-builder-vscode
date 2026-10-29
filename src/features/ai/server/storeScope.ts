/**
 * The Commerce store scope as the agent surface takes it: three codes, together.
 *
 * One definition for every tool that accepts it — `configure_project` on an existing
 * project, `create_project` and `create_project_from_file` at creation (AI-11) — so
 * they cannot drift on what a valid scope is or where it is stored.
 *
 * WHERE it is stored depends on the backend (PL-76). SaaS (ACCS) reads `ACCS_*_CODE`;
 * PaaS and ACO read `ADOBE_COMMERCE_*_CODE`, the same split the storefront config
 * makes (`storefrontConfigParams.ts`). This used to write the ACCS names for every
 * backend, so on a PaaS project the scope looked applied and nothing read it.
 */

import { z } from 'zod';
import {
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import { mapBackendToEnvironmentType } from '@/features/eds/services/storefrontConfigParams';

/**
 * All THREE codes or none: two of three is a broken scope, not a narrower one.
 */
export const storeScopeSchema = z
    .object({
        website: z.string(),
        store: z.string(),
        storeView: z.string(),
    })
    .describe(
        'All THREE codes together, from discover_store_structure. Two of three is a broken scope, not a narrower one',
    );

export type StoreScope = z.infer<typeof storeScopeSchema>;

const ACCS_SCOPE_ENV: Record<keyof StoreScope, string> = {
    website: ACCS_WEBSITE_CODE,
    store: ACCS_STORE_CODE,
    storeView: ACCS_STORE_VIEW_CODE,
};

const PAAS_SCOPE_ENV: Record<keyof StoreScope, string> = {
    website: PAAS_WEBSITE_CODE,
    store: PAAS_STORE_CODE,
    storeView: PAAS_STORE_VIEW_CODE,
};

/** Env-var name each scope code is stored under, for this backend. */
function scopeEnvFor(backendId: string): Record<keyof StoreScope, string> {
    return mapBackendToEnvironmentType(backendId) === 'accs' ? ACCS_SCOPE_ENV : PAAS_SCOPE_ENV;
}

/**
 * The three env-var names this backend stores the scope under, website → store →
 * store view.
 *
 * @param backendId - the project's backend component id
 * @returns the three names
 */
export function storeScopeEnvKeys(backendId: string): readonly string[] {
    return Object.values(scopeEnvFor(backendId));
}

/**
 * The scope as the env vars this backend's config stores it under.
 *
 * @param scope - the three codes
 * @param backendId - the project's backend component id
 * @returns e.g. `{ ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE }` for SaaS
 */
export function storeScopeEnv(scope: StoreScope, backendId: string): Record<string, string> {
    const env = scopeEnvFor(backendId);
    return {
        [env.website]: scope.website,
        [env.store]: scope.store,
        [env.storeView]: scope.storeView,
    };
}

/** What every tool answers when the project or stack has nowhere to keep a scope. */
export const NO_BACKEND_FOR_SCOPE =
    'Cannot set store scope: this project has no backend component selected.';
