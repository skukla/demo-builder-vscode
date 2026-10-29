/**
 * What reads the mesh's address, brought up to date after a mesh is added or
 * removed. The runner's `republishStorefront` (`appBuilderComponentRunnerDeps`).
 *
 * @module features/project-creation/services/storefrontRefresh
 */

import type * as vscode from 'vscode';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import { regenerateProjectEnvFiles } from '@/features/project-creation/helpers/envFileRegeneration';
import type { Project } from '@/types/base';
import type { ComponentRegistry } from '@/types/components';
import type { Logger } from '@/types/logger';
import { isEdsProject, toError } from '@/types/typeGuards';

/** What the refresh needs from the host. */
export interface StorefrontRefreshDeps {
    loadRegistry: () => Promise<ComponentRegistry>;
    logger: Logger;
    secrets: vscode.SecretStorage;
    saveProject: (project: Project) => Promise<void>;
    ensureDaLiveSession: () => Promise<{ authenticated: boolean; error?: string }>;
}

/**
 * An Edge Delivery storefront reads the mesh's address from its published
 * config.json, so that is republished. A headless frontend reads it from its own
 * `.env`, so the project's settings files are written again. The headless case
 * used to be sent to the republish too, which has no storefront to publish: the
 * add warned "EDS metadata missing" and the frontend kept the old address, or a
 * deleted mesh's.
 *
 * @param project - the project, as the add or removal left it
 * @param deps - the registry, logger, secrets and the republish's own needs
 * @returns the republish's outcome, or the settings files' as one
 */
export async function refreshStorefront(
    project: Project,
    deps: StorefrontRefreshDeps,
): Promise<{ success: boolean; error?: string; cdnError?: string }> {
    if (!isEdsProject(project)) {
        try {
            await regenerateProjectEnvFiles(project, await deps.loadRegistry(), deps.logger, deps.secrets);
            return { success: true };
        } catch (error) {
            return { success: false, error: `the settings files were not written: ${toError(error).message}` };
        }
    }
    return republishStorefrontConfig({
        project,
        secrets: deps.secrets,
        logger: deps.logger,
        persist: deps.saveProject,
        ensureDaLiveSession: deps.ensureDaLiveSession,
    });
}
