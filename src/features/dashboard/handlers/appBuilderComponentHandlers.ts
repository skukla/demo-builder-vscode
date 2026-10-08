/**
 * AppBuilderComponent Handlers (D2 Track B — Step 05)
 *
 * The dashboard message handlers that drive the live D1 deploy-contract runner
 * from the integrations list. THIS is the first UI-driven `addAppBuilderComponent`
 * (clone + install + subscribe + deploy), distinct from Track A's bounded mesh
 * subscribe.
 *
 * Guard order: auth → org-mismatch → App Builder permission (inherited from
 * the retired singular DeployAppCommand),
 * permission), then assembles a RunnerDepsContext via buildDefaultRunnerDeps —
 * supplying the Track A `subscriberClient` adapter, the stack-filtered `catalog`,
 * and the extension `secrets` — before invoking the runner. A failing guard
 * surfaces the message and NEVER calls the runner. Runner failures post a typed
 * `error` row status (no throw to the webview, P2).
 *
 * Add routes a bucket-3 entry (envSchema with userText/userSecret) to Configure
 * FIRST, so an App Builder component that needs user inputs is never silently deployed with
 * missing values.
 *
 * Reuse, not fork: the runner, the deps factory, the adapter, the catalog
 * loader, the env classifier, and the guard helpers are all consumed as-is.
 *
 * Deploy and redeploy live here. The rest of the module was split by job on
 * 2026-10-04 (EDS-8) and is re-exported below, so this path stays the one
 * importers and tests name:
 *   - `appBuilderComponentGuards`    — the guard chain
 *   - `appBuilderComponentPush`      — the dashboard pushes after an operation
 *   - `appBuilderComponentOperation` — target, progress telegraph, shared result
 *   - `appBuilderComponentAdd` / `Remove` / `Rename` — one handler each
 *
 * @module features/dashboard/handlers/appBuilderComponentHandlers
 */

import { withGuardedComponentProgress } from './appBuilderComponentGuards';
import {
    answerWithWarnings,
    buildToolchainConsent,
    kindNoun,
    resolveComponentTarget,
    type GuardableResult,
} from './appBuilderComponentOperation';
import { postComponentsSnapshot, postRowStatus, refreshProjectStatus } from './appBuilderComponentPush';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { deployAppBuilderComponent } from '@/features/app-builder/services/appBuilderRedeployRun';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { strandedSystem, strandedSystemMessage } from '@/features/components/services/appBuilderComponentLinks';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { Project } from '@/types/base';
import type { HandlerContext, MessageHandler } from '@/types/handlers';

export {
    handleAddAppBuilderComponent,
    resolveAddEntry,
    userSuppliedEnvVars,
    type UserSuppliedEnvVars,
} from './appBuilderComponentAdd';
export { guardOrBlock, runGuards, type GuardFailure } from './appBuilderComponentGuards';
export {
    buildToolchainConsent,
    resolveComponentTarget,
    withComponentProgress,
    type GuardableResult,
} from './appBuilderComponentOperation';
export {
    postComponentsSnapshot,
    postDestination,
    postMeshStatus,
    postRowStatus,
    refreshProjectStatus,
} from './appBuilderComponentPush';
export { handleRemoveAppBuilderComponent } from './appBuilderComponentRemove';
export { handleRenameAppBuilderComponent } from './appBuilderComponentRename';

/**
 * Why a system cannot be deployed on its own, when its integration's add failed and
 * left it behind (`strandedSystem`): it would run with nothing to talk to, under the
 * default name. Undefined for anything else.
 */
function strandedRefusal(project: Project, id: string): string | undefined {
    const catalog = getAppBuilderComponentCatalog();
    const stranded = strandedSystem(project, id, catalog);
    if (!stranded) return undefined;
    const integrationName =
        catalog.find((entry) => entry.id === stranded.integrationKind)?.name ?? stranded.integrationKind;
    return strandedSystemMessage(
        getAppBuilderComponent(project, id)?.name ?? id,
        integrationName,
        stranded.reusedByAdd,
    );
}

/** Shared deploy/redeploy: guards → D1 deployAppBuilderComponent {id}. */
async function deployById(
    context: HandlerContext,
    requestedId: string | undefined,
    refreshCli?: boolean,
    progress?: 'modal',
) {
    const target = await resolveComponentTarget(context, requestedId);
    if (!target.ok) return target.error;
    const { id, project } = target;
    const stranded = strandedRefusal(project, id);
    if (stranded) return { success: false, error: stranded };

    // The display name, as Add and Remove already pass — the notification title is
    // now its whole content, so a raw slug is what a background user would read.
    const displayName = getAppBuilderComponent(project, id)?.name ?? id;
    const result = await withGuardedComponentProgress(
        context,
        project,
        {
            title: 'Deploying',
            id,
            label: displayName,
            noun: kindNoun(getAppBuilderComponent(project, id)?.kind),
            progress,
        },
        async (report): Promise<GuardableResult> => {
            report(OPERATION_STAGES.deploying.label);
            // Same reuse as the add path: the deploy tail narrates its own steps.
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project, {
                    authManager: ServiceLocator.getAuthenticationService(),
                    commandManager: ServiceLocator.getCommandExecutor(),
                }),
                // The notification title already names the operation and its object, so
                // the step line is the SUB-step alone when one exists — joining both
                // produced two-line cards ('Deploying custom integration... Running
                // aio app deploy'; owner screenshot, 2026-08-27).
                (message, subMessage, position) => report(message, subMessage, position),
                buildToolchainConsent(context, refreshCli),
            );
            return deployAppBuilderComponent(project, id, deps);
        },
    );
    const status = result.success ? 'deployed' : 'error';
    await postRowStatus(
        id,
        status,
        result.success ? undefined : result.error || 'Deployment failed',
    );
    // Terminal either way — the persisted status changed; refresh the grid map.
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);
    return result.success
        ? answerWithWarnings({}, result.warnings ?? [])
        : { success: false, error: result.error };
}

/** Handle 'deployAppBuilderComponent' — deploy the given appBuilderComponent's tail. */
export const handleDeployAppBuilderComponent: MessageHandler<{
    id?: string;
    refreshCli?: boolean;
    /** `'modal'` when the SC started it from the integrations screen (PL-59). */
    progress?: 'modal';
}> = narrateOutcomeToModal(
    (context, payload) =>
        deployById(context, payload?.id, payload?.refreshCli, progressSurfaceOf(payload)),
    (payload) => payload?.id,
);

/** Redeploy is the same path (idempotent re-run of the deploy tail). */
export const handleRedeployAppBuilderComponent = handleDeployAppBuilderComponent;
