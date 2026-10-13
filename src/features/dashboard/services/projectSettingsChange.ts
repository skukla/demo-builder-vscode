/**
 * Changing a project's settings: the one definition (PL-76).
 *
 * Two doors change the same settings, the Configure screen's Save and the agent's
 * `configure_project`, and they used to disagree: an agent's change marked only the
 * mesh out of date (never the storefront), regenerated no `.env`, and was read and
 * written against a different copy of the settings than the screen showed. Both now
 * read the settings here and stage the change here, so they cannot drift.
 *
 * What each door still owns is what is specific to it: Configure's rename, block
 * libraries, authoring choice and prompts; the agent's datapack, addons and answer.
 * Each then saves the project and regenerates its `.env` files.
 *
 * @module features/dashboard/services/projectSettingsChange
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseEnvFile } from '@/core/utils/envParser';
import { keepIntegrationSettings } from '@/features/app-builder/services/componentSettings';
import {
    migrateDeclaredSecrets,
    type SecretWriter,
} from '@/features/components/services/commerceSecretMigration';
import { mergeEnvValuesFromSources } from '@/features/dashboard/commands/configureEnvLoader';
import { applyConfigChanges } from '@/features/dashboard/services/configureConfigChanges';
import {
    detectStorefrontChanges,
    type StorefrontChanges,
} from '@/features/eds/services/storefront/storefrontStalenessDetector';
import type { MeshChanges } from '@/features/mesh/services/types';
import type { Project } from '@/types/base';
import { getComponentInstanceEntries } from '@/types/typeGuards';
import type { ComponentConfigs } from '@/types/webview';

/** Settings as read from disk: every value is text. */
export type ProjectSettings = Record<string, Record<string, string>>;

/**
 * A project's settings as they are now, read the way the Configure screen shows
 * them: each installed component's own `.env` (`.env.local` first, for Next.js),
 * then the project root `.env`, then the manifest (`mergeEnvValuesFromSources`).
 *
 * @param project - the project to read
 * @returns per component, its settings
 */
export async function readProjectSettings(project: Project): Promise<ProjectSettings> {
    const envValues: ProjectSettings = {};
    for (const [componentId, instance] of getComponentInstanceEntries(project)) {
        if (!instance.path) continue;
        envValues[componentId] = await readFirstEnvFile([
            path.join(instance.path, '.env.local'),
            path.join(instance.path, '.env'),
        ]);
    }

    // Values for components that are not installed (the ACCS backend has no
    // instance) live in the root `.env` or only in the manifest.
    const rootEnvValues = await readFirstEnvFile([path.join(project.path, '.env')]);
    return mergeEnvValuesFromSources(envValues, rootEnvValues, project.componentConfigs ?? {});
}

/** The first of `paths` that exists, parsed; empty when none does. */
async function readFirstEnvFile(paths: string[]): Promise<Record<string, string>> {
    for (const envPath of paths) {
        try {
            return parseEnvFile(await fs.readFile(envPath, 'utf-8'));
        } catch {
            // Missing: try the next one.
        }
    }
    return {};
}

/** What staging needs from the door that calls it. */
export interface StageSettingsDeps {
    /** The secret store; declared secrets move there. */
    secrets: SecretWriter | undefined;
    /**
     * Whether the mesh must be redeployed for these settings. Configure compares
     * against the DEPLOYED mesh (a network call under the project's org); the agent
     * compares against the stored settings, offline.
     */
    detectMeshChanges: (project: Project, configs: ComponentConfigs) => Promise<MeshChanges>;
    /** Progress lines from the secret move. */
    log: (line: string) => void;
    /** Where to report a secret that could not be moved. */
    warn: (line: string) => void;
}

/** What staging changed on the project. */
export interface StagedSettings {
    /** The settings now on the project, secrets removed. */
    configs: ComponentConfigs;
    meshChanges: MeshChanges;
    storefrontChanges: StorefrontChanges;
}

/**
 * Lay `changes` over the project's settings as they are now, and put the result on
 * `project` (not saved): integration settings kept as stored (they belong to the
 * integration's tile, AB-21), declared secrets moved to the secret store, and the
 * mesh and storefront marked out of date when the change reaches them.
 *
 * @param project - the project to change (mutated)
 * @param changes - only the values being changed
 * @param deps - see {@link StageSettingsDeps}
 * @returns what was staged, including both detectors' results for the follow-ups
 */
export async function stageSettingsChange(
    project: Project,
    changes: ComponentConfigs,
    deps: StageSettingsDeps,
): Promise<StagedSettings> {
    const current = await readProjectSettings(project);
    const updated = keepIntegrationSettings(applyConfigChanges(current, changes), project);

    // A value only leaves the settings once the secret store is proven to hold it,
    // so a secret is never in neither place (component-secret-routing, phase 2).
    const migration = await migrateDeclaredSecrets(updated, project.path, deps.secrets, deps.log);
    if (migration.retained.length > 0) {
        // Not fatal and not silent: the value stays where it was; the next save tries again.
        deps.warn(
            `${migration.retained.length} secret(s) could not be moved to SecretStorage and ` +
                `remain in project config: ${migration.retained.join(', ')}`,
        );
    }
    const configs: ComponentConfigs = migration.sanitizedConfigs ?? {};

    // Both detectors compare against the project BEFORE the new settings land on it.
    const meshChanges = await deps.detectMeshChanges(project, configs);
    const storefrontChanges = detectStorefrontChanges(project, configs);

    project.componentConfigs = configs;
    if (meshChanges.hasChanges) project.meshStatusSummary = 'stale';
    if (storefrontChanges.hasChanges) project.edsStorefrontStatusSummary = 'stale';

    return { configs, meshChanges, storefrontChanges };
}
