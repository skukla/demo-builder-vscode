/**
 * The question a project delete asks before anything is removed.
 *
 * A plain project gets one modal. An EDS project is asked which of the things it
 * created online (the GitHub repository, the DA.live site) should go too — in the
 * screen's progress modal when a screen started the delete, else a QuickPick with
 * checkboxes. The `demoBuilder.cleanupBehavior` setting can answer for the SC
 * (`deleteAll`) or narrow it to the plain modal (`localOnly`).
 *
 * Split from `projectDeletionService.ts` on 2026-10-09 (EDS-8). Nothing here
 * deletes anything: the answer is handed back, and the caller acts on it.
 */

import * as vscode from 'vscode';
import { askForDetailsDuringOperation, withModalAsking } from '@/core/vscode/operationPrompt';
import type { extractEdsMetadata } from '@/features/eds/services/resourceCleanupHelpers';
import type { Project } from '@/types/base';

/**
 * Cleanup options for EDS projects
 */
export interface CleanupOptions {
    deleteGitHubRepo: boolean;
    deleteDaLiveSite: boolean;
    /** The project being deleted: it does not count as "another project on the repository". */
    projectPath?: string;
}

/**
 * The plain confirmation: one modal, one Delete button. True only when the SC
 * pressed Delete; dismissing it, or any other answer, is a cancel.
 */
export async function confirmPlainDelete(project: Project): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${project.name}"?`,
        {
            modal: true,
            detail: 'This will remove all project files and configuration. This action cannot be undone.',
        },
        'Delete',
    );

    return confirm === 'Delete';
}

/**
 * The plain confirmation for an EDS project that will touch nothing online:
 * no external resource is deleted on a yes, and null means cancel.
 */
async function confirmLocalOnly(project: Project): Promise<CleanupOptions | null> {
    if (!(await confirmPlainDelete(project))) {
        return null;
    }

    return { deleteGitHubRepo: false, deleteDaLiveSite: false };
}

/**
 * One external resource the SC may delete alongside the project.
 */
interface CleanupQuickPickItem extends vscode.QuickPickItem {
    id: 'github' | 'daLive';
}

/**
 * The same question as the QuickPick, in the modal already narrating the delete:
 * one box per resource, unticked, as the QuickPick starts.
 */
async function askCleanupInModal(
    project: Project,
    items: CleanupQuickPickItem[],
): Promise<CleanupOptions | null> {
    const labels: Record<CleanupQuickPickItem['id'], string> = {
        github: 'Also delete the GitHub repository',
        daLive: 'Also delete the DA.live site',
    };
    const asked = await askForDetailsDuringOperation({
        message: `Delete "${project.name}"? Its files are removed from this machine. You can also delete what it created online. Sign-in may be required.`,
        fields: items.map((item) => ({
            id: item.id,
            label: labels[item.id],
            kind: 'checkbox' as const,
            value: '',
            description: item.description,
        })),
        actions: ['Delete'],
    });
    if (asked.action !== 'Delete') return null;
    return {
        deleteGitHubRepo: asked.values.github === 'true',
        deleteDaLiveSite: asked.values.daLive === 'true',
    };
}

/**
 * Show cleanup confirmation dialog for EDS projects
 *
 * Asks which external resources to also delete: in the screen's progress modal when
 * a screen started the delete, else a QuickPick with checkboxes.
 * - Delete (or Enter) → Delete local project + selected external resources
 * - Cancel, Escape or click outside → Cancel entirely (no deletion)
 *
 * @param modalId - the operation id of the screen's modal, when one is showing
 * @returns Cleanup options (which external resources to delete), or null if cancelled
 */
export async function showCleanupConfirmation(
    project: Project,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    modalId?: string,
): Promise<CleanupOptions | null> {
    // Check cleanup behavior configuration setting
    const config = vscode.workspace.getConfiguration('demoBuilder');
    const behavior = config.get<string>('cleanupBehavior', 'ask');

    if (behavior === 'deleteAll') {
        // Auto-delete all available resources (auth is checked lazily during cleanup)
        return {
            deleteGitHubRepo: !!edsMetadata?.githubRepo,
            deleteDaLiveSite: !!edsMetadata?.daLiveOrg && !!edsMetadata?.daLiveSite,
        };
    }

    if (behavior === 'localOnly') {
        // Local only: show standard confirmation, skip external cleanup
        return confirmLocalOnly(project);
    }

    const items: CleanupQuickPickItem[] = [];

    // GitHub repository option
    if (edsMetadata?.githubRepo) {
        items.push({
            id: 'github',
            label: '$(github) Delete Repository',
            description: edsMetadata.githubRepo,
            detail: '$(key) Sign-in required',
            picked: false,
        });
    }

    // DA.live site option (includes Helix unpublish)
    if (edsMetadata?.daLiveOrg && edsMetadata?.daLiveSite) {
        items.push({
            id: 'daLive',
            label: '$(file-text) Delete DA.live Site',
            description: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
            detail: '$(key) Sign-in required',
            picked: false,
        });
    }

    // If no external resources, skip the dialog and show standard confirmation
    if (items.length === 0) {
        return confirmLocalOnly(project);
    }

    if (modalId) {
        return withModalAsking(modalId, () => askCleanupInModal(project, items));
    }

    // Cancel button for explicit cancellation
    const cancelButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('close'),
        tooltip: 'Cancel',
    };

    // Show QuickPick with cleanup options
    const quickPick = vscode.window.createQuickPick<CleanupQuickPickItem>();
    quickPick.title = `Delete "${project.name}"`;
    quickPick.placeholder = 'Also delete these external resources? (Enter to delete)';
    quickPick.canSelectMany = true;
    quickPick.ignoreFocusOut = true; // Prevent dismissal when webview takes focus
    quickPick.items = items;
    quickPick.selectedItems = items.filter(i => i.picked);
    quickPick.buttons = [cancelButton];

    return new Promise<CleanupOptions | null>((resolve) => {
        let resolved = false;

        // Cancel button = abort deletion
        quickPick.onDidTriggerButton(() => {
            if (resolved) return;
            resolved = true;
            quickPick.hide();
            resolve(null);
        });

        // Enter key confirms deletion
        quickPick.onDidAccept(() => {
            if (resolved) return;
            resolved = true;
            const selected = quickPick.selectedItems;
            quickPick.hide();
            resolve({
                deleteGitHubRepo: selected.some(i => i.id === 'github'),
                deleteDaLiveSite: selected.some(i => i.id === 'daLive'),
            });
        });

        // Escape = Cancel entirely (no deletion)
        quickPick.onDidHide(() => {
            if (resolved) return;
            resolved = true;
            resolve(null);
        });

        quickPick.show();
    });
}
