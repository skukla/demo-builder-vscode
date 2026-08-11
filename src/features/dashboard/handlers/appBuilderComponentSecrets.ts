/**
 * AppBuilderComponent Secret Routing (D2 Track B — Step 04)
 *
 * SECRET SAFETY (repo is PUBLIC): an App Builder component's `type:'secret'` env var is
 * routed to VS Code SecretStorage and NEVER written to `componentConfigs` /
 * `.env` / the persisted manifest / logs. This module is the split-on-save +
 * persist + load-flags seam the inline `save-configuration` handler calls.
 *
 * Non-secret (`type:'text'`) values keep flowing through the existing
 * `componentConfigs` → `generateComponentEnvFile` (.env) path unchanged.
 *
 * @module features/dashboard/handlers/appBuilderComponentSecrets
 */

import { secretKey } from '@/features/app-builder/services/secretKey';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Logger } from '@/types/logger';
import type { ComponentConfigs } from '@/types/webview';

/** A captured secret destined for SecretStorage (never the manifest). */
export interface CapturedSecret {
    appBuilderComponentId: string;
    varName: string;
    value: string;
}

/** Result of separating secret values out of componentConfigs. */
export interface SplitSecretsResult {
    /** componentConfigs with every secret var removed (safe to persist/.env). */
    sanitizedConfigs: ComponentConfigs;
    /** The extracted secrets, to route to SecretStorage. */
    secrets: CapturedSecret[];
}

/** Minimal SecretStorage surface (matches vscode.SecretStorage). */
export interface SecretWriter {
    store(key: string, value: string): Thenable<void> | Promise<void>;
}

/** Minimal SecretStorage read surface (matches vscode.SecretStorage). */
export interface SecretReader {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
}

/** Map of secret var names per appBuilderComponent id (the bucket-3 secret schema). */
function secretVarsByAppBuilderComponent(catalog: AppBuilderComponentCatalogEntry[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const entry of catalog) {
        const secretNames = (entry.envSchema ?? [])
            .filter(v => v.type === 'secret' && !v.providedBy && !v.derivedFrom)
            .map(v => v.name);
        if (secretNames.length > 0) {
            map.set(entry.id, secretNames);
        }
    }
    return map;
}

/**
 * Separate secret-typed values out of componentConfigs.
 *
 * For each appBuilderComponent id present in BOTH the configs and the catalog, any value
 * whose var is `type:'secret'` is moved into `secrets` and stripped from the
 * returned `sanitizedConfigs`, so secrets never reach the .env/manifest path.
 *
 * @param configs - The componentConfigs payload from the Configure UI
 * @param catalog - Catalog entries for the project's selected appBuilderComponents
 * @returns The sanitized configs (no secrets) plus the captured secrets
 */
export function splitAppBuilderComponentSecrets(
    configs: ComponentConfigs,
    catalog: AppBuilderComponentCatalogEntry[],
): SplitSecretsResult {
    const secretVars = secretVarsByAppBuilderComponent(catalog);
    const sanitizedConfigs: ComponentConfigs = {};
    const secrets: CapturedSecret[] = [];

    for (const [appBuilderComponentId, config] of Object.entries(configs)) {
        const names = secretVars.get(appBuilderComponentId);
        if (!names || names.length === 0) {
            sanitizedConfigs[appBuilderComponentId] = { ...config };
            continue;
        }

        const sanitized = { ...config };
        for (const varName of names) {
            const value = sanitized[varName];
            if (typeof value === 'string' && value !== '') {
                secrets.push({ appBuilderComponentId, varName, value });
            }
            delete sanitized[varName];
        }
        sanitizedConfigs[appBuilderComponentId] = sanitized;
    }

    return { sanitizedConfigs, secrets };
}

/**
 * Persist captured secrets to SecretStorage under the deterministic key scheme.
 * Never logs the secret value (only the key, which is safe).
 *
 * @param secrets - The captured secrets to store
 * @param projectId - Stable project identifier for the key scheme
 * @param secretStorage - VS Code SecretStorage (write surface)
 * @param logger - Optional logger (key only, never the value)
 */
export async function persistAppBuilderComponentSecrets(
    secrets: CapturedSecret[],
    projectId: string,
    secretStorage: SecretWriter,
    logger?: Logger,
): Promise<void> {
    for (const { appBuilderComponentId, varName, value } of secrets) {
        const key = secretKey(projectId, appBuilderComponentId, varName);
        await secretStorage.store(key, value);
        logger?.debug(`[Configure] Stored appBuilderComponent secret under key ${key}`);
    }
}

/**
 * Read which secret vars are already set, WITHOUT revealing their values.
 *
 * Returns a per-appBuilderComponent map of `varName → boolean` ("is set"), so the masked
 * field can show a "set / replace" affordance without round-tripping the value
 * to the webview. AppBuilderComponents with no secret vars produce no entry.
 *
 * @param catalog - Catalog entries for the project's selected appBuilderComponents
 * @param projectId - Stable project identifier for the key scheme
 * @param secretStorage - VS Code SecretStorage (read surface)
 * @returns A map of appBuilderComponent id → { varName: isSet } (booleans only)
 */
export async function loadAppBuilderComponentSecretFlags(
    catalog: AppBuilderComponentCatalogEntry[],
    projectId: string,
    secretStorage: SecretReader,
): Promise<Record<string, Record<string, boolean>>> {
    const secretVars = secretVarsByAppBuilderComponent(catalog);
    const flags: Record<string, Record<string, boolean>> = {};

    for (const [appBuilderComponentId, names] of secretVars.entries()) {
        const perVar: Record<string, boolean> = {};
        for (const varName of names) {
            const stored = await secretStorage.get(secretKey(projectId, appBuilderComponentId, varName));
            perVar[varName] = stored !== undefined && stored !== '';
        }
        flags[appBuilderComponentId] = perVar;
    }

    return flags;
}
