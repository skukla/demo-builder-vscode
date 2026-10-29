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

import { buildDeployOrgTarget } from './executorMeshPhase';
import type { ProgressTracker } from './shared';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import { withOrgContext } from '@/core/shell/orgContextEnv';
import { phaseSinkHere, withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import {
    getAppBuilderComponentEntry,
    buildCustomIntegrationEntry,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { HandlerContext } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * The selected App Builder components that resolve to a DEPLOYABLE integration app
 * (`kind: 'integration'`) — catalog entries or custom-URL entries. Mesh-kind
 * selections are excluded (the mesh phase installs them). This is the set
 * that will `aio app deploy`, so it also gates the Runtime pre-flight.
 */
export function deployableAppIntegrationEntries(
    typedConfig: ProjectCreationConfig,
): AppBuilderComponentCatalogEntry[] {
    return (typedConfig.selectedAppBuilderComponents ?? [])
        .map((id) => selectedEntry(typedConfig, id))
        .filter((entry): entry is AppBuilderComponentCatalogEntry => entry?.kind === 'integration');
}

/**
 * The catalog entry a selected id stands for: a catalog id, else a custom-URL
 * source the wizard recorded under it. Creation and an Edit that adds (PL-75)
 * resolve the same way.
 *
 * @param typedConfig - what Finish was given
 * @param id - a selected App Builder component id
 * @returns the entry, or undefined when the id resolves to nothing
 */
export function selectedEntry(
    typedConfig: ProjectCreationConfig,
    id: string,
): AppBuilderComponentCatalogEntry | undefined {
    const source = typedConfig.appBuilderComponentSources?.[id];
    return (
        getAppBuilderComponentEntry(id) ??
        // The sources-map key IS the instance id (shell instancing: N
        // named instances may share one template repo).
        (source ? buildCustomIntegrationEntry(source, id) : undefined)
    );
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
    const { ServiceLocator } = await import('@/core/di/serviceLocator');
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
        ensureWorkspaceRuntime(commandManager, context.logger, demoBuilderNode(), async () =>
            (await authService.getEntityServices()).workspaceOps.ensureWorkspaceRuntimeNamespace(
                organization,
                projectId,
                workspace,
            ),
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
    project: import('@/types/base').Project,
    typedConfig: ProjectCreationConfig,
    progressTracker: ProgressTracker,
): Promise<void> {
    const entries = deployableAppIntegrationEntries(typedConfig);

    if (entries.length === 0) {
        return;
    }

    const { ServiceLocator } = await import('@/core/di/serviceLocator');
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
        '@/features/app-builder/services/appBuilderAddRun'
    );
    const { replaceDeployedElsewhere } = await import(
        '@/features/dashboard/handlers/replaceDeployedElsewhere'
    );
    const { report, nested, start } = integrationProgress(progressTracker);
    const services = {
        authManager: ServiceLocator.getAuthenticationService(),
        commandManager: ServiceLocator.getCommandExecutor(),
    };
    const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project, services), report);

    // The runner's first step per integration is the union API subscribe — surface
    // it once up front so the user sees API access being provisioned at build time
    // (the Add-Integration modal no longer subscribes anything itself).
    progressTracker(OPERATION_STAGES.deployingIntegrations.label, 69, 'Enabling API access');
    for (const entry of entries) {
        // A copied project deploys here, into the Adobe project its original already
        // deployed to (2026-10-08): the original's same-named deployment goes first.
        const replaced = await replaceDeployedElsewhere(context, project, entry, services, report);
        if (replaced) throw new Error(replaced.error);
        progressTracker(OPERATION_STAGES.deployingIntegrations.label, 70, `Deploying ${entry.name}`);
        start(entry.name);
        const result = await withPhaseSinks([nested], () => addAppBuilderComponent(project, entry, deps));
        if (!result.success) {
            throw new Error(result.error || 'App Builder integration deployment failed');
        }
    }
}

/**
 * An integration's own steps, folded into the one step creation (or an Edit) is on.
 *
 * Line 1 stays `step` ("Deploying integrations (6 of 9)") however many steps each
 * integration runs, and line 2 is the integration's own step under its name
 * ("Northwind ERP: Deploying the app"), as every other flow keeps one numbered step
 * with its parts under it (owner, 2026-10-16: "Fold"). When the runner names the moment
 * ("Registering webhooks"), or a line arrives from deeper in (the Commerce installer's),
 * that is the part line 2 shows. A pair names the member it is on.
 *
 * The reporter creation hands in also tells an agent, through the same channel the
 * lines from deeper in arrive on. What it tells the agent goes on to the agent, not
 * back round as a line from deeper in: until 2026-10-16 each came round again until
 * the stack ran out, sending the screen a thousand growing lines per step.
 *
 * @param progressTracker - the creation screen's reporter
 * @param step - the step on line 1 while these run
 * @returns the runner's reporter, the sink for lines from deeper in, and `start`, which
 *   names the integration the next steps are for
 */
export function integrationProgress(
    progressTracker: ProgressTracker,
    step: string = OPERATION_STAGES.deployingIntegrations.label,
): {
    report: (stage: string, step?: string, position?: OperationPosition) => void;
    nested: (message: string) => void;
    start: (name: string) => void;
} {
    let integration = '';
    let current: { stage: string; name: string } | undefined;
    let showing = false;
    // Made here, outside the scope the deploys run in, so it reaches the agent.
    const toAgent = phaseSinkHere();
    const show = (part: string): void => {
        if (!current) return;
        showing = true;
        try {
            progressTracker(step, 70, current.name ? `${current.name}: ${part}` : part);
        } finally {
            showing = false;
        }
    };
    return {
        report: (stage, detail, position) => {
            current = { stage, name: position?.name ?? integration };
            show(detail || stage);
        },
        nested: (message) => {
            if (showing) toAgent(message);
            else show(message);
        },
        start: (name) => {
            integration = name;
            current = undefined;
        },
    };
}
