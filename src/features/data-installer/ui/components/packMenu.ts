/**
 * What the flyout's actions SAY, apart from drawing them: the More menu's rows, what each confirm
 * dialog asks, and the main button's label. Pure; `PackActions` draws them.
 *
 * @module features/data-installer/ui/components/packMenu
 */

import { INSTALL, RESTORE } from '../../datapackWords';
import { isSavedVersion } from '../../packVersions';
import { SHARE_CONSENT } from '../../shareWording';
import type { DatapackDetail } from '../../types';
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

/** The menu's lower section: what takes the demo's data out of its store, then what leaves the library. */
export function removeRows(ownPack: boolean, ownLayer: boolean, removesData: boolean): PackMenuRow[] {
    return [
        // Uninstall, the pair of Install (owner, 2026-11-09, walk F120): "Remove Data" read as all data.
        ...(removesData ? [{ key: 'remove-data', label: 'Uninstall', icon: 'delete' }] : []),
        // Delete, not Remove (owner, 2026-11-09, walk F118): it leaves the library for good, where
        // Uninstall takes a demo's data out of its store and an import puts it back.
        ...(ownPack ? [{ key: 'remove', label: 'Delete Datapack', icon: 'delete' }] : []),
        ...(ownLayer ? [{ key: 'remove-settings', label: 'Delete Store Configuration', icon: 'delete' }] : []),
    ];
}

/** The dialog open over the flyout, if any. */
export type Asking = 'undo' | 'share' | 'remove' | 'remove-settings' | null;

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
    if (asking === 'remove-settings') {
        return {
            title: `Delete ${name}'s Store Configuration?`,
            actionLabel: 'Delete',
            actionVariant: 'negative',
            // The house form for a warning: a word in the main sentence (dialog design rules).
            children: 'Permanently deletes the store configuration saved with it.',
        };
    }
    // A pack of saves goes whole, every save with it (owner, 2026-11-09).
    const what = isSavedVersion(detail.id.version) ? 'it' : `version ${detail.id.version}`;
    // "Permanently" is the warning, as a word in the sentence (dialog design rules; review 2026-11-10).
    return {
        title: `Delete ${name}?`,
        actionLabel: 'Delete',
        actionVariant: 'negative',
        children: [`Permanently deletes ${what}.`, sharedInFile],
    };
}

/** The main button's label: Restore on the demo's installed version (J4-2), else Install. */
export function mainButtonLabel(detail: DatapackDetail, restores: boolean): string {
    return restores ? `${RESTORE} ${detail.displayName}` : INSTALL;
}
