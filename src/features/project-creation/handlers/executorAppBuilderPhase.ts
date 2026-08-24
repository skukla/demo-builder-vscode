/**
 * Project Creation — Phase 3b: App Builder integrations.
 *
 * Resolves the selected deployable integrations (catalog or custom-URL),
 * ensures the deploy workspace has a Runtime namespace, gates once on the
 * Developer role, then deploys each through the shared Model B runner.
 * Extracted from `executor.ts` (2026-08-23 god-file decomposition).
 *
 * @module features/project-creation/handlers/executorAppBuilderPhase
 */

import {
    getAppBuilderComponentEntry,
    buildCustomIntegrationEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import { buildDeployOrgTarget } from './executorMeshPhase';
import type { ProgressTracker } from './shared';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';
import { withOrgContext } from '@/core/shell';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * The selected App Builder components that resolve to a DEPLOYABLE integration app
 * (`kind: 'integration'`) — catalog entries or custom-URL entries. Mesh-kind
 * selections are excluded (the mesh phase installs them). This is the set
 * that will `aio app deploy`, so it also gates the Runtime pre-flight.
 */
function deployableAppIntegrationEntries(
    typedConfig: ProjectCreationConfig,
): AppBuilderComponentCatalogEntry[] {
    const sources = typedConfig.appBuilderComponentSources ?? {};
    return (typedConfig.selectedAppBuilderComponents ?? [])
        .map(
            (id) =>
                getAppBuilderComponentEntry(id) ??
                // The sources-map key IS the instance id (shell instancing: N
                // named instances may share one template repo).
                (sources[id] ? buildCustomIntegrationEntry(sources[id], id) : undefined),
        )
        .filter((entry): entry is AppBuilderComponentCatalogEntry => entry?.kind === 'integration');
}

/**
 * Ensure the deploy workspace has an Adobe I/O Runtime namespace, PROVISIONING one
 * when it lacks it — the first Adobe step, before any deploy.
 *
 * `aio app deploy` (an App Builder app) needs a Runtime namespace; a mesh does not.
 * A workspace WE create ships one (createProject/createWorkspace), but a pre-existing
 * or imported workspace the user SELECTS may not — so provision it here rather than
 * failing the deploy. Running before the mesh phase keeps the no-orphan guarantee:
 * if provisioning genuinely can't complete, the flow stops before any mesh exists.
 * No-op for mesh-only projects (no deployable app) or when the org/project/workspace
 * ids are absent. Best-effort provisioning + verification (see `ensureWorkspaceRuntime`).
 */
export async function ensureWorkspaceRuntimeReady(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
): Promise<void> {
    if (deployableAppIntegrationEntries(typedConfig).length === 0) {
        return;
    }
    const adobe = typedConfig.adobe;
    if (!adobe?.organization || !adobe?.projectId || !adobe?.workspace) {
        return;
    }
    // Local consts hold the narrowed strings into the closure below.
    const { organization, projectId, workspace } = adobe;
    const { ServiceLocator } = await import('@/core/di');
    const { ensureWorkspaceRuntime } = await import(
        '@/features/app-builder/services/runtimeCredentials'
    );
    const commandManager = ServiceLocator.getCommandExecutor();
    const authService = ServiceLocator.getAuthenticationService();
    const target = buildDeployOrgTarget(context, typedConfig);
    context.logger.debug('[Runtime] Ensuring the workspace has an Adobe I/O Runtime namespace');
    // The namespace check runs via CLI (needs withOrgContext targeting); the SDK
    // `createRuntimeNamespace` provision takes explicit ids (targeting-agnostic).
    await withOrgContext(target, () =>
        ensureWorkspaceRuntime(commandManager, context.logger, 'auto', () =>
            authService.ensureWorkspaceRuntimeNamespace(organization, projectId, workspace),
        ),
    );
}

/**
 * PHASE 3b — deploy each selected App Builder "integration" via the SHARED Model B
 * runner ({@link addAppBuilderComponent}). Mesh-kind selections install through
 * {@link executeMeshPhase} and are excluded here.
 *
 * Resolves each id to a catalog entry, else to a custom-URL entry from
 * `appBuilderComponentSources`. When nothing resolves to `kind: 'integration'` the
 * phase is a no-op (no permission check). Otherwise it gates on the Developer /
 * System Admin role once, builds the runner deps once, then deploys sequentially;
 * a failed gate or deploy throws (fails the creation flow).
 */
export async function executeAppBuilderIntegrationsPhase(
    context: HandlerContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    progressTracker: ProgressTracker,
): Promise<void> {
    const entries = deployableAppIntegrationEntries(typedConfig);

    if (entries.length === 0) {
        return;
    }

    const { ServiceLocator } = await import('@/core/di');
    const permission = await ServiceLocator.getAuthenticationService().testDeveloperPermissions();
    if (!permission.hasPermissions) {
        throw new Error(
            permission.error ||
                'Your account lacks the Developer or System Admin role required to deploy ' +
                    'App Builder integrations. Select a different organization or contact your administrator.',
        );
    }

    const { buildDefaultRunnerDeps, buildRunnerDepsContext } = await import(
        '@/features/project-creation/services/appBuilderComponentRunnerDeps'
    );
    const { addAppBuilderComponent } = await import(
        '@/features/app-builder/services/appBuilderComponentRunner'
    );
    const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));

    // The runner's first step per integration is the union API subscribe — surface
    // it once up front so the user sees API access being provisioned at build time
    // (the Add-Integration modal no longer subscribes anything itself).
    progressTracker('Deploying Integrations', 69, 'Enabling API access...');
    for (const entry of entries) {
        progressTracker('Deploying Integrations', 70, `Deploying ${entry.name}...`);
        const result = await addAppBuilderComponent(project, entry, deps);
        if (!result.success) {
            throw new Error(result.error || 'App Builder integration deployment failed');
        }
    }
}
