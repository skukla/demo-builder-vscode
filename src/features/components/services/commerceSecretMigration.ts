/**
 * Move a declared `secret` field out of `componentConfigs` — safely.
 *
 * Phase 2 of `.rptc/complete/component-secret-routing/`. The plan's sequencing is
 * the whole design, and it is not "strip the old location":
 *
 *   **write → read back → only then strip.**
 *
 * There is never an instant where the credential is in neither place. A bare eager
 * strip can leave a project with the credential nowhere — the failure that made an
 * earlier draft of this migration unshippable — and "write then strip without
 * checking" has the same hole whenever SecretStorage rejects the write.
 *
 * The rejected alternative, recorded so it is not retried: fallback-read plus
 * move-on-save is safe but may never converge, and "eventually stops leaking" is
 * not a property worth designing for when the file is plaintext on disk.
 *
 * Reads go through `commerceCredentialStore`; this is the write half. Nothing here
 * logs a value — the logger gets counts and key NAMES only.
 *
 * @module features/components/services/commerceSecretMigration
 */

import componentsConfig from '../config/components.json';
import { commerceSecretKey, type SecretReader } from './commerceCredentialStore';
import type { ConfigMap } from './envVarHelpers';

/** The SecretStorage surface this module needs. */
export interface SecretWriter extends SecretReader {
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
}

export interface MigrationOutcome {
    /** Configs with every successfully-stored secret removed. Safe to persist. */
    sanitizedConfigs: ConfigMap;
    /** Var names moved to SecretStorage and verified. Names only, never values. */
    moved: string[];
    /** Var names the user CLEARED, deleted from SecretStorage. Names only. */
    cleared: string[];
    /**
     * Var names left in `componentConfigs` because the write could not be verified.
     * NOT an error: the value is still exactly where it was, and the next save
     * tries again. Reported so a persistent failure is visible rather than silent.
     */
    retained: string[];
}

/**
 * Re-key a project's secrets after its path changes.
 *
 * The key's project segment is `project.path`, and a rename moves it
 * (`configure.ts` reloads the project because "path may have changed"). Before
 * this existed, a rename made an already-migrated credential unreachable at the
 * new key AND absent from `componentConfigs` — gone from both places, with the
 * Configure field blank and nothing naming the cause — while the old key sat in
 * the keychain forever with no delete path.
 *
 * Copy-verify-delete, in that order, for the same reason the migration writes
 * before it strips: an interrupted move leaves the value readable at the OLD key
 * rather than nowhere. A failed verify leaves BOTH, which is recoverable; a
 * delete-first would not be.
 *
 * @returns var names successfully moved. Names only, never values.
 */
export async function reKeyProjectSecrets(
    oldProjectId: string,
    newProjectId: string,
    componentIds: string[],
    secrets: SecretWriter | undefined,
    log?: (line: string) => void,
): Promise<string[]> {
    const rekeyed: string[] = [];
    if (!secrets || oldProjectId === newProjectId) return rekeyed;

    for (const componentId of componentIds) {
        for (const varName of declaredSecretKeys()) {
            const from = commerceSecretKey(oldProjectId, componentId, varName);
            try {
                const value = await secrets.get(from);
                if (!value) continue;

                const to = commerceSecretKey(newProjectId, componentId, varName);
                await secrets.store(to, value);
                if ((await secrets.get(to)) !== value) {
                    log?.(`secret ${varName}: re-key not verified, left at the old key`);
                    continue;
                }
                await secrets.delete(from);
                rekeyed.push(varName);
            } catch {
                log?.(`secret ${varName}: re-key failed, left at the old key`);
            }
        }
    }

    if (rekeyed.length > 0) {
        log?.(`re-keyed ${rekeyed.length} secret(s) after a path change`);
    }
    return rekeyed;
}

/**
 * The inverse of {@link migrateDeclaredSecrets}: put the secrets BACK, in memory.
 *
 * Some consumers genuinely need the value, not a reference to it — the generated
 * `.env` is one, because for a PaaS demo that file IS how the running storefront
 * receives its admin password. Removing the value from `componentConfigs` without
 * this would silently write `ADOBE_COMMERCE_ADMIN_PASSWORD=` and break the demo.
 *
 * **The result must never be persisted.** It exists to be written to a file the
 * component reads, or handed to a service call, and then dropped. Persisting it
 * would undo the migration on the next save — which is why this returns a copy
 * and never mutates its input.
 *
 * @returns configs with every declared secret restored from SecretStorage
 */
export async function hydrateDeclaredSecrets(
    configs: ConfigMap,
    projectId: string | undefined,
    secrets: SecretReader | undefined,
): Promise<ConfigMap> {
    if (!configs || !projectId || !secrets) return configs;

    const secretKeys = declaredSecretKeys();
    const hydrated: NonNullable<ConfigMap> = {};

    for (const [componentId, componentConfig] of Object.entries(configs)) {
        hydrated[componentId] = { ...componentConfig };

        for (const varName of secretKeys) {
            // Only fill a GAP. A value already present is either a retained write
            // or something the caller just collected, and it wins — the same
            // precedence the read accessor applies in reverse.
            if (hydrated[componentId][varName]) continue;

            const stored = await secrets.get(commerceSecretKey(projectId, componentId, varName));
            if (stored) hydrated[componentId][varName] = stored;
        }
    }
    return hydrated;
}

/**
 * Which declared secrets this project HAS, as booleans — never the values.
 *
 * The webview cannot read SecretStorage, and two things there need to know a
 * secret exists without seeing it: `autoDetectKey`, which triggers store discovery
 * only when the connection fields are complete, and the Configure form, which
 * would otherwise render a required field as empty and let the user save a blank
 * over a good credential.
 *
 * Same shape and same reasoning as `loadAppBuilderComponentSecretFlags`, which
 * solved this for App Builder secrets first.
 *
 * @returns `{ [componentId]: { [varName]: true } }` for present values only
 */
export async function loadDeclaredSecretFlags(
    componentIds: string[],
    projectId: string | undefined,
    secrets: SecretReader | undefined,
): Promise<Record<string, Record<string, boolean>>> {
    const flags: Record<string, Record<string, boolean>> = {};
    if (!projectId || !secrets) return flags;

    for (const componentId of componentIds) {
        const perVar: Record<string, boolean> = {};
        for (const varName of declaredSecretKeys()) {
            const stored = await secrets.get(commerceSecretKey(projectId, componentId, varName));
            if (stored) perVar[varName] = true;
        }
        if (Object.keys(perVar).length > 0) flags[componentId] = perVar;
    }
    return flags;
}

/** Which env vars the catalog declares as `secret: true`. */
export function declaredSecretKeys(): Set<string> {
    const envVars = (componentsConfig as { envVars?: Record<string, { secret?: boolean }> })
        .envVars;
    const keys = new Set<string>();
    for (const [key, def] of Object.entries(envVars ?? {})) {
        if (def?.secret === true) keys.add(key);
    }
    return keys;
}

/**
 * Write every declared secret in `configs` to SecretStorage, verify each, and
 * return configs with the verified ones removed.
 *
 * @param configs - the config map about to be persisted
 * @param projectId - stable project id (the project path); without one there is no
 *                    key, so nothing moves and the configs come back untouched
 * @param secrets - SecretStorage
 * @param log - status lines. Receives key NAMES and counts, never values.
 */
export async function migrateDeclaredSecrets(
    configs: ConfigMap,
    projectId: string | undefined,
    secrets: SecretWriter | undefined,
    log?: (line: string) => void,
): Promise<MigrationOutcome> {
    const moved: string[] = [];
    const retained: string[] = [];
    const cleared: string[] = [];

    if (!configs || !projectId || !secrets) {
        return { sanitizedConfigs: configs, moved, retained, cleared };
    }

    const secretKeys = declaredSecretKeys();

    // Deep-ish copy: component maps are replaced, so the caller's object is never
    // mutated underneath it. A caller that persists the original on a failure path
    // must still see the credential it had.
    const sanitized: NonNullable<ConfigMap> = {};
    for (const [componentId, componentConfig] of Object.entries(configs)) {
        sanitized[componentId] = { ...componentConfig };
    }

    for (const [componentId, componentConfig] of Object.entries(sanitized)) {
        for (const varName of Object.keys(componentConfig)) {
            if (!secretKeys.has(varName)) continue;

            const value = componentConfig[varName];
            const key = commerceSecretKey(projectId, componentId, varName);

            // An EMPTY value is the user clearing the field, and it must delete the
            // stored secret. Skipping it instead leaves a credential that the UI
            // shows as absent and the extension keeps using — a state the user
            // cannot detect or fix from inside the product, because the read below
            // prefers storage unconditionally and there is no "is set" affordance.
            // Rotating a leaked org-wide credential and clearing the field here is
            // exactly when that matters.
            if (typeof value !== 'string' || value === '') {
                if (value === '') {
                    try {
                        await secrets.delete(key);
                        cleared.push(varName);
                        delete componentConfig[varName];
                    } catch {
                        log?.(`secret ${varName}: could not be cleared from SecretStorage`);
                    }
                }
                continue;
            }
            try {
                await secrets.store(key, value);

                // The read-back is the whole safety property. A write that reports
                // success and stores nothing is indistinguishable from one that
                // worked, right up until the credential is needed and gone.
                const verified = await secrets.get(key);
                if (verified !== value) {
                    retained.push(varName);
                    log?.(`secret ${varName}: write not verified, left in config`);
                    continue;
                }

                delete componentConfig[varName];
                moved.push(varName);
            } catch {
                retained.push(varName);
                log?.(`secret ${varName}: write failed, left in config`);
            }
        }
    }

    if (moved.length > 0) {
        log?.(`moved ${moved.length} secret(s) to SecretStorage: ${moved.join(', ')}`);
    }
    if (cleared.length > 0) {
        log?.(`cleared ${cleared.length} secret(s): ${cleared.join(', ')}`);
    }
    return { sanitizedConfigs: sanitized, moved, retained, cleared };
}
