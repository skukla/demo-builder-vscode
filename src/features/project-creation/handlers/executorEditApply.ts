/**
 * Project Creation — an Edit's Finish without the rebuild (PL-75).
 *
 * Edit's Finish used to rebuild the whole project whatever the SC changed. Two
 * kinds of Edit no longer do:
 * - nothing changed: the project is saved and nothing else runs
 *   (`saveUnchangedEdit`);
 * - only integrations were added or removed: just those are added and removed,
 *   through the same steps as the Integrations screen's Add and Remove.
 *
 * The rebuild never removed anything: an integration unticked in Edit stayed
 * deployed, and its record put it back on the list at the next load. Every
 * integration still ticked was deployed again.
 *
 * @module features/project-creation/handlers/executorEditApply
 */

import * as vscode from 'vscode';
import {
    ensureWorkspaceRuntimeReady,
    executeAppBuilderIntegrationsPhase,
} from './executorAppBuilderPhase';
import { loadExistingProjectForEdit, saveUnchangedEdit } from './executorEditMode';
import type { ProgressTracker } from './shared';
import { isMeshComponentId } from '@/core/constants';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentGuards';
import { removeWithCleanup } from '@/features/dashboard/handlers/appBuilderComponentRemove';
import {
    appliesInPlace,
    selectionDelta,
} from '@/features/project-creation/ui/wizard/editChanges';
import { integrationStateFromSettings } from '@/features/project-creation/ui/wizard/integrationStateFromSettings';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** Asks the SC to confirm removing these integrations, by name. True to go ahead. */
export type ConfirmRemoval = (names: string[]) => Promise<boolean>;

/**
 * Finish an Edit without the rebuild, when it can be.
 *
 * @param context - the handler context
 * @param config - what Finish was given, with the changed choices (`editChanges`)
 * @param progressTracker - the wizard's progress screen
 * @param confirm - asks before anything is removed
 * @returns true when the Edit is finished; false to run the full rebuild
 * @throws when a removal or an add fails, or the SC declines the removal
 */
export async function finishEditWithoutRebuild(
    context: HandlerContext,
    config: ProjectCreationConfig,
    progressTracker: ProgressTracker,
    confirm: ConfirmRemoval = confirmRemovalModal,
): Promise<boolean> {
    if (await saveUnchangedEdit(context, config, progressTracker)) return true;
    return applyIntegrationEdit(context, config, progressTracker, confirm);
}

/** Add and remove just the integrations the SC added and removed. */
async function applyIntegrationEdit(
    context: HandlerContext,
    config: ProjectCreationConfig,
    progressTracker: ProgressTracker,
    confirm: ConfirmRemoval,
): Promise<boolean> {
    const changes = config.editChanges;
    if (!config.editProjectPath || !changes?.length) return false;
    const project = await loadExistingProjectForEdit(config.editProjectPath, context);
    if (!project) return false;
    // The selection as the project records it, read as the wizard read it on opening.
    const before = integrationStateFromSettings({ selections: project.componentSelections });
    const delta = selectionDelta(
        before.selectedAppBuilderComponents ?? [],
        config.selectedAppBuilderComponents ?? [],
    );
    if (!appliesInPlace(changes, delta, isMeshComponentId)) return false;

    context.logger.info(
        `[Project Edit] Applying in place: adding [${delta.added.join(', ')}], ` +
            `removing [${delta.removed.join(', ')}]`,
    );
    const names = delta.removed.map((id) => getAppBuilderComponent(project, id)?.name ?? id);
    if (names.length > 0 && !(await confirm(names))) {
        throw new Error('Saving changes was cancelled by user. Nothing was changed.');
    }
    const refused = await runGuards(context, project);
    if (refused) throw new Error(refused.error);

    const warnings = await removeEach(context, project, delta.removed, progressTracker);
    await addEach(context, project, config, delta.added, progressTracker);
    project.lastModified = new Date();
    await context.stateManager.saveProject(project);
    if (warnings.length > 0) void vscode.window.showWarningMessage(warnings.join(' '));
    // The sentinel the wizard's progress screen finishes on.
    progressTracker('Project Created', 100, 'Changes applied');
    return true;
}

/**
 * Remove each integration, stopping at the first that fails.
 *
 * @returns what the removals could not clean up, to tell the SC
 */
async function removeEach(
    context: HandlerContext,
    project: Project,
    ids: string[],
    progressTracker: ProgressTracker,
): Promise<string[]> {
    const warnings: string[] = [];
    for (const id of ids) {
        const name = getAppBuilderComponent(project, id)?.name ?? id;
        const removed = await removeWithCleanup(context, project, id, (stage, step) =>
            progressTracker(stage, 50, step ? `${name}: ${step}` : name),
        );
        if (!removed.success) throw new Error(removed.error ?? `${name} was not removed.`);
        warnings.push(...(removed.warnings ?? []));
    }
    return warnings;
}

/**
 * Add the new integrations through creation's own integration phase, given only
 * them: their API picks and settings (an ERP's name) are recorded on the project
 * first, as creation records them before it deploys.
 */
async function addEach(
    context: HandlerContext,
    project: Project,
    config: ProjectCreationConfig,
    ids: string[],
    progressTracker: ProgressTracker,
): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
        const picks = config.componentApiPicks?.[id];
        if (picks) project.componentApiPicks = { ...project.componentApiPicks, [id]: picks };
        const settings = config.componentConfigs?.[id];
        if (settings) project.componentConfigs = { ...project.componentConfigs, [id]: settings };
    }
    const onlyAdded: ProjectCreationConfig = { ...config, selectedAppBuilderComponents: ids };
    await ensureWorkspaceRuntimeReady(context, onlyAdded);
    await executeAppBuilderIntegrationsPhase(context, project, onlyAdded, progressTracker);
}

/** The confirmation before an Edit removes integrations: one modal, every name in it. */
async function confirmRemovalModal(names: string[]): Promise<boolean> {
    const one = names.length === 1;
    const choice = await vscode.window.showWarningMessage(
        `Remove ${names.join(' and ')}?`,
        {
            modal: true,
            detail:
                `Saving undeploys ${one ? 'it' : 'them'} and removes what ${one ? 'it' : 'they'} ` +
                `set up. You can add ${one ? 'it' : 'them'} again later.`,
        },
        'Remove',
    );
    return choice === 'Remove';
}
