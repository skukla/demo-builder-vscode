/**
 * DeployableRemoveDialog Component (D2 Track B — Step 06)
 *
 * The confirmation guard in front of `removeDeployable` — a DESTRUCTIVE cloud
 * undeploy (D1's best-effort teardown + cleanup). The slice-1 AppBuilderCard
 * Remove fired straight away; this dialog adds the missing confirm so a cloud
 * teardown is never one stray click away (research B-6).
 *
 * Controlled + presentational, mirroring {@link DashboardRenameDialog}: the
 * DialogContainer is the always-mounted modal host; the confirm Modal renders
 * only while `isOpen`. It does NOT post — its consumer ({@link DeployablesList})
 * wires `onConfirm` to post `removeDeployable {id}`, so the cancel path is a
 * pure no-op (no teardown).
 *
 * @module features/dashboard/ui/components/DeployableRemoveDialog
 */

import { DialogContainer, Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface DeployableRemoveDialogProps {
    /** Whether the confirm dialog is shown. */
    isOpen: boolean;
    /** The deployable id being torn down (named in the warning). */
    deployableId: string;
    /** Called when the user confirms the destructive remove. */
    onConfirm: () => void;
    /** Called when the dialog is cancelled or dismissed (no teardown). */
    onClose: () => void;
}

/**
 * Hosts the destructive remove-confirm in a DialogContainer; presents it when
 * open. The negative-styled "Remove" action calls `onConfirm`; Close (and the
 * escape/click-outside path via `onDismiss`) calls `onClose` without tearing
 * anything down.
 */
export function DeployableRemoveDialog({
    isOpen,
    deployableId,
    onConfirm,
    onClose,
}: DeployableRemoveDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title="Remove deployable"
                    size="S"
                    onClose={onClose}
                    actionButtons={[
                        { label: 'Remove', variant: 'negative', onPress: onConfirm },
                    ]}
                >
                    <Flex direction="column" gap="size-150">
                        <Text>
                            Remove <strong>{deployableId}</strong>? This permanently undeploys it
                            from the cloud (a destructive teardown) and cannot be undone.
                        </Text>
                    </Flex>
                </Modal>
            )}
        </DialogContainer>
    );
}
