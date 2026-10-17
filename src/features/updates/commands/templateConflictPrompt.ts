/**
 * What the Check Updates command does when a template merge stops on conflicts.
 *
 * The sync service refuses to resolve a conflict on its own: the conflicted
 * files are the SC's own edits, and those are never overwritten silently. This
 * module owns the one place a human is asked instead — a modal that lists the
 * files and offers a reset as an explicit, separately confirmed second choice.
 * Cancelling leaves the storefront exactly as it was.
 */

import * as vscode from 'vscode';
import type { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import { isThinLayerProject } from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';

export const RESET_TO_TEMPLATE = 'Reset to template';

/** The three ways one project's template update can end. */
export type TemplateUpdateOutcome =
    | { kind: 'synced'; result: TemplateSyncResult }
    | { kind: 'kept'; conflicts: string[] }
    | { kind: 'failed'; error: string };

function conflictLead(project: Project, conflicts: string[]): string {
    const noun = conflicts.length === 1 ? 'file' : 'files';
    return (
        `${project.name}: the template update conflicts with your edits in ${conflicts.length} ${noun}.\n\n`
        + `${conflicts.join('\n')}\n\n`
    );
}

function conflictPrompt(project: Project, conflicts: string[]): string {
    return (
        conflictLead(project, conflicts)
        + 'Nothing has been changed. "Reset to template" replaces those files with the template\'s '
        + 'version and discards your edits to them. Cancel keeps your storefront as it is.'
    );
}

/**
 * A thin-layer storefront is offered no template reset: it would drop Demo Builder's
 * fixes. The project's own Reset rebuilds it at the tested version with them (EDS-51).
 */
function thinLayerConflictNotice(project: Project, conflicts: string[]): string {
    return (
        conflictLead(project, conflicts)
        + 'Nothing has been changed. To take the update anyway, Reset the project from its '
        + 'dashboard: it rebuilds the code at the tested version with every Demo Builder fix, '
        + 'and replaces your own code edits.'
    );
}

/**
 * Run one project's template update: merge first, and on conflicts ask the SC
 * whether to reset. Any other failure is returned as-is.
 */
export async function syncTemplateWithConflictPrompt(
    project: Project,
    service: Pick<TemplateSyncService, 'syncWithTemplate'>,
): Promise<TemplateUpdateOutcome> {
    const merged = await service.syncWithTemplate(project, { strategy: 'merge' });
    if (merged.success) return { kind: 'synced', result: merged };
    if (!merged.conflicts?.length) return { kind: 'failed', error: merged.error || 'Unknown error' };

    if (isThinLayerProject(project)) {
        // Not modal: there is nothing to choose here, only where to go next.
        void vscode.window.showWarningMessage(thinLayerConflictNotice(project, merged.conflicts));
        return { kind: 'kept', conflicts: merged.conflicts };
    }

    const choice = await vscode.window.showWarningMessage(
        conflictPrompt(project, merged.conflicts),
        { modal: true },
        RESET_TO_TEMPLATE,
    );
    if (choice !== RESET_TO_TEMPLATE) return { kind: 'kept', conflicts: merged.conflicts };

    const reset = await service.syncWithTemplate(project, { strategy: 'reset' });
    return reset.success
        ? { kind: 'synced', result: reset }
        : { kind: 'failed', error: reset.error || 'Unknown error' };
}

/** The toast shown after the loop, counting what synced, what failed and what the SC kept. */
export function templateSummary(successCount: number, failCount: number, keptCount: number): string {
    if (failCount === 0 && keptCount === 0) {
        return `Successfully synced ${successCount} template(s).`;
    }
    const parts = [`Synced ${successCount} template(s)`];
    if (failCount > 0) parts.push(`${failCount} failed`);
    if (keptCount > 0) parts.push(`${keptCount} left unchanged (merge conflicts)`);
    return `${parts.join(', ')}.`;
}
