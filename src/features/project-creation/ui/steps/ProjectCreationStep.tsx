import { Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { isProgressActive } from './projectCreationPredicates';
import { COMPONENT_IDS } from '@/core/constants';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { PageFooter } from '@/core/ui/components/layout/PageFooter';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { MeshErrorDialog } from '@/features/mesh/ui/steps/components/MeshErrorDialog';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components';
import { getCancelButtonText } from '../helpers/buttonTextHelpers';
import { WizardState } from '@/types/webview';
import { buildProjectConfig } from '../wizard/wizardHelpers';

interface ProjectCreationStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onBack: () => void;
    importedSettings?: unknown;
    packages?: unknown;
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

type StepPhase = 'checking-mesh' | 'mesh-error' | 'github-app-install' | 'creating' | 'completed' | 'failed' | 'cancelled';

interface GitHubAppInstallData {
    owner: string;
    repo: string;
    installUrl: string;
    message: string;
}

export function ProjectCreationStep({ state, updateState, onBack, importedSettings, packages }: ProjectCreationStepProps) {
    const progress = state.creationProgress;
    const [isCancelling, setIsCancelling] = useState(false);
    const [isOpeningProject, setIsOpeningProject] = useState(false);
    const [phase, setPhase] = useState<StepPhase>('checking-mesh');
    const [meshCheckResult, setMeshCheckResult] = useState<MeshCheckResult | null>(null);
    const [githubAppInstallData, setGitHubAppInstallData] = useState<GitHubAppInstallData | null>(null);

    // Debug: Track component instance for diagnosing retry/remount issues
    const instanceId = useMemo(() => `PCS-${Date.now().toString(36)}`, []);

    // Debug: Track mount/unmount lifecycle
    useEffect(() => {
        console.log(`[ProjectCreationStep:${instanceId}] MOUNTED`, {
            selectedStack: state.selectedStack,
            hasEdsConfig: !!state.edsConfig,
            repoMode: state.edsConfig?.repoMode,
            timestamp: new Date().toISOString(),
        });
        return () => {
            console.log(`[ProjectCreationStep:${instanceId}] UNMOUNTED`, {
                timestamp: new Date().toISOString(),
            });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Determine if checks are needed
    const needsMeshCheck = state.components?.dependencies?.includes(COMPONENT_IDS.COMMERCE_MESH) ?? false;
    const needsGitHubAppCheck = useMemo(() => {
        const stackId = state.selectedStack;
        if (!stackId) return false;
        // Check if this is an EDS stack
        return stackId.includes('eds');
    }, [state.selectedStack]);

    /**
     * Check GitHub App installation for EDS projects
     */
    const checkGitHubApp = useCallback(async () => {
        if (!needsGitHubAppCheck || !state.edsConfig) {
            console.log('[GitHub App Check] Skipped:', { needsGitHubAppCheck, hasEdsConfig: !!state.edsConfig });
            return true; // Not needed or no config, proceed
        }

        // Get authenticated GitHub user (owner)
        const authenticatedUser = state.edsConfig.githubAuth?.user?.login;
        
        // Extract owner and repo from available sources
        let owner: string | undefined;
        let repo: string | undefined;
        
        // If using existing repo, extract owner and repo from "owner/repo" format
        if (state.edsConfig.existingRepo && state.edsConfig.existingRepo.includes('/')) {
            const [existingOwner, existingRepo] = state.edsConfig.existingRepo.split('/');
            owner = existingOwner;
            repo = existingRepo;
        } 
        // If using selected repo from list, use its properties
        else if (state.edsConfig.selectedRepo) {
            owner = state.edsConfig.selectedRepo.owner;
            repo = state.edsConfig.selectedRepo.name;
        }
        // If creating new repo, use authenticated user as owner
        else if (state.edsConfig.repoName && authenticatedUser) {
            owner = authenticatedUser;
            repo = state.edsConfig.repoName;
        }

        console.log('[GitHub App Check] Resolved:', {
            owner,
            repo,
            authenticatedUser,
            repoMode: state.edsConfig.repoMode,
            repoName: state.edsConfig.repoName,
            selectedRepo: state.edsConfig.selectedRepo,
            existingRepo: state.edsConfig.existingRepo,
        });

        if (!owner || !repo) {
            console.log('[GitHub App Check] Missing owner or repo, skipping check');
            return true; // Can't check without owner/repo, let it proceed and fail later if needed
        }

        try {
            const result = await webviewClient.request<{
                success: boolean;
                isInstalled: boolean;
                installUrl?: string;
                error?: string;
            }>('check-github-app', { owner, repo });

            console.log('[GitHub App Check] Result:', result);

            // webviewClient.request wraps the response in { success, data }
            const data = result.data as { success: boolean; isInstalled: boolean; installUrl?: string };
            
            if (data.success && !data.isInstalled && data.installUrl) {
                // App not installed, show dialog
                setGitHubAppInstallData({
                    owner,
                    repo,
                    installUrl: data.installUrl,
                    message: 'GitHub App installation required for code sync',
                });
                setPhase('github-app-install');
                return false;
            }

            return true; // App installed or check failed (proceed anyway)
        } catch (error) {
            console.error('[GitHub App Check] Failed:', error);
            return true; // On error, proceed and let creation handle it
        }
    }, [needsGitHubAppCheck, state.edsConfig]);

    /**
     * Run pre-flight checks before starting project creation
     */
    const runPreFlightChecks = useCallback(async () => {
        console.log(`[Pre-Flight:${instanceId}] ENTER runPreFlightChecks`, {
            needsMeshCheck,
            needsGitHubAppCheck,
            hasEdsConfig: !!state.edsConfig,
            repoMode: state.edsConfig?.repoMode,
            timestamp: new Date().toISOString(),
        });

        // Store mesh info from check result (React state updates are async, can't rely on state)
        let detectedMeshInfo: { meshId?: string; meshStatus?: string; endpoint?: string } | undefined;

        // First check mesh (if needed)
        if (needsMeshCheck) {
            setPhase('checking-mesh');
            setMeshCheckResult(null);

            try {
                const result = await webviewClient.request<MeshCheckResult>('check-api-mesh', {
                    workspaceId: state.adobeWorkspace?.id,
                    projectId: state.adobeProject?.id,
                    selectedComponents: [
                        state.components?.frontend,
                        state.components?.backend,
                        ...(state.components?.dependencies || []),
                    ].filter(Boolean),
                });

                if (!result.success || !result.apiEnabled) {
                    setMeshCheckResult(result);
                    setPhase('mesh-error');
                    return; // Stop here
                }

                // Update wizard state with mesh info (if mesh exists)
                if (result.meshExists && result.meshId) {
                    detectedMeshInfo = {
                        meshId: result.meshId,
                        meshStatus: result.meshStatus,
                        endpoint: result.endpoint,
                    };
                    
                    updateState({
                        apiMesh: {
                            isChecking: false,
                            apiEnabled: true,
                            meshExists: true,
                            ...detectedMeshInfo,
                        },
                    });
                }
            } catch (error) {
                setMeshCheckResult({
                    success: false,
                    apiEnabled: false,
                    error: error instanceof Error ? error.message : 'Failed to check API Mesh access',
                });
                setPhase('mesh-error');
                return; // Stop here
            }
        }

        // Then check GitHub app (if needed)
        console.log('[Pre-Flight] Running GitHub app check...');
        const githubAppOk = await checkGitHubApp();
        console.log('[Pre-Flight] GitHub app check result:', githubAppOk);
        if (!githubAppOk) {
            console.log('[Pre-Flight] GitHub app not installed, stopping here');
            return; // Stop here, dialog is showing
        }

        // All checks passed, start creation
        console.log(`[Pre-Flight:${instanceId}] EXIT runPreFlightChecks - all checks passed, proceeding to creation`);
        setPhase('creating');

        // Build config with fresh mesh info (React state may be stale)
        const stateWithMeshInfo = detectedMeshInfo ? { ...state, apiMesh: detectedMeshInfo } : state;
        const projectConfig = buildProjectConfig(stateWithMeshInfo, importedSettings, packages);
        vscode.createProject(projectConfig);
    }, [needsMeshCheck, needsGitHubAppCheck, checkGitHubApp, state, updateState, importedSettings, packages, instanceId]);

    /**
     * Handle detected GitHub app installation
     * Called by the dialog when polling detects the app is now installed
     */
    const handleGitHubAppInstalled = useCallback(() => {
        console.log('[GitHub App] Installation confirmed, proceeding with creation');
        // App now installed, proceed with creation
        setPhase('creating');
        const projectConfig = buildProjectConfig(state, importedSettings, packages);
        vscode.createProject(projectConfig);
    }, [state, importedSettings, packages]);

    /**
     * Check API Mesh access for the selected workspace
     * @deprecated Use runPreFlightChecks instead
     */
    const checkMeshAccess = useCallback(async () => {
        // Delegated to runPreFlightChecks
        await runPreFlightChecks();
    }, [runPreFlightChecks]);

    // Run pre-flight checks on mount
    useEffect(() => {
        console.log(`[ProjectCreationStep:${instanceId}] useEffect triggered - starting pre-flight checks`);
        runPreFlightChecks();
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

    // Helper: Should show generic error UI (not mesh-error or github-app-install dialogs)
    const showGenericError = (progress?.error || isCancelled || isFailed) &&
        phase !== 'mesh-error' && phase !== 'github-app-install';
    const isCheckingMesh = phase === 'checking-mesh';
    const isMeshError = phase === 'mesh-error';
    const isGitHubAppInstall = phase === 'github-app-install';

    return (
        <div className="flex-column h-full w-full">
            {/* Main content area */}
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
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

                    {/* GitHub App installation required - show install message */}
                    {isGitHubAppInstall && githubAppInstallData && (
                        <GitHubAppInstallDialog
                            owner={githubAppInstallData.owner}
                            repo={githubAppInstallData.repo}
                            installUrl={githubAppInstallData.installUrl}
                            message={githubAppInstallData.message}
                            onInstallDetected={handleGitHubAppInstalled}
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
                    {showGenericError && (
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

            {/* Show Cancel during checking, active creation, or GitHub app install */}
            {(isCheckingMesh || isActive || isGitHubAppInstall) && (
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
                        <Button
                            variant="secondary"
                            onPress={handleShowLogs}
                            isQuiet
                        >
                            Logs
                        </Button>
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
