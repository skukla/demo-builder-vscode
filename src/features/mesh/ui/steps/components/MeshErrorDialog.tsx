import React from 'react';
import { Flex, Text, DialogTrigger, ActionButton } from '@adobe/react-spectrum';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { ErrorCode } from '@/types/errorCodes';

interface SetupInstruction {
    step: string;
    details: string;
    important?: boolean;
}

interface MeshErrorDialogProps {
    error: string;
    /** Typed error code for programmatic error handling */
    code?: ErrorCode;
    setupInstructions?: SetupInstruction[];
    onRetry: () => void;
    onBack: () => void;
    onOpenConsole: () => void;
}

export function MeshErrorDialog({ error, code, setupInstructions = [], onRetry, onBack, onOpenConsole }: MeshErrorDialogProps) {
    return (
        <StatusDisplay
            variant="error"
            title="API Mesh API Not Enabled"
            message={error}
            actions={[
                { label: 'Retry', variant: 'accent', onPress: onRetry },
                { label: 'Back', variant: 'secondary', onPress: onBack },
            ]}
        >
            {/* Setup Instructions Modal */}
            {setupInstructions && setupInstructions.length > 0 && (
                <Flex direction="column" gap="size-100" marginTop="size-200" alignItems="center">
                    <Text UNSAFE_className="text-sm text-gray-600">
                        Follow the setup guide to enable API Mesh for this workspace.
                    </Text>
                    <DialogTrigger type="modal">
                        <ActionButton isQuiet>
                            <InfoOutline />
                            <Text>View Setup Instructions</Text>
                        </ActionButton>
                        {(close) => (
                            <Modal
                                title="API Mesh Setup Guide"
                                actionButtons={[
                                    {
                                        label: 'Open Workspace in Console',
                                        variant: 'secondary',
                                        onPress: onOpenConsole,
                                    },
                                ]}
                                onClose={close}
                            >
                                <NumberedInstructions
                                    description="Complete these steps to enable API Mesh for your workspace:"
                                    instructions={setupInstructions}
                                />
                            </Modal>
                        )}
                    </DialogTrigger>
                </Flex>
            )}
        </StatusDisplay>
    );
}
