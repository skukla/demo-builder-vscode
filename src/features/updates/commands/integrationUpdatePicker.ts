/**
 * The Check for Updates shell around integration pairs (AB-73) — the UI
 * counterpart of `applyIntegrationUpdates` in `services/integrationUpdates.ts`.
 * Both call the one core; this file owns the rows, the context that can run
 * deploys, the progress and the toasts. Lives beside `updateExecutor.ts` rather
 * than in it because that file is at its size limit.
 *
 * The SC picking the row IS the confirmation, as it is for a block library
 * install: nothing here deploys unless the row was selected.
 *
 * A boundary (`commands/`): it builds the headless handler context the
 * dashboard's boundary functions need, once per check and once per update run.
 */

import * as vscode from 'vscode';
import { toIntegrationUpdateItem, type IntegrationUpdateItem } from './updateTypes';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { createHeadlessHandlerContext } from '@/features/ai/server/headlessHandlerContext';
import { hasIntegrationsToCheck } from '@/features/app-builder/services/integrationUpdateCheck';
import {
    integrationUpdateProbe,
    updateIntegrationPairFor,
} from '@/features/dashboard/handlers/integrationUpdateHandlers';
import {
    applyIntegrationUpdates,
    findIntegrationPairUpdates,
} from '@/features/updates/services/integrationUpdates';
import type { IntegrationPairUpdater, UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/** What the command has, and the headless handler context is built from. */
export interface IntegrationPickerParts {
    context: vscode.ExtensionContext;
    stateManager: StateManager;
    logger: Logger;
}

function headlessContext(parts: IntegrationPickerParts): HandlerContext {
    return createHeadlessHandlerContext(parts.context, parts.stateManager, parts.logger);
}

/**
 * The picker rows for every pair with newer code across `projects`, by the
 * Integrations screen's own rule. Nothing is built when no project has a
 * deployed integration; a check that fails costs only these rows and is logged.
 */
export async function detectIntegrationUpdateItems(
    parts: IntegrationPickerParts,
    projects: Project[],
    currentProject: Project | null,
): Promise<IntegrationUpdateItem[]> {
    if (!projects.some(hasIntegrationsToCheck)) return [];
    try {
        const updates = await findIntegrationPairUpdates(projects, integrationUpdateProbe(headlessContext(parts)));
        parts.logger.debug(`[Updates] Integration check complete: ${updates.length} pair(s) have newer code`);
        return updates.map((update) => toIntegrationUpdateItem(update, currentProject));
    } catch (error) {
        parts.logger.warn(`[Updates] Integration check failed: ${sanitizeErrorForLogging(error as Error)}`);
        return [];
    }
}

/** The pair update the card runs, bound to one headless context built on first use. */
export function integrationPairUpdater(parts: IntegrationPickerParts): IntegrationPairUpdater {
    let context: HandlerContext | undefined;
    return (project, componentId, report) => {
        context ??= headlessContext(parts);
        return updateIntegrationPairFor(context, project, componentId, report);
    };
}

/**
 * Update the picked pairs under one progress notification, then say what each
 * did: a line per update, a failure in the update's own words, and the note for
 * a pair that must be updated from its own project.
 */
export async function performIntegrationUpdates(
    selections: IntegrationUpdateItem[],
    ctx: UpdateContext,
): Promise<void> {
    const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Updating Integrations', cancellable: false },
        (progress) =>
            applyIntegrationUpdates(
                selections.map((item) => item.update),
                ctx,
                (message) => progress.report({ message }),
            ),
    );
    for (const line of result.applied ?? []) vscode.window.showInformationMessage(line);
    for (const line of result.deferred ?? []) vscode.window.showInformationMessage(line);
    for (const error of result.errors) vscode.window.showErrorMessage(error);
}
