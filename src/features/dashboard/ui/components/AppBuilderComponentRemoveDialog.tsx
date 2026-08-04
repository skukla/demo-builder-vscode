/**
 * AppBuilderComponentRemoveDialog Component (D2 Track B — Step 06)
 *
 * The confirmation guard in front of `removeAppBuilderComponent` — a DESTRUCTIVE cloud
 * undeploy (D1's best-effort teardown + cleanup). The slice-1 card's Remove
 * fired straight away; this dialog adds the missing confirm so a cloud
 * teardown is never one stray click away (research B-6).
 *
 * Controlled + presentational: the
 * DialogContainer is the always-mounted modal host; the confirm Modal renders
 * only while `isOpen`. It does NOT post — its consumer (the integrations grid,
 * which hosts ONE instance) wires `onConfirm` to post
 * `removeAppBuilderComponent {id}`, so the cancel path is a pure no-op (no
 * teardown).
 *
 * @module features/dashboard/ui/components/AppBuilderComponentRemoveDialog
 */

import { DialogContainer, Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface AppBuilderComponentRemoveDialogProps {
    /** Whether the confirm dialog is shown. */
    isOpen: boolean;
    /** The appBuilderComponent id being torn down (named in the warning). */
    appBuilderComponentId: string;
    /**
     * One extra consequence sentence, when the component's teardown reaches past
     * itself. The mesh is the case that needs it: removing it also strips
     * MESH_ENDPOINT from the storefront config.
     */
    consequence?: string;
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
export function AppBuilderComponentRemoveDialog({
    isOpen,
    appBuilderComponentId,
    consequence,
    onConfirm,
    onClose,
}: AppBuilderComponentRemoveDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    title="Remove App Builder component"
                    size="S"
                    onClose={onClose}
                    actionButtons={[
                        { label: 'Remove', variant: 'negative', onPress: onConfirm },
                    ]}
                >
                    <Flex direction="column" gap="size-150">
                        <Text>
                            Remove <strong>{appBuilderComponentId}</strong>? This permanently undeploys it
                            from the cloud (a destructive teardown) and cannot be undone.
                        </Text>
                        {consequence && <Text>{consequence}</Text>}
                    </Flex>
                </Modal>
            )}
        </DialogContainer>
    );
}
