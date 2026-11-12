/**
 * The windows J8's header and flyout open. Each is an earlier journey's, unchanged, or the product's
 * own dialog with the product's words: J2's install window (Install, Install from File), J3's save,
 * create and undo windows, J4's Restore, J5's Uninstall, and
 * `ConfirmActionDialog` for Share and Delete as `PackActions.tsx` words them, with no version in the
 * Delete line (Phase 7: the SC never sees a version).
 */

import React from 'react';
import { InstallWindow, setupFor } from './j2-windows';
import { J3Window, type J3Job } from './j3-windows';
import { RestoreWindow } from './j4-windows';
import { UninstallWindow } from './j5-windows';
import type { DemoUses, PackName } from './scenarioInstall';
import { ConfirmActionDialog } from '@/core/ui/components/ui/ConfirmActionDialog';
import { SHARE_CONSENT } from '@/features/data-installer/shareWording';

/** What J8 has open: an install of a datapack, an earlier journey's job, or one of the flyout's dialogs. */
export type J8Open =
    | { kind: 'install'; pack: PackName }
    | { kind: 'j3'; job: J3Job }
    | { kind: 'restore'; pack: PackName }
    | { kind: 'uninstall'; pack: PackName }
    | { kind: 'share'; pack: PackName }
    | { kind: 'delete'; pack: PackName };

/** My Luma's saves, newest first, as the engine names them; the first is the one this demo uses. */

export interface J8WindowProps {
    open: J8Open;
    demo: DemoUses;
    onDemo: (demo: DemoUses) => void;
    onClose: () => void;
}

/** The one window J8 has open. */
export function J8Window({ open, demo, onDemo, onClose }: J8WindowProps): React.ReactElement {
    if (open.kind === 'install') {
        return <InstallWindow setup={setupFor(open.pack, demo, window.__J1__.commerce())} onClose={onClose} onInstalled={onDemo} />;
    }
    if (open.kind === 'j3') return <J3Window job={open.job} onClose={onClose} onDone={() => undefined} />;
    if (open.kind === 'restore') return <RestoreWindow pack={open.pack} start="check" commerce={window.__J1__.restore()} onClose={onClose} onSettled={() => undefined} />;
    if (open.kind === 'uninstall') {
        return <UninstallWindow pack={open.pack} start="check" commerce={window.__J1__.commerce()} ending={window.__J1__.uninstallEnds()} onClose={onClose} onUninstalled={() => onDemo('none')} />;
    }
    if (open.kind === 'share') {
        return <ConfirmActionDialog isOpen title={`Share ${open.pack}?`} actionLabel="Share" actionVariant="accent" onConfirm={onClose} onClose={onClose}>{SHARE_CONSENT}</ConfirmActionDialog>;
    }
    return (
        <ConfirmActionDialog isOpen title={`Delete ${open.pack}?`} actionLabel="Delete" actionVariant="negative" onConfirm={onClose} onClose={onClose}>
            Permanently deletes it.
        </ConfirmActionDialog>
    );
}

