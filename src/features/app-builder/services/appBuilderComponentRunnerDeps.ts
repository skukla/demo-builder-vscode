/**
 * Default deps factory for the deploy-contract runner (Step 08).
 *
 * The runner ({@link appBuilderComponentRunner}) is pure orchestration with every external
 * boundary injected. This factory wires the REAL implementations — the existing
 * deploy tails (`deployMeshComponent`/`deployAppComponent`, NOT forked), the
 * step-07 API subscriber, and the step-04 storefront republish — so callers
 * (D2 dashboard/wizard wiring) get a ready-to-use deps bundle.
 *
 * This is the cross-feature orchestration seam: it imports from `@/features/mesh`
 * and `@/features/eds` here (orchestration layer), keeping `appBuilderComponentRunner.ts`
 * itself free of cross-feature deploy imports.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import * as yaml from 'yaml';
import { deriveAllowedDomain } from './allowedDomain';
import { subscribeRequiredApis, type ApiSubscriberClient, type OrgTarget } from './apiSubscriber';
import type { AppBuilderComponentRunnerDeps } from './appBuilderComponentRunner';
import { deployAppComponent } from './appDeployment';
import type { CachedOrgRef, CommandExecutor } from '@/core/shell';
import type { ComponentManager } from '@/features/components/services/componentManager';
import { republishStorefrontConfig } from '@/features/eds/services/storefrontRepublishService';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/** Collaborators the factory needs from the host (extension) context. */
export interface RunnerDepsContext {
    componentManager: ComponentManager;
    commandManager: CommandExecutor;
    logger: Logger;
    saveProject: (project: Project) => Promise<void>;
    getCachedOrganization: () => CachedOrgRef | undefined;
    subscriberClient: ApiSubscriberClient;
    catalog: AppBuilderComponentCatalogEntry[];
    secrets: vscode.SecretStorage;
}

/**
 * Apply the derived distinct `ow.package` to an integration's `app.config.yaml` —
 * the prune-isolation primitive (step 05). Renames each declared runtime package
 * to the derived name so two integrations never share `application`/`dx-excshell-1`.
 * Best-effort: an absent/unparseable config is left untouched (deploy surfaces it).
 */
async function applyOwPackage(componentPath: string, owPackage: string, logger: Logger): Promise<void> {
    const configPath = path.join(componentPath, 'app.config.yaml');
    try {
        const raw = await fsPromises.readFile(configPath, 'utf-8');
        const doc = yaml.parse(raw) as { application?: { runtimeManifest?: { packages?: Record<string, unknown> } } };
        const manifest = doc?.application?.runtimeManifest;
        const packages = manifest?.packages;
        if (!manifest || !packages || Object.keys(packages).length === 0) {
            return;
        }
        const renamed: Record<string, unknown> = {};
        for (const value of Object.values(packages)) {
            renamed[owPackage] = value;
        }
        manifest.packages = renamed;
        await fsPromises.writeFile(configPath, yaml.stringify(doc), 'utf-8');
        logger.debug(`[AppBuilderComponent Runner] applied ow.package "${owPackage}"`);
    } catch (error) {
        logger.warn(`[AppBuilderComponent Runner] could not apply ow.package: ${toError(error).message}`);
    }
}

/** Build the {@link OrgTarget} the subscriber needs from the project's identity. */
export function subscriberTarget(project: Project): OrgTarget {
    return {
        orgId: project.adobe?.organization ?? '',
        projectId: project.adobe?.projectId ?? '',
        workspaceId: project.adobe?.workspace ?? '',
    };
}

/** Wire the runner's deps to the real deploy tails + subscriber + republish. */
export function buildDefaultRunnerDeps(ctx: RunnerDepsContext): AppBuilderComponentRunnerDeps {
    return {
        componentManager: ctx.componentManager,
        commandManager: ctx.commandManager,
        logger: ctx.logger,
        saveProject: ctx.saveProject,
        getCachedOrganization: ctx.getCachedOrganization,
        catalog: ctx.catalog,
        secrets: ctx.secrets,
        deployMesh: deployMeshComponent,
        deployApp: async (componentPath, owPackage, commandManager, logger, onProgress) => {
            await applyOwPackage(componentPath, owPackage, logger);
            return deployAppComponent(componentPath, commandManager, logger, onProgress);
        },
        subscribeRequiredApis: (appBuilderComponents, project) =>
            subscribeRequiredApis(
                appBuilderComponents,
                subscriberTarget(project),
                ctx.subscriberClient,
                deriveAllowedDomain(project),
            ),
        republishStorefront: ({ project }) =>
            republishStorefrontConfig({ project, secrets: ctx.secrets, logger: ctx.logger }),
    };
}
