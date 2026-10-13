/**
 * Project Creation — an Edit's Finish without the rebuild (PL-75).
 *
 * Edit's Finish used to rebuild the whole project whatever the SC changed. Two
 * kinds of Edit no longer do:
 * - nothing changed: the project is saved and nothing else runs
 *   (`saveUnchangedEdit`);
 * - only integrations or the mesh were added or removed: just those are added and
 *   removed, through the Integrations screen's own Add and Remove (`addWithSteps`,
 *   `removeWithCleanup`), with its checks.
 *   A mesh add or removal republishes the storefront (or, headless, writes the
 *   frontend's settings again) itself.
 *
 * The rebuild never removed anything: an integration unticked in Edit stayed
 * deployed, and its record put it back on the list at the next load. Every
 * integration still ticked was deployed again.
 *
 * @module features/project-creation/handlers/executorEditApply
 */

import * as vscode from 'vscode';
import { integrationProgress, selectedEntry } from './executorAppBuilderPhase';
import { loadExistingProjectForEdit, saveUnchangedEdit } from './executorEditMode';
import type { ProgressTracker } from './shared';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { addWithSteps, refuseAdd } from '@/features/dashboard/handlers/appBuilderComponentAdd';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentGuards';
import type { GuardableResult } from '@/features/dashboard/handlers/appBuilderComponentOperation';
import { removeWithCleanup } from '@/features/dashboard/handlers/appBuilderComponentRemove';
import {
    appliesInPlace,
    selectionDelta,
} from '@/features/project-creation/ui/wizard/editChanges';
import { integrationStateFromSettings } from '@/features/project-creation/ui/wizard/integrationStateFromSettings';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';
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
    if (!appliesInPlace(changes, delta)) return false;

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

    const warnings = [
        ...(await runEach(delta.removed, progressTracker, (id, report) =>
            removeWithCleanup(context, project, id, report),
        )),
        ...(await runEach(delta.added, progressTracker, (id, report) =>
            addOne(context, project, config, id, report),
        )),
    ];
    project.lastModified = new Date();
    await context.stateManager.saveProject(project);
    if (warnings.length > 0) void vscode.window.showWarningMessage(warnings.join(' '));
    // The sentinel the wizard's progress screen finishes on.
    progressTracker('Project Created', 100, 'Changes applied');
    return true;
}

/** A stage reporter, as the Integrations screen's Add and Remove take one. */
type Report = (stage: string, step?: string, position?: OperationPosition) => void;

/**
 * Run an add or a removal for each id, in order, onto the wizard's progress screen
 * the way creation's integration phase reports, stopping at the first that fails.
 *
 * @returns what they warned about, to tell the SC
 */
async function runEach(
    ids: string[],
    progressTracker: ProgressTracker,
    run: (id: string, report: Report) => Promise<GuardableResult>,
): Promise<string[]> {
    const { report, nested } = integrationProgress(progressTracker);
    const warnings: string[] = [];
    for (const id of ids) {
        const result = await withPhaseSinks([nested], () => run(id, report));
        if (!result.success) throw new Error(result.error ?? `${id}: nothing was changed.`);
        warnings.push(...(result.warnings ?? []));
    }
    return warnings;
}

/**
 * Add one integration or the mesh the way the Integrations screen adds one, with
 * the settings the wizard recorded for it (an ERP's name) and its API picks.
 */
async function addOne(
    context: HandlerContext,
    project: Project,
    config: ProjectCreationConfig,
    id: string,
    report: Report,
): Promise<GuardableResult> {
    const entry = selectedEntry(config, id);
    if (!entry) return { success: false, error: `"${id}" is not in the catalog. Nothing was added.` };
    const refused = refuseAdd(project, entry);
    if (refused) return { success: false, error: refused.error };
    const settings = config.componentConfigs?.[id];
    if (settings) project.componentConfigs = { ...project.componentConfigs, [id]: settings };
    return addWithSteps(context, project, entry, report, { apis: config.componentApiPicks?.[id] });
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
