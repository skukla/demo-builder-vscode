/**
 * The two confirms a flagged card offers (`useFlaggedCardDialog`), on the
 * shared `ConfirmActionDialog`:
 *
 * - Reinstall in Commerce, after Commerce refused an upgrade in place.
 * - Remove anyway, after a removal stopped because a clean-up only the deployed
 *   code can do did not finish. It removes with `force`, leaving that behind.
 *
 * Neither posts. A confirmed action goes to the screen's operation runner (`onRun`),
 * so it narrates in the progress modal like every other card action. Posting from
 * here meant both ran in a notification instead (owner, 2026-10-09).
 *
 * Split from `IntegrationsGrid` to keep the grid within its size limit.
 *
 * @module features/dashboard/ui/components/integrations/FlaggedCardDialogs
 */

import React, { useCallback } from 'react';
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import type { FlaggedCardDialog } from './useFlaggedCardDialog';

/** Start a confirmed action on the screen's runner: the id it runs on, the card's name, the action. */
export type RunFlaggedAction = (id: string, name: string, action: CardAction) => void;

/** Whether a card needs the reinstall. Module-level: the hook needs a stable reference. */
export const needsReinstall = (card: IntegrationCardModel): boolean => Boolean(card.installation?.needsReinstall);

/** Whether a card's last removal stopped. Module-level for the same reason. */
export const removalStopped = (card: IntegrationCardModel): boolean => Boolean(card.removalStopped);

/** Run `action` on the pending card, then close. The removal goes by the component id, as the grid's own Remove does. */
function useConfirm(dialog: FlaggedCardDialog, action: CardAction, onRun: RunFlaggedAction): () => void {
    const { pending, close } = dialog;
    return useCallback((): void => {
        if (pending) {
            const id = action === 'remove-anyway' ? (pending.componentId ?? pending.id) : pending.id;
            onRun(id, pending.name, action);
        }
        close();
    }, [pending, close, action, onRun]);
}

/** What every reinstall does, ending the dialog's one sentence. */
const REINSTALL_TAIL =
    'That sets up its webhooks and event subscriptions again and may reset its saved settings to their defaults.';

/** Reinstall in Commerce, confirmed. */
function ReinstallDialog({ dialog, onRun }: { dialog: FlaggedCardDialog; onRun: RunFlaggedAction }): React.ReactElement {
    const confirm = useConfirm(dialog, 'reinstall', onRun);
    const name = dialog.pending?.name;
    return (
        <ConfirmActionDialog
            isOpen={dialog.pending !== null}
            title={`Reinstall ${name} in Commerce?`}
            actionLabel="Reinstall"
            actionVariant="negative"
            onConfirm={confirm}
            onClose={dialog.close}
        >
            {dialog.pending?.installation?.needsReinstall ? (
                <>
                    Commerce would not upgrade <strong>{name}</strong> in place, so this removes it
                    from Commerce and installs the version already deployed. {REINSTALL_TAIL}
                </>
            ) : (
                <>
                    For when Commerce has lost what the app set up and the app still says it is
                    installed. Removes <strong>{name}</strong> from Commerce and installs the version
                    already deployed. {REINSTALL_TAIL}
                </>
            )}
        </ConfirmActionDialog>
    );
}

/**
 * Remove anyway, confirmed. The reason is the one the removal recorded, in the extension's words
 * (the card shows it too, and the agent reads it), so it stays a sentence of its own.
 */
function RemoveAnywayDialog({ dialog, onRun }: { dialog: FlaggedCardDialog; onRun: RunFlaggedAction }): React.ReactElement {
    const confirm = useConfirm(dialog, 'remove-anyway', onRun);
    const name = dialog.pending?.name;
    return (
        <ConfirmActionDialog
            isOpen={dialog.pending !== null}
            title={`Remove ${name} anyway?`}
            actionLabel="Remove anyway"
            actionVariant="negative"
            onConfirm={confirm}
            onClose={dialog.close}
        >
            {dialog.pending?.removalStopped} Removing <strong>{name}</strong> anyway undeploys it now
            and leaves that behind.
        </ConfirmActionDialog>
    );
}

/** Both flagged-card confirms, each driven by its own `useFlaggedCardDialog`. */
export function FlaggedCardDialogs({
    reinstall,
    removeAnyway,
    onRun,
}: {
    reinstall: FlaggedCardDialog;
    removeAnyway: FlaggedCardDialog;
    /** The screen's operation runner, so a confirmed action opens the progress modal. */
    onRun: RunFlaggedAction;
}): React.ReactElement {
    return (
        <>
            <ReinstallDialog dialog={reinstall} onRun={onRun} />
            <RemoveAnywayDialog dialog={removeAnyway} onRun={onRun} />
        </>
    );
}
