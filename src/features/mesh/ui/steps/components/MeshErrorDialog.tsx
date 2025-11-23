import React from 'react';
import { Flex, Text, Button, DialogTrigger, ActionButton } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';
import { Modal } from '@/core/ui/components/ui/Modal';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';

interface SetupInstruction {
    step: string;
    details: string;
    important?: boolean;
}

interface MeshErrorDialogProps {
    error: string;
    setupInstructions?: SetupInstruction[];
    onRetry: () => void;
    onBack: () => void;
    onOpenConsole: () => void;
}

export function MeshErrorDialog({ error, setupInstructions = [], onRetry, onBack, onOpenConsole }: MeshErrorDialogProps) {
    return (
        <FadeTransition show={true}>
            <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                    <AlertCircle size="L" UNSAFE_className="text-red-600" />
                    <Flex direction="column" gap="size-100" alignItems="center">
                        <Text UNSAFE_className="text-xl font-medium">API Mesh API Not Enabled</Text>
                        <Text UNSAFE_className="text-sm text-gray-600">{error}</Text>
                    </Flex>

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

                    <Flex gap="size-150" marginTop="size-300">
                        <Button variant="accent" onPress={onRetry}>Retry</Button>
                        <Button variant="secondary" onPress={onBack}>Back</Button>
                    </Flex>
                </Flex>
            </Flex>
        </FadeTransition>
    );
}
