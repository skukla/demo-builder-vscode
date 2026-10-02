/**
 * An App Builder component's SECRET settings.
 *
 * SECRET SAFETY (repo is PUBLIC): a `type:'secret'` setting lives in VS Code
 * SecretStorage under `secretKey(project path, component id, var)` and nowhere
 * else: never `componentConfigs`, the manifest, a `.env`, a log or a webview.
 * Saving an integration's Settings splits the secrets out and stores them here;
 * the deploy reads them back into its process env (`resolveSecretInputs`); the
 * webview only ever sees whether each one is set.
 *
 * @module features/app-builder/services/componentSettingSecrets
 */

import { buildComponentSettings, hasSettings } from './componentSettings';
import { secretKey } from './secretKey';
import { ensureScreenKeyEnv, type ScreenKeyStore } from './systemScreen';
import { pairedInstanceId } from '@/features/components/services/appBuilderComponentLinks';
import { moveSecret, type SecretWriter as SecretMover } from '@/features/components/services/commerceSecretMigration';
import type { AppBuilderComponentCatalogEntry, ComponentSettings } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** A captured secret destined for SecretStorage (never the manifest). */
export interface CapturedSecret {
    appBuilderComponentId: string;
    varName: string;
    value: string;
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

/**
 * The secret settings an entry deploys with, read from SecretStorage.
 *
 * A system bound to an integration reads the integration's value first, as its
 * text settings do (`deployInputs`): a setting both apps use is set once, on the
 * integration. Unset secrets are simply absent.
 *
 * @param entry - the entry being deployed
 * @param projectPath - the project's path, the key scheme's first part
 * @param secretStorage - VS Code SecretStorage (read surface)
 * @returns var name → value, only for secrets that are set
 */
export async function resolveSecretInputs(
    entry: AppBuilderComponentCatalogEntry,
    projectPath: string,
    secretStorage: SecretReader,
): Promise<Record<string, string>> {
    // The integration THIS system pairs with, as for text settings (deployInputs).
    const owners = entry.boundTo
        ? [pairedInstanceId(entry.id, entry.catalogId, entry.boundTo), entry.id]
        : [entry.id];
    const inputs: Record<string, string> = {};
    const names = secretVarsByAppBuilderComponent([entry]).get(entry.id) ?? [];
    for (const varName of names) {
        for (const owner of owners) {
            const stored = await secretStorage.get(secretKey(projectPath, owner, varName));
            if (stored) {
                inputs[varName] = stored;
                break;
            }
        }
    }
    return inputs;
}

/**
 * Everything secret an entry deploys with: its screen key (generated the first
 * time, `systemScreen.ts`) and its secret settings. Goes into the deploy's
 * per-invocation env and nowhere else.
 *
 * @param secretStorage - VS Code SecretStorage
 * @param projectPath - the project's path, the key scheme's first part
 * @param entry - the entry being deployed
 * @returns var name → value
 */
export async function resolveSecretDeployEnv(
    secretStorage: ScreenKeyStore,
    projectPath: string,
    entry: AppBuilderComponentCatalogEntry,
): Promise<Record<string, string>> {
    return {
        ...(await resolveSecretInputs(entry, projectPath, secretStorage)),
        ...(await ensureScreenKeyEnv(secretStorage, projectPath, entry)),
    };
}

/**
 * Every Settings modal this project's components have: one per component the
 * project has whose entry lets a person set something. Secrets as "is set" only.
 *
 * @param project - the project
 * @param catalog - the project's stack-filtered catalog
 * @param secretStorage - VS Code SecretStorage (read surface)
 * @returns component id → its settings
 */
export async function loadProjectComponentSettings(
    project: Project,
    catalog: AppBuilderComponentCatalogEntry[],
    secretStorage: SecretReader,
): Promise<Record<string, ComponentSettings>> {
    const withSettings = catalog.filter((entry) =>
        project.appBuilderComponents?.[entry.id] !== undefined && hasSettings(entry, catalog));
    const flags = await loadAppBuilderComponentSecretFlags(withSettings, project.path, secretStorage);
    return Object.fromEntries(withSettings.map((entry) =>
        [entry.id, buildComponentSettings(entry, catalog, project, flags[entry.id] ?? {})]));
}

/** The SecretStorage delete surface (matches vscode.SecretStorage). */
export interface SecretDeleter {
    delete(key: string): Thenable<void> | Promise<void>;
}

/**
 * Delete every secret a project's App Builder components keep under this module's key
 * scheme: each secret setting, and the key that opens a system's screen (`systemScreen`,
 * same scheme). Run when the project is deleted and when one component is removed, so
 * its secrets do not outlive it in the keychain (owner, 2026-10-01; PL-64). A key never
 * stored deletes as a no-op. Never logs a value.
 *
 * @param entries - the project's components as catalog entries (instance ids)
 * @param projectPath - the project's path, the key scheme's first part
 * @param secretStorage - VS Code SecretStorage
 */
export async function forgetAppBuilderComponentSecrets(
    entries: AppBuilderComponentCatalogEntry[],
    projectPath: string,
    secretStorage: SecretDeleter,
): Promise<void> {
    for (const entry of entries) {
        for (const varName of secretVarNamesOf(entry)) {
            await secretStorage.delete(secretKey(projectPath, entry.id, varName));
        }
    }
}

/**
 * Move every secret a project's App Builder components keep (secret settings, screen keys)
 * to the project's new path after a rename: the path is the key scheme's first part, so
 * without this a renamed project's integrations lost them to the old path (PL-64).
 * Copy-verify-delete per key (`moveSecret`): a move that fails leaves the value at the old
 * key. Never logs a value.
 *
 * @param entries - the project's components as catalog entries (instance ids)
 * @param oldPath - the project's path before the rename
 * @param newPath - its path now
 * @param secretStorage - VS Code SecretStorage
 * @param log - where a key that did not move is reported, by var name only
 * @returns the var names moved
 */
export async function reKeyAppBuilderComponentSecrets(
    entries: AppBuilderComponentCatalogEntry[],
    oldPath: string,
    newPath: string,
    secretStorage: SecretMover,
    log?: (line: string) => void,
): Promise<string[]> {
    const moved: string[] = [];
    if (oldPath === newPath) return moved;
    for (const entry of entries) {
        for (const varName of secretVarNamesOf(entry)) {
            const from = secretKey(oldPath, entry.id, varName);
            const to = secretKey(newPath, entry.id, varName);
            if (await moveSecret(secretStorage, from, to, varName, log)) moved.push(varName);
        }
    }
    return moved;
}

/** Every var an entry keeps under this module's key scheme: secret settings and screen key. */
function secretVarNamesOf(entry: AppBuilderComponentCatalogEntry): string[] {
    const settings = secretVarsByAppBuilderComponent([entry]).get(entry.id) ?? [];
    return entry.screen ? [...settings, entry.screen.keyEnvVar] : settings;
}
