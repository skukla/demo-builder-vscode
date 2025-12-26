import { Heading, Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useEffect, useCallback } from 'react';
import { isProgressActive } from './projectCreationPredicates';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { PageFooter } from '@/core/ui/components/layout/PageFooter';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { MeshErrorDialog } from '@/features/mesh/ui/steps/components/MeshErrorDialog';
import { getCancelButtonText } from '../helpers/buttonTextHelpers';
import { WizardState } from '@/types/webview';

interface ProjectCreationStepProps {
    state: WizardState;
    onBack: () => void;
}

interface MeshCheckResult {
    success: boolean;
    apiEnabled: boolean;
    meshExists?: boolean;
    meshId?: string;
    endpoint?: string;
    error?: string;
    setupInstructions?: { step: string; details: string; important?: boolean }[];
}

type StepPhase = 'checking-mesh' | 'mesh-error' | 'creating' | 'completed' | 'failed' | 'cancelled';

export function ProjectCreationStep({ state, onBack }: ProjectCreationStepProps) {
    const progress = state.creationProgress;
    const [isCancelling, setIsCancelling] = useState(false);
    const [isOpeningProject, setIsOpeningProject] = useState(false);
    const [phase, setPhase] = useState<StepPhase>('checking-mesh');
    const [meshCheckResult, setMeshCheckResult] = useState<MeshCheckResult | null>(null);

    // Determine if mesh check is needed (only if commerce-mesh is selected)
    const needsMeshCheck = state.components?.dependencies?.includes('commerce-mesh') ?? false;

    /**
     * Check API Mesh access for the selected workspace
     */
    const checkMeshAccess = useCallback(async () => {
        if (!needsMeshCheck) {
            // No mesh needed, proceed directly to creation
            setPhase('creating');
            vscode.postMessage('start-project-creation');
            return;
        }

        setPhase('checking-mesh');
        setMeshCheckResult(null);

        try {
            const result = await webviewClient.request<MeshCheckResult>('check-api-mesh', {
                workspaceId: state.adobeWorkspace?.id,
                selectedComponents: [
                    state.components?.frontend,
                    state.components?.backend,
                    ...(state.components?.dependencies || []),
                ].filter(Boolean),
            });

            if (result.success && result.apiEnabled) {
                // API Mesh is enabled, proceed with creation
                setPhase('creating');
                vscode.postMessage('start-project-creation');
            } else {
                // API Mesh not enabled, show error
                setMeshCheckResult(result);
                setPhase('mesh-error');
            }
        } catch (error) {
            setMeshCheckResult({
                success: false,
                apiEnabled: false,
                error: error instanceof Error ? error.message : 'Failed to check API Mesh access',
            });
            setPhase('mesh-error');
        }
    }, [needsMeshCheck, state.adobeWorkspace?.id, state.components]);

    // Run mesh check on mount
    useEffect(() => {
        checkMeshAccess();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update phase based on progress
    useEffect(() => {
        if (!progress) return;

        if (progress.currentOperation === 'Cancelled') {
            setPhase('cancelled');
        } else if (progress.currentOperation === 'Failed' || progress.error) {
            setPhase('failed');
        } else if (progress.currentOperation === 'Project Created') {
            setPhase('completed');
        } else if (phase === 'creating') {
            // Stay in creating phase while progress is active
        }
    }, [progress, phase]);

    const handleCancel = () => {
        setIsCancelling(true);
        vscode.postMessage('cancel-project-creation');
    };

    const handleOpenProject = () => {
        setIsOpeningProject(true);

        // Show transition message, then trigger reload
        setTimeout(() => {
            vscode.postMessage('openProject');
        }, TIMEOUTS.PROJECT_OPEN_TRANSITION);
    };

    const handleShowLogs = () => {
        vscode.postMessage('show-logs');
    };

    const handleOpenConsole = useCallback(() => {
        webviewClient.postMessage('open-adobe-console', {
            orgId: state.adobeProject?.org_id,
            projectId: state.adobeProject?.id,
            workspaceId: state.adobeWorkspace?.id,
        });
    }, [state.adobeProject?.org_id, state.adobeProject?.id, state.adobeWorkspace?.id]);

    const handleRetryMeshCheck = useCallback(() => {
        checkMeshAccess();
    }, [checkMeshAccess]);

    const isCancelled = phase === 'cancelled';
    const isFailed = phase === 'failed';
    const isCompleted = phase === 'completed';
    const isActive = phase === 'creating' && isProgressActive(progress, isCancelled, isFailed, isCompleted);
    const isCheckingMesh = phase === 'checking-mesh';
    const isMeshError = phase === 'mesh-error';

    return (
        <div className="flex-column h-full w-full">
            {/* Main content area */}
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
                    <Heading level={2} marginBottom="size-300">
                        Creating Your Demo Project
                    </Heading>
                    <Text marginBottom="size-400">
                        Setting up your project with all selected components and configurations.
                    </Text>

                    {/* Checking API Mesh access */}
                    {isCheckingMesh && (
                        <CenteredFeedbackContainer>
                            <LoadingDisplay
                                size="L"
                                message="Checking API Mesh Access"
                                subMessage="Verifying workspace configuration..."
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {/* API Mesh not enabled - show error dialog */}
                    {isMeshError && meshCheckResult && (
                        <MeshErrorDialog
                            error={meshCheckResult.error || 'API Mesh API is not enabled for this workspace.'}
                            setupInstructions={meshCheckResult.setupInstructions}
                            onRetry={handleRetryMeshCheck}
                            onBack={onBack}
                            onOpenConsole={handleOpenConsole}
                        />
                    )}

                    {/* Active creation state */}
                    {isActive && progress && (
                        <CenteredFeedbackContainer>
                            <LoadingDisplay
                                size="L"
                                message={progress.currentOperation || 'Processing'}
                                subMessage={progress.message}
                                helperText="This could take up to 3 minutes"
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {/* Success state or opening transition */}
                    {isCompleted && !progress?.error && (
                        <>
                            {isOpeningProject ? (
                                <CenteredFeedbackContainer>
                                    <LoadingDisplay
                                        size="L"
                                        message="Loading your projects..."
                                    />
                                </CenteredFeedbackContainer>
                            ) : (
                                <CenteredFeedbackContainer>
                                    <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                        <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                        <Flex direction="column" gap="size-100" alignItems="center">
                                            <Text UNSAFE_className="text-xl font-medium">
                                                Project Created Successfully
                                            </Text>
                                            <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                                Click below to view your projects
                                            </Text>
                                        </Flex>
                                    </Flex>
                                </CenteredFeedbackContainer>
                            )}
                        </>
                    )}

                    {/* Error state */}
                    {(progress?.error || isCancelled || isFailed) && phase !== 'mesh-error' && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        {isCancelled ? 'Project Creation Cancelled' : 'Project Creation Failed'}
                                    </Text>
                                    {progress?.error && (
                                        <Text UNSAFE_className="text-sm text-gray-600">{progress.error}</Text>
                                    )}
                                </Flex>

                                {/* Buttons centered with error content */}
                                <Flex gap="size-150" marginTop="size-300">
                                    <Button variant="secondary" onPress={onBack}>Back</Button>
                                </Flex>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}

                    {/* Initial loading state (before progress updates arrive) - only when creating */}
                    {phase === 'creating' && !progress && (
                        <CenteredFeedbackContainer>
                            <LoadingDisplay
                                size="L"
                                message="Initializing"
                                subMessage="Preparing to create your project..."
                            />
                        </CenteredFeedbackContainer>
                    )}
                </SingleColumnLayout>
            </div>

            {/* Footer - uses PageFooter for consistency with WizardContainer */}

            {/* Show Cancel during checking or active creation */}
            {(isCheckingMesh || isActive) && (
                <PageFooter
                    leftContent={
                        <Button
                            variant="secondary"
                            onPress={isCheckingMesh ? onBack : handleCancel}
                            isQuiet
                            isDisabled={isCancelling}
                        >
                            {getCancelButtonText(isCheckingMesh, isCancelling)}
                        </Button>
                    }
                    centerContent={
                        !isCheckingMesh && (
                            <Button
                                variant="secondary"
                                onPress={handleShowLogs}
                                isQuiet
                            >
                                Logs
                            </Button>
                        )
                    }
                    constrainWidth={true}
                />
            )}

            {/* Show View Projects button on success, empty footer during loading transition */}
            {isCompleted && !progress?.error && (
                <PageFooter
                    centerContent={
                        !isOpeningProject && (
                            <Button
                                variant="secondary"
                                onPress={handleShowLogs}
                                isQuiet
                            >
                                Logs
                            </Button>
                        )
                    }
                    rightContent={
                        !isOpeningProject && (
                            <Button
                                variant="cta"
                                onPress={handleOpenProject}
                            >
                                View Projects
                            </Button>
                        )
                    }
                    constrainWidth={true}
                />
            )}
        </div>
    );
}
