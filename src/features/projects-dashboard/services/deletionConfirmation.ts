/**
 * The question a project delete asks before anything is removed.
 *
 * A plain project gets one modal. An EDS project is asked which of the things it
 * created online (the GitHub repository, the DA.live site) should go too, and a project
 * whose datapack Demo Builder installed whether that data goes from Commerce (walk F96,
 * `datapackDataRemoval.ts`) — in the screen's progress modal when a screen started the delete,
 * else a QuickPick with checkboxes. The `demoBuilder.cleanupBehavior` setting decides what
 * starts ticked (`deleteAll`: the repository and the site), or narrows it to the plain modal
 * (`localOnly`); the SC is always shown the options and can change them (owner, 2026-11-04:
 * `deleteAll` used to delete without asking). Neither ticks the datapack's data: it writes to a
 * store. The datapack itself is deleted only from the library (owner, 2026-11-09).
 *
 * Split from `projectDeletionService.ts` on 2026-10-09 (EDS-8). Nothing here
 * deletes anything: the answer is handed back, and the caller acts on it.
 */

import * as vscode from 'vscode';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { askForDetailsDuringOperation, withModalAsking } from '@/core/vscode/operationPrompt';
import { UNINSTALL_DATAPACK } from '@/features/data-installer/datapackWords';
import type { extractEdsMetadata } from '@/features/eds/services/resourceCleanupHelpers';
import type { SharedOnline } from '@/features/eds/services/storefront/sharedRepoProjects';
import { deleteSentence } from '@/features/projects-dashboard/deleteWords';
import type { RemovableData } from '@/features/projects-dashboard/services/datapackDataRemoval';
import type { Project } from '@/types/base';

/**
 * Cleanup options for EDS projects
 */
export interface CleanupOptions {
    deleteGitHubRepo: boolean;
    deleteDaLiveSite: boolean;
    /** Also remove its datapack's data from Commerce, its changes saved first. Absent means keep it. */
    removeDatapackData?: boolean;
    /** The project being deleted: it does not count as "another project on the repository". */
    projectPath?: string;
}

/**
 * The plain confirmation: one modal, one Delete button. True only when the SC
 * pressed Delete; dismissing it, or any other answer, is a cancel.
 */
export async function confirmPlainDelete(project: Project): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
        `Delete ${getProjectDisplayName(project)}?`,
        {
            modal: true,
            detail: 'Permanently removes its files from this machine.',
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

/** Nothing another project uses: what a caller that has not asked passes. */
const NOTHING_SHARED: SharedOnline = { repo: [], site: [] };

/** The data row's line: which pack, and that the SC's changes in it are kept. */
export function dataDescription(data: RemovableData): string {
    return `${data.displayName}, from this demo's Commerce instance. Your changes are saved first.`;
}

/** The things the SC may delete alongside the project. */
type CleanupItemId = 'github' | 'daLive' | 'datapackData';

/**
 * One external resource the SC may delete alongside the project.
 */
interface CleanupQuickPickItem extends vscode.QuickPickItem {
    id: CleanupItemId;
}

/** The answer, from the rows the SC left ticked. */
function answerFrom(ticked: (id: CleanupItemId) => boolean): CleanupOptions {
    return { deleteGitHubRepo: ticked('github'), deleteDaLiveSite: ticked('daLive'), removeDatapackData: ticked('datapackData') };
}

/** Each option's label, the same in the modal and the QuickPick. */
const LABELS: Record<CleanupItemId, string> = {
    github: 'Delete Repository',
    daLive: 'Delete DA.live Site',
    datapackData: UNINSTALL_DATAPACK,
};

/**
 * The same question as the QuickPick, in the modal already narrating the delete:
 * one box per resource, ticked as the QuickPick starts.
 */
async function askCleanupInModal(
    project: Project,
    items: CleanupQuickPickItem[],
): Promise<CleanupOptions | null> {
    // The question takes the window's title while it asks, the button red, as the batch window's
    // Delete; the boxes say what can go online, so the sentence says only what goes regardless
    // (owner, 2026-11-05).
    const asked = await askForDetailsDuringOperation({
        title: `Delete ${getProjectDisplayName(project)}?`,
        message: deleteSentence(items.some((item) => item.id === 'datapackData')),
        fields: items.map((item) => ({
            id: item.id,
            label: LABELS[item.id],
            kind: 'checkbox' as const,
            value: item.picked ? 'true' : '',
            description: item.description,
        })),
        actions: ['Delete'],
        destructive: true,
    });
    if (asked.action !== 'Delete') return null;
    return answerFrom((id) => asked.values[id] === 'true');
}

/**
 * One row per thing the project has that can go with it: the repository, the DA.live site, then
 * its datapack's data when that can be removed (`removableDataOf`). The repository and the site
 * start ticked under `deleteAll`; the data never does.
 */
function cleanupItems(
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    data: RemovableData | undefined,
    tickOnline: boolean,
    shared: SharedOnline,
): CleanupQuickPickItem[] {
    const items: CleanupQuickPickItem[] = [];
    // Never offered while another project uses it: deleting it would take that one down too.
    if (edsMetadata?.githubRepo && shared.repo.length === 0) {
        items.push({
            id: 'github',
            label: `$(github) ${LABELS.github}`,
            description: edsMetadata.githubRepo,
            detail: '$(key) Sign-in required',
            picked: tickOnline,
        });
    }
    // DA.live site option (includes Helix unpublish)
    if (edsMetadata?.daLiveOrg && edsMetadata?.daLiveSite && shared.site.length === 0) {
        items.push({
            id: 'daLive',
            label: `$(file-text) ${LABELS.daLive}`,
            description: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
            detail: '$(key) Sign-in required',
            picked: tickOnline,
        });
    }
    if (data) {
        items.push({
            id: 'datapackData',
            label: `$(package) ${LABELS.datapackData}`,
            description: dataDescription(data),
            picked: false,
        });
    }
    return items;
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
    data?: RemovableData,
    shared: SharedOnline = NOTHING_SHARED,
): Promise<CleanupOptions | null> {
    // Check cleanup behavior configuration setting
    const config = vscode.workspace.getConfiguration('demoBuilder');
    const behavior = config.get<string>('cleanupBehavior', 'ask');

    if (behavior === 'localOnly') {
        // Local only: show standard confirmation, skip external cleanup
        return confirmLocalOnly(project);
    }

    // deleteAll ticks what the project put ONLINE; the SC still sees it and can untick it.
    const items = cleanupItems(edsMetadata, data, behavior === 'deleteAll', shared);

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
    quickPick.title = `Delete "${getProjectDisplayName(project)}"`;
    quickPick.placeholder = 'Also delete these?';
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
            resolve(answerFrom((id) => selected.some(i => i.id === id)));
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
