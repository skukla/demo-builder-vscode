/**
 * Project Creation — an Edit's Finish without the rebuild (PL-75).
 *
 * Edit's Finish used to rebuild the whole project whatever the SC changed. Two
 * kinds of Edit no longer do:
 * - nothing changed: the project is saved and nothing else runs
 *   (`saveUnchangedEdit`);
 * - only integrations or the mesh were added or removed, or the datapack changed:
 *   just those. Integrations go through the Integrations screen's own Add and
 *   Remove (`addWithSteps`, `removeWithCleanup`), with its checks; a mesh add or
 *   removal republishes the storefront (or, headless, writes the frontend's
 *   settings again) itself. The datapack: `executorEditDatapack`. A move to another
 *   Adobe project or workspace: `executorEditDestination`. A package change on an
 *   Edge Delivery storefront: `executorEditPackage`, last, since its reset builds the
 *   storefront from the finished project.
 *
 * Every question is asked before anything runs.
 *
 * The rebuild never removed anything: an integration unticked in Edit stayed
 * deployed, and its record put it back on the list at the next load. Every
 * integration still ticked was deployed again.
 *
 * @module features/project-creation/handlers/executorEditApply
 */

import * as vscode from 'vscode';
import { integrationProgress, selectedEntry } from './executorAppBuilderPhase';
import {
    applyDatapackChange,
    planDatapackChange,
    type AskRemoveOldDatapack,
} from './executorEditDatapack';
import {
    applyDestinationChange,
    planDestinationChange,
    type AskLeaveAdobeProject,
} from './executorEditDestination';
import { loadExistingProjectForEdit, saveUnchangedEdit } from './executorEditMode';
import {
    applyPackageChange,
    planPackageChange,
    type AskResetStorefront,
} from './executorEditPackage';
import type { ProgressTracker } from './shared';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { addWithSteps, refuseAdd } from '@/features/dashboard/handlers/appBuilderComponentAdd';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentGuards';
import type { GuardableResult } from '@/features/dashboard/handlers/appBuilderComponentOperation';
import { removeWithCleanup } from '@/features/dashboard/handlers/appBuilderComponentRemove';
import { confirmLeavingAdobeProject } from '@/features/dashboard/handlers/destinationHandlers';
import { confirmSampleDataRemoval } from '@/features/eds/services/reset/edsResetSampleData';
import {
    appliesInPlace,
    selectionDelta,
} from '@/features/project-creation/ui/wizard/editChanges';
import { integrationStateFromSettings } from '@/features/project-creation/ui/wizard/integrationStateFromSettings';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { isEdsStackId } from '@/types/typeGuards';
import type { OperationPosition } from '@/types/webviewPayloads';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** Asks the SC to confirm removing these integrations, by name. True to go ahead. */
export type ConfirmRemoval = (names: string[]) => Promise<boolean>;

/** The questions an Edit may ask before it runs. Injected so tests answer them. */
export interface EditQuestions {
    removeIntegrations: ConfirmRemoval;
    leaveAdobeProject: AskLeaveAdobeProject;
    removeOldDatapack: AskRemoveOldDatapack;
    resetStorefront: AskResetStorefront;
}

/** In production: one modal naming what is removed, and Reset's datapack question. */
const ASK_THE_SC: EditQuestions = {
    removeIntegrations: (names) => confirmRemovalModal(names),
    leaveAdobeProject: confirmLeavingAdobeProject,
    resetStorefront: () => confirmStorefrontReset(),
    removeOldDatapack: (project, canRemove) =>
        confirmSampleDataRemoval(
            project,
            vscode,
            canRemove,
            'Keep Data adds the new pack alongside.',
        ),
};

/**
 * Finish an Edit without the rebuild, when it can be.
 *
 * @param context - the handler context
 * @param config - what Finish was given, with the changed choices (`editChanges`)
 * @param progressTracker - the wizard's progress screen
 * @param ask - the questions asked before anything runs
 * @returns true when the Edit is finished; false to run the full rebuild
 * @throws when a removal or an add fails, or the SC declines the removal
 */
export async function finishEditWithoutRebuild(
    context: HandlerContext,
    config: ProjectCreationConfig,
    progressTracker: ProgressTracker,
    ask: EditQuestions = ASK_THE_SC,
): Promise<boolean> {
    if (await saveUnchangedEdit(context, config, progressTracker)) return true;
    return applyInPlace(context, config, progressTracker, ask);
}

/** Do just what the SC changed: integrations added and removed, and the datapack. */
async function applyInPlace(
    context: HandlerContext,
    config: ProjectCreationConfig,
    progressTracker: ProgressTracker,
    ask: EditQuestions,
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
    if (!appliesInPlace(changes, delta, isEdsStackId(config.selectedStack))) return false;

    context.logger.info(
        `[Project Edit] Applying in place: adding [${delta.added.join(', ')}], ` +
            `removing [${delta.removed.join(', ')}], changed [${changes.join(', ')}]`,
    );
    const names = delta.removed.map((id) => getAppBuilderComponent(project, id)?.name ?? id);
    if (names.length > 0 && !(await ask.removeIntegrations(names))) {
        throw new Error('Saving changes was cancelled by user. Nothing was changed.');
    }
    const destination = await planDestinationChange(
        project,
        config,
        changes,
        delta.removed,
        ask.leaveAdobeProject,
    );
    const datapack = await planDatapackChange(context, project, changes, ask.removeOldDatapack);
    const packageChange = await planPackageChange(project, changes, ask.resetStorefront);
    if (delta.added.length + delta.removed.length > 0 || destination.moves) {
        const refused = await runGuards(context, project);
        if (refused) throw new Error(refused.error);
    }

    // Removals first, so what goes is not moved; the move next, so what is added
    // deploys to the new destination.
    const warnings = await runEach(delta.removed, progressTracker, (id, report) =>
        removeWithCleanup(context, project, id, report),
    );
    await applyDestinationChange(context, project, destination, progressTracker);
    warnings.push(
        ...(await runEach(delta.added, progressTracker, (id, report) =>
            addOne(context, project, config, id, report),
        )),
    );
    // After the integrations, as in creation: a pack lands on the finished project.
    await applyDatapackChange(context, project, config, datapack, progressTracker, packageChange.resets);
    await applyPackageChange(context, project, config, packageChange, progressTracker);
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

/**
 * The confirmation before an Edit resets the storefront onto a new package: Reset's
 * own warning, and where hand edits go (the reset is one commit on top, so the code
 * before it stays in the repository's history).
 */
async function confirmStorefrontReset(): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
        'Reset the storefront to the new package?',
        { modal: true, detail: "Its code and content are replaced. Hand edits stay in the repository's history." },
        'Reset Storefront',
    );
    return choice === 'Reset Storefront';
}

/** The confirmation before an Edit removes integrations: one modal, every name in it. */
async function confirmRemovalModal(names: string[]): Promise<boolean> {
    const it = names.length === 1 ? 'it' : 'them';
    const choice = await vscode.window.showWarningMessage(
        `Remove ${names.join(' and ')}?`,
        { modal: true, detail: `This undeploys ${it}. You can add ${it} back later.` },
        'Remove',
    );
    return choice === 'Remove';
}
