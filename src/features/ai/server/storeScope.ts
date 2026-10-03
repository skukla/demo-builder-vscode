/**
 * The Commerce store scope as the agent surface takes it: three codes, together.
 *
 * One definition for every tool that accepts it — `configure_project` on an existing
 * project, `create_project` and `create_project_from_file` at creation (AI-11) — so
 * they cannot drift on what a valid scope is or where it is stored.
 */

import { z } from 'zod';
import {
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';

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

/** Env-var name each scope code is stored under, on the backend's config. */
const SCOPE_ENV: Record<keyof StoreScope, string> = {
    website: ACCS_WEBSITE_CODE,
    store: ACCS_STORE_CODE,
    storeView: ACCS_STORE_VIEW_CODE,
};

/** The three env-var names, in website → store → store view order. */
export const STORE_SCOPE_ENV_KEYS: readonly string[] = Object.values(SCOPE_ENV);

/**
 * The scope as the env vars the backend's config stores it under.
 *
 * @param scope - the three codes
 * @returns `{ ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE }`
 */
export function storeScopeEnv(scope: StoreScope): Record<string, string> {
    return {
        [SCOPE_ENV.website]: scope.website,
        [SCOPE_ENV.store]: scope.store,
        [SCOPE_ENV.storeView]: scope.storeView,
    };
}

/** What every tool answers when the project or stack has nowhere to keep a scope. */
export const NO_BACKEND_FOR_SCOPE =
    'Cannot set store scope: this project has no backend component selected.';
