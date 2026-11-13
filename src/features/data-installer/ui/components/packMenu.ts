/**
 * What the flyout's actions SAY, apart from drawing them: the More menu's rows, what each confirm
 * dialog asks, and the main button's label. Pure; `PackActions` draws them.
 *
 * @module features/data-installer/ui/components/packMenu
 */

import { FIX_WITH_AI, INSTALL, RESTORE } from '../../datapackWords';
import { SHARE_CONSENT } from '../../shareWording';
import type { DatapackDetail } from '../../types';
import { RETRIES_BEFORE_FIX } from './importResult';
import type { ConfirmActionDialogProps } from '@/core/ui/components/ui/ConfirmActionDialog';

/** One menu row: its icon and label. */
export interface PackMenuRow {
    key: string;
    label: string;
    icon: string;
}

/** The menu's upper section: what any pack offers, then what the SC's own library pack adds. */
export function packRows(detail: DatapackDetail, undoable: boolean): PackMenuRow[] {
    const rows: PackMenuRow[] = [{ key: 'save-file', label: 'Save as File', icon: 'saveFile' }];
    if (undoable) rows.push({ key: 'undo', label: 'Undo Last Save', icon: 'reset' });
    if (detail.store === 'library' && detail.mine) {
        rows.push({ key: 'share', label: detail.shared ? 'Stop Sharing' : 'Share', icon: 'share' });
    }
    return rows;
}

/**
 * Whether the flyout offers Delete: on the SC's own library datapack, never on a Demo Builder one,
 * its owner's included (overview Phase 7). Agents can still delete one (P4-Q8).
 */
export function deletable(detail: DatapackDetail): boolean {
    return detail.store === 'library' && detail.mine === true && detail.team !== true;
}

/**
 * The menu's lower section: what takes the demo's data out of its store, then what leaves the
 * library. Bare verbs (J8-3, owner 2026-11-12): the datapack is the menu's subject.
 */
export function removeRows(removesData: boolean, deletes: boolean): PackMenuRow[] {
    return [
        // Uninstall, the pair of Install (owner, 2026-11-09, walk F120): "Remove Data" read as all data.
        ...(removesData ? [{ key: 'remove-data', label: 'Uninstall', icon: 'delete' }] : []),
        // Delete, not Remove (owner, 2026-11-09, walk F118): it leaves the library for good, where
        // Uninstall takes a demo's data out of its store and an install puts it back.
        ...(deletes ? [{ key: 'remove', label: 'Delete', icon: 'delete' }] : []),
    ];
}

/** The dialog open over the flyout, if any. */
export type Asking = 'undo' | 'share' | 'remove' | null;

export type ConfirmCopy = Pick<ConfirmActionDialogProps, 'title' | 'actionLabel' | 'actionVariant' | 'children'>;

/** What a dialog asks. The title of a closed one is never drawn. */
export function confirmCopy(asking: Asking, detail: DatapackDetail, sharedInFile?: string): ConfirmCopy {
    const name = detail.displayName;
    if (asking === 'undo') {
        // Blue: red is for deleting and removing only (rule 20; owner, 2026-11-12: "Too strong.").
        return {
            title: 'Undo Last Save?',
            actionLabel: 'Undo',
            actionVariant: 'accent',
            children: `Commerce goes back to ${name} as it was before your last save. Anything you changed since is lost.`,
        };
    }
    if (asking === 'share' && !detail.shared) {
        return { title: `Share ${name}?`, actionLabel: 'Share', actionVariant: 'accent', children: SHARE_CONSENT };
    }
    if (asking === 'share') {
        return {
            title: `Stop Sharing ${name}?`,
            actionLabel: 'Stop Sharing',
            actionVariant: 'accent',
            children: 'Other people can no longer see or install it.',
        };
    }
    // "Permanently" is the warning, as a word in the sentence (dialog design rules; review 2026-11-10).
    // The SC never sees a version (overview Phase 7). Red: deleting is what red is for (rule 20).
    return {
        title: `Delete ${name}?`,
        actionLabel: 'Delete',
        actionVariant: 'negative',
        children: ['Permanently deletes it.', sharedInFile],
    };
}

/**
 * The main button's label: Restore on the demo's installed version (J4-2), Switch to over another
 * recorded datapack (J8-1, owner 2026-11-12), else Install.
 */
export function mainButtonLabel(detail: DatapackDetail, restores: boolean, switches = false): string {
    if (restores) return `${RESTORE} ${detail.displayName}`;
    return switches ? `Switch to ${detail.displayName}` : INSTALL;
}

/**
 * The main button on a failed install of the demo's datapack (step-04 S8): Retry, then Fix with AI
 * once retries have not helped, as the job window decides (`RETRIES_BEFORE_FIX`, J6-3).
 *
 * @param retries - installs of it tried since, all failed
 */
export function failedButtonLabel(retries: number): string {
    return retries < RETRIES_BEFORE_FIX ? 'Retry' : FIX_WITH_AI;
}
