import { Heading, Text, Flex, Button, ActionButton, DialogTrigger } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Info from '@spectrum-icons/workflow/Info';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import React from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ConfigurationSummary } from '@/features/project-creation/ui/components/ConfigurationSummary';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { Modal } from '@/core/ui/components/ui/Modal';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { WizardState, WizardStep } from '@/types/webview';
import { useMeshOperations } from '../hooks/useMeshOperations';

interface ApiMeshStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

export function ApiMeshStep({ state, updateState, onBack, setCanProceed, completedSteps = [] }: ApiMeshStepProps) {
    const {
        message,
        subMessage,
        helperText,
        isChecking,
        error,
        meshData,
        runCheck,
        createMesh,
        recreateMesh,
    } = useMeshOperations({ state, updateState, setCanProceed });

    return (
        <TwoColumnLayout
            leftContent={
                <>
                    <Heading level={2} marginBottom="size-300">API Mesh</Heading>
                    <Text marginBottom="size-400">
                        Verifying API Mesh API availability for your selected workspace.
                    </Text>

                    {/* Checking state */}
                    {isChecking && (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                            <LoadingDisplay
                                size="L"
                                message={message}
                                subMessage={subMessage}
                                helperText={helperText}
                            />
                        </Flex>
                    )}

                    {/* Error state - API not enabled */}
                    {!isChecking && error && (
                        <FadeTransition show={true}>
                            <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                                <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                    <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                    <Flex direction="column" gap="size-100" alignItems="center">
                                        <Text UNSAFE_className="text-xl font-medium">API Mesh API Not Enabled</Text>
                                        <Text UNSAFE_className="text-sm text-gray-600">{error}</Text>
                                    </Flex>

                                    {state.apiMesh?.setupInstructions && state.apiMesh.setupInstructions.length > 0 && (
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
                                                        actionButtons={[{
                                                            label: 'Open Workspace in Console',
                                                            variant: 'secondary',
                                                            onPress: () => {
                                                                webviewClient.postMessage('open-adobe-console', {
                                                                    orgId: state.adobeProject?.org_id,
                                                                    projectId: state.adobeProject?.id,
                                                                    workspaceId: state.adobeWorkspace?.id,
                                                                });
                                                            },
                                                        }]}
                                                        onClose={close}
                                                    >
                                                        <NumberedInstructions
                                                            description="Complete these steps to enable API Mesh for your workspace:"
                                                            instructions={state.apiMesh?.setupInstructions || []}
                                                        />
                                                    </Modal>
                                                )}
                                            </DialogTrigger>
                                        </Flex>
                                    )}

                                    <Flex gap="size-150" marginTop="size-300">
                                        <Button variant="accent" onPress={runCheck}>Retry</Button>
                                        <Button variant="secondary" onPress={onBack}>Back</Button>
                                    </Flex>
                                </Flex>
                            </Flex>
                        </FadeTransition>
                    )}

                    {/* Mesh exists */}
                    {!isChecking && !error && meshData && (
                        <FadeTransition show={true}>
                            <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                                <Flex direction="column" gap="size-200" alignItems="center">
                                    {meshData.status === 'error' ? (
                                        <>
                                            <AlertCircle size="L" UNSAFE_className="text-orange-600" />
                                            <Flex direction="column" gap="size-100" alignItems="center">
                                                <Text UNSAFE_className="text-xl font-medium">Mesh in Error State</Text>
                                                <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '500px' }}>
                                                    An API Mesh exists but is not functioning properly. Click "Recreate Mesh" below to delete and redeploy it.
                                                </Text>
                                            </Flex>
                                        </>
                                    ) : (
                                        <>
                                            <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                            <Flex direction="column" gap="size-100" alignItems="center">
                                                <Text UNSAFE_className="text-xl font-medium">
                                                    API Mesh {meshData.status === 'deployed' ? 'Deployed' : 'Found'}
                                                </Text>
                                                <Text UNSAFE_className="text-sm text-gray-600">
                                                    An existing mesh was detected. It will be updated during deployment.
                                                </Text>
                                            </Flex>
                                        </>
                                    )}

                                    {meshData.status === 'error' && (
                                        <Flex gap="size-150" marginTop="size-300">
                                            <Button variant="accent" onPress={recreateMesh}>Recreate Mesh</Button>
                                            <Button variant="secondary" onPress={onBack}>Back</Button>
                                        </Flex>
                                    )}
                                </Flex>
                            </Flex>
                        </FadeTransition>
                    )}

                    {/* API enabled, no mesh - ready to create */}
                    {!isChecking && !error && !meshData && (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                            <Flex direction="column" gap="size-200" alignItems="center">
                                <Info size="L" UNSAFE_className="text-blue-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">Ready for Mesh Creation</Text>
                                    <Text UNSAFE_className="text-sm text-gray-600" UNSAFE_style={{ textAlign: 'center', maxWidth: '450px' }}>
                                        API Mesh API is enabled. Click below to create a new mesh.
                                    </Text>
                                </Flex>
                                <Button variant="accent" marginTop="size-300" onPress={createMesh}>
                                    Create Mesh
                                </Button>
                            </Flex>
                        </Flex>
                    )}
                </>
            }
            rightContent={
                <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
            }
        />
    );
}
