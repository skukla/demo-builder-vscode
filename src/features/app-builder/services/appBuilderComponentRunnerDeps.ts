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

import type * as vscode from 'vscode';
import { deriveAllowedDomain } from './allowedDomain';
import { subscribeRequiredApis, type ApiSubscriberClient, type OrgTarget } from './apiSubscriber';
import { createApiSubscriberClient } from './apiSubscriberClientAdapter';
import type { AppBuilderComponentRunnerDeps } from './appBuilderComponentRunner';
import { deployAppComponentIsolated } from './deployAppIsolated';
import type { MeshSubscribeTarget } from './ensureMeshApiSubscribed';
import { ServiceLocator } from '@/core/di';
import type { CachedOrgRef, CommandExecutor } from '@/core/shell';
import { resolveDesiredApis } from '@/core/state/componentApiPicks';
import type { ComponentManager } from '@/features/components/services/componentManager';
import { republishStorefrontConfig } from '@/features/eds/services/storefrontRepublishService';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { getAvailableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

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

/** Build the {@link OrgTarget} the subscriber needs from the project's identity. */
export function subscriberTarget(project: MeshSubscribeTarget): OrgTarget {
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
        // The ONE isolating deploy seam (ADR-011 D3 Step 03) — shared with the
        // singular deployAppHeadless path so no un-isolated deploy survives.
        deployApp: deployAppComponentIsolated,
        // The runner's dep contract is void — swallow the returned API list.
        subscribeRequiredApis: async (appBuilderComponents, project) => {
            await subscribeRequiredApis(
                appBuilderComponents,
                subscriberTarget(project),
                ctx.subscriberClient,
                deriveAllowedDomain(project),
                // Runtime-added APIs (add_console_apis) must ride every
                // reconcile or the full-union PUT strips them. Unioned across
                // every integration's picks — the flat field is legacy.
                resolveDesiredApis(project),
            );
        },
        republishStorefront: ({ project }) =>
            republishStorefrontConfig({ project, secrets: ctx.secrets, logger: ctx.logger }),
    };
}

/** Resolve the project's stack-filtered catalog (axis-filtered by selection). */
function resolveCatalog(project: Project): AppBuilderComponentCatalogEntry[] {
    return getAvailableAppBuilderComponents(
        project.componentSelections?.backend ?? '',
        project.componentSelections?.frontend ?? '',
    );
}

/**
 * Assemble the {@link RunnerDepsContext} for a host (extension) invocation. Wires
 * the extension collaborators the runner needs: the component manager, command
 * executor, logger, project persistence, the cached-org read, the Track A
 * subscriber adapter, the stack-filtered catalog, and the extension secrets.
 *
 * Shared by the dashboard add/deploy/remove handlers AND the wizard creation-flow
 * integrations phase (Rule of Three: identical second use → extracted here).
 */
export async function buildRunnerDepsContext(
    context: HandlerContext,
    project: Project,
): Promise<RunnerDepsContext> {
    const { ComponentManager } = await import('@/features/components/services/componentManager');
    const authManager = ServiceLocator.getAuthenticationService();
    return {
        componentManager: new ComponentManager(context.logger),
        commandManager: ServiceLocator.getCommandExecutor(),
        logger: context.logger,
        saveProject: (p: Project) => context.stateManager.saveProject(p),
        getCachedOrganization: () => authManager.getCachedOrganization(),
        subscriberClient: createApiSubscriberClient(authManager),
        catalog: resolveCatalog(project),
        secrets: context.context.secrets,
    };
}
