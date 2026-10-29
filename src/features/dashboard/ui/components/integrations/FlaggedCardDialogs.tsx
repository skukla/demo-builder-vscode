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

import { Text } from '@adobe/react-spectrum';
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

/** Reinstall in Commerce, confirmed. */
function ReinstallDialog({ dialog, onRun }: { dialog: FlaggedCardDialog; onRun: RunFlaggedAction }): React.ReactElement {
    const confirm = useConfirm(dialog, 'reinstall', onRun);
    return (
        <ConfirmActionDialog
            isOpen={dialog.pending !== null}
            title="Reinstall in Commerce"
            actionLabel="Reinstall"
            onConfirm={confirm}
            onClose={dialog.close}
        >
            <Text>
                {dialog.pending?.installation?.needsReinstall ? (
                    <>
                        Commerce would not upgrade <strong>{dialog.pending?.name}</strong> in place.
                        Reinstalling removes it from Commerce, then installs the version already deployed.
                    </>
                ) : (
                    <>
                        Reinstalling removes <strong>{dialog.pending?.name}</strong> from Commerce, then
                        installs the version already deployed. Use it when Commerce has lost what the app
                        set up and the app still says it is installed.
                    </>
                )}
            </Text>
            <Text>
                Its webhooks and event subscriptions are set up again. Its saved settings may be reset to
                their defaults.
            </Text>
        </ConfirmActionDialog>
    );
}

/** Remove anyway, confirmed; the reason is the one the removal recorded. */
function RemoveAnywayDialog({ dialog, onRun }: { dialog: FlaggedCardDialog; onRun: RunFlaggedAction }): React.ReactElement {
    const confirm = useConfirm(dialog, 'remove-anyway', onRun);
    return (
        <ConfirmActionDialog
            isOpen={dialog.pending !== null}
            title="Removal stopped"
            actionLabel="Remove anyway"
            onConfirm={confirm}
            onClose={dialog.close}
        >
            <Text>{dialog.pending?.removalStopped}</Text>
            <Text>
                Removing <strong>{dialog.pending?.name}</strong> anyway undeploys it now and leaves that
                behind. Close this to keep it and try Remove again later.
            </Text>
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
