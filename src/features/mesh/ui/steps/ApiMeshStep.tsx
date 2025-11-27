import { Heading, Text, Flex, Button } from '@adobe/react-spectrum';
import Info from '@spectrum-icons/workflow/Info';
import React, { useCallback } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ConfigurationSummary } from '@/features/project-creation/ui/components/ConfigurationSummary';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { WizardStep } from '@/types/webview';
import { BaseStepProps } from '@/types/wizard';
import { useMeshOperations } from '../hooks/useMeshOperations';
import { MeshErrorDialog } from './components/MeshErrorDialog';
import { MeshStatusDisplay } from './components/MeshStatusDisplay';

interface ApiMeshStepProps extends BaseStepProps {
    onBack: () => void;
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

    const handleOpenConsole = useCallback(() => {
        webviewClient.postMessage('open-adobe-console', {
            orgId: state.adobeProject?.org_id,
            projectId: state.adobeProject?.id,
            workspaceId: state.adobeWorkspace?.id,
        });
    }, [state.adobeProject?.org_id, state.adobeProject?.id, state.adobeWorkspace?.id]);

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
                        <MeshErrorDialog
                            error={error}
                            setupInstructions={state.apiMesh?.setupInstructions}
                            onRetry={runCheck}
                            onBack={onBack}
                            onOpenConsole={handleOpenConsole}
                        />
                    )}

                    {/* Mesh exists */}
                    {!isChecking && !error && meshData && (
                        <MeshStatusDisplay
                            meshData={meshData}
                            onRecreateMesh={recreateMesh}
                            onBack={onBack}
                        />
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
