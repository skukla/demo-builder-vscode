/**
 * Before an add deploys: replace the pair another local project put into this Adobe
 * project under the same ERP name (`pairWithSameErpElsewhere`), by REMOVING it from
 * that project through the one removal path — Commerce uninstall, undeploy, the
 * registry check, its workspace, its record — and stopping the add when that removal
 * does not finish, so nothing is half-replaced.
 *
 * A handler-layer module (ADR-015): it loads the other projects through the state
 * manager and builds that other project's runner deps, which a service may not do.
 * The three doors into `addAppBuilderComponent` call it first: the dashboard add, the
 * ERP add, and creation's integrations phase, which is where a copied project deploys.
 *
 * @module features/dashboard/handlers/replaceDeployedElsewhere
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderRemoveRun';
import { pairWithSameErpElsewhere } from '@/features/app-builder/services/pairWithSameErpElsewhere';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** The shared singletons the handler resolved at the boundary (ADR-015). */
export interface ReplaceServices {
    authManager: AuthenticationService;
    commandManager: CommandExecutor;
}

/** Every other local project, loaded without moving the current-project pointer. */
async function loadOtherProjects(context: HandlerContext, project: Project): Promise<Project[]> {
    const summaries = await context.stateManager.getAllProjects();
    const loaded = await Promise.all(
        summaries
            .filter((summary) => summary.path !== project.path)
            .map((summary) =>
                context.stateManager.loadProjectFromPath(summary.path, undefined, {
                    persistAfterLoad: false,
                }),
            ),
    );
    return loaded.filter((other): other is Project => other !== null);
}

/** The Adobe project as a person names it. */
function adobeProjectTitle(project: Project): string {
    return project.adobe?.projectTitle ?? project.adobe?.projectName ?? project.adobe?.projectId ?? 'the Adobe project';
}

/**
 * Remove the same-named deployment from the other project that holds it, if any.
 *
 * @param context - the handler context (state manager, logger)
 * @param project - the project about to deploy `entry`
 * @param entry - the catalog entry being added
 * @param services - the auth service and command executor the handler resolved
 * @param report - where the removal's stages go
 * @returns why the add must stop, when the other project's removal did not finish
 */
export async function replaceDeployedElsewhere(
    context: HandlerContext,
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    services: ReplaceServices,
    report: (message: string, subMessage?: string) => void,
): Promise<{ error: string } | undefined> {
    if (!project.adobe?.projectId) return undefined;
    const others = await loadOtherProjects(context, project);
    const hit = pairWithSameErpElsewhere(project, entry, getAppBuilderComponentCatalog(), others);
    if (!hit) return undefined;
    const { project: other, componentId, name } = hit;
    const title = adobeProjectTitle(project);
    report(OPERATION_STAGES.removing.label, `Replacing ${other.name}'s ${name} in ${title}`);
    context.logger.info(
        `[AppBuilderComponent Add] ${title} already holds ${name} from ${other.name} (${other.path}); removing ${componentId} there first`,
    );
    const ctx = await buildRunnerDepsContext(context, other, services);
    const deps = buildDefaultRunnerDeps(
        // The other project's record is saved in place: a `saveProject` would also make it
        // the current project, which the add that follows is not about.
        { ...ctx, saveProject: (p: Project) => context.stateManager.saveProjectConfigOnly(p) },
        report,
    );
    const removed = await removeAppBuilderComponent(other, componentId, deps);
    if (removed.success) return undefined;
    return {
        error:
            `${other.name}'s ${name} is still deployed in ${title}, so ${entry.name} was not added. ` +
            `${removed.error ?? 'Its removal did not finish.'}`,
    };
}
