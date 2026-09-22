/**
 * The two confirms a flagged card offers (`useFlaggedCardDialog`), on the
 * shared `ConfirmActionDialog`:
 *
 * - Reinstall in Commerce, after Commerce refused an upgrade in place.
 * - Remove anyway, after a removal stopped because a clean-up only the deployed
 *   code can do did not finish. It removes with `force`, leaving that behind.
 *
 * Split from `IntegrationsGrid` to keep the grid within its size limit.
 *
 * @module features/dashboard/ui/components/integrations/FlaggedCardDialogs
 */

import { Text } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import type { IntegrationCardModel } from './integrationCardModel';
import type { FlaggedCardDialog } from './useFlaggedCardDialog';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** Whether a card needs the reinstall. Module-level: the hook needs a stable reference. */
export const needsReinstall = (card: IntegrationCardModel): boolean => Boolean(card.installation?.needsReinstall);

/** Whether a card's last removal stopped. Module-level for the same reason. */
export const removalStopped = (card: IntegrationCardModel): boolean => Boolean(card.removalStopped);

/** Post `message` for the pending card, then close. */
function useConfirm(dialog: FlaggedCardDialog, send: (card: IntegrationCardModel) => void): () => void {
    const { pending, close } = dialog;
    return useCallback((): void => {
        if (pending) send(pending);
        close();
    }, [pending, close, send]);
}

const sendReinstall = (card: IntegrationCardModel): void =>
    webviewClient.postMessage('reinstallAppBuilderComponent', { id: card.id });

// By the component id, as the grid's own Remove posts it.
const sendRemoveAnyway = (card: IntegrationCardModel): void =>
    webviewClient.postMessage('removeAppBuilderComponent', { id: card.componentId ?? card.id, force: true });

/** Reinstall in Commerce, confirmed. */
function ReinstallDialog({ dialog }: { dialog: FlaggedCardDialog }): React.ReactElement {
    const confirm = useConfirm(dialog, sendReinstall);
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
function RemoveAnywayDialog({ dialog }: { dialog: FlaggedCardDialog }): React.ReactElement {
    const confirm = useConfirm(dialog, sendRemoveAnyway);
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
}: {
    reinstall: FlaggedCardDialog;
    removeAnyway: FlaggedCardDialog;
}): React.ReactElement {
    return (
        <>
            <ReinstallDialog dialog={reinstall} />
            <RemoveAnywayDialog dialog={removeAnyway} />
        </>
    );
}
