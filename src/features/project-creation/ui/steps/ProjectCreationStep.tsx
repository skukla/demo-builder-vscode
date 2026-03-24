import { Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getCancelButtonText } from '../helpers/buttonTextHelpers';
import { getStackById } from '../hooks/useSelectedStack';
import { buildProjectConfig, ImportedSettings } from '../wizard/wizardHelpers';
import { isProgressActive } from './projectCreationPredicates';
import { hasMeshInDependencies } from '@/core/constants';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { PageFooter } from '@/core/ui/components/layout/PageFooter';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components';
import { MeshErrorDialog } from '@/features/mesh/ui/steps/components/MeshErrorDialog';
import { DemoPackage } from '@/types/demoPackages';
import { WizardState } from '@/types/webview';

/** Extract GitHub owner/repo from EDS config for GitHub App check */
function extractGitHubRepoInfo(edsConfig: WizardState['edsConfig']): { owner?: string; repo?: string } {
    if (!edsConfig) return {};

    const authenticatedUser = edsConfig.githubAuth?.user?.login;

    if (edsConfig.existingRepo && edsConfig.existingRepo.includes('/')) {
        const [owner, repo] = edsConfig.existingRepo.split('/');
        return { owner, repo };
    }
    if (edsConfig.selectedRepo) {
        return { owner: edsConfig.selectedRepo.owner, repo: edsConfig.selectedRepo.name };
    }
    if (edsConfig.repoName && authenticatedUser) {
        return { owner: authenticatedUser, repo: edsConfig.repoName };
    }
    return {};
}

/** Success completion content */
function SuccessContent({ isOpeningProject }: {
    isOpeningProject: boolean;
}) {
    if (isOpeningProject) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay size="L" message="Loading your projects..." />
            </CenteredFeedbackContainer>
        );
    }

    return (
        <CenteredFeedbackContainer>
            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                <Flex direction="column" gap="size-100" alignItems="center">
                    <Text UNSAFE_className="text-xl font-medium">Project Created Successfully</Text>
                    <Text UNSAFE_className="text-sm text-gray-600 text-center">Click below to view your projects</Text>
                </Flex>
            </Flex>
        </CenteredFeedbackContainer>
    );
}

/** Error/cancelled state content */
function ErrorContent({ isCancelled, errorMessage }: {
    isCancelled: boolean;
    errorMessage?: string;
}) {
    return (
        <CenteredFeedbackContainer>
            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                <Flex direction="column" gap="size-100" alignItems="center">
                    <Text UNSAFE_className="text-xl font-medium">
                        {isCancelled ? 'Project Creation Cancelled' : 'Project Creation Failed'}
                    </Text>
                    {errorMessage && (
                        <Text UNSAFE_className="text-sm text-gray-600">{errorMessage}</Text>
                    )}
                </Flex>
            </Flex>
        </CenteredFeedbackContainer>
    );
}

type DetectedMeshInfo = { meshId?: string; meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error'; endpoint?: string };

/**
 * Run API Mesh access check for the selected workspace.
 * Returns mesh info on success, null on failure, undefined if no mesh found.
 */
async function runMeshCheck(
    state: WizardState,
    stack: import('@/types/stacks').Stack | undefined,
    dependencies: string[],
    updateState: (updates: Partial<WizardState>) => void,
    setMeshCheckResult: (result: MeshCheckResult | null) => void,
    setPhase: (phase: StepPhase) => void,
): Promise<DetectedMeshInfo | null | undefined> {
    setPhase('checking-mesh');
    setMeshCheckResult(null);

    try {
        const result = await webviewClient.request<MeshCheckResult>('check-api-mesh', {
            workspaceId: state.adobeWorkspace?.id,
            projectId: state.adobeProject?.id,
            selectedComponents: stack ? [
                stack.frontend, stack.backend, ...dependencies,
            ].filter(Boolean) : [],
        });

        if (!result.success || !result.apiEnabled) {
            setMeshCheckResult(result);
            setPhase('mesh-error');
            return null;
        }

        if (result.meshExists && result.meshId) {
            const meshInfo: DetectedMeshInfo = {
                meshId: result.meshId,
                meshStatus: result.meshStatus,
                endpoint: result.endpoint,
            };
            updateState({
                apiMesh: { isChecking: false, apiEnabled: true, meshExists: true, ...meshInfo },
            });
            return meshInfo;
        }

        return undefined;
    } catch (error) {
        setMeshCheckResult({
            success: false,
            apiEnabled: false,
            error: error instanceof Error ? error.message : 'Failed to check API Mesh access',
        });
        setPhase('mesh-error');
        return null;
    }
}

/** Determine StepPhase from creation progress */
function derivePhaseFromProgress(
    progress: WizardState['creationProgress'],
    _currentPhase: StepPhase,
): StepPhase | undefined {
    if (!progress) return undefined;
    if (progress.currentOperation === 'Cancelled') return 'cancelled';
    if (progress.currentOperation === 'Failed' || progress.error) return 'failed';
    if (progress.currentOperation === 'Project Created') return 'completed';
    return undefined; // No change
}

/** Handle creation failure messages and detect GitHub App install requirement */
function handleCreationFailedMessage(
    data: unknown,
    setGitHubAppInstallData: (data: GitHubAppInstallData | null) => void,
    setPhase: (phase: StepPhase) => void,
): void {
    const failedData = data as {
        errorType?: string;
        errorDetails?: { owner?: string; repo?: string; installUrl?: string };
    };

    if (failedData.errorType === 'GITHUB_APP_NOT_INSTALLED' && failedData.errorDetails) {
        const { owner, repo, installUrl } = failedData.errorDetails;
        if (owner && repo && installUrl) {
            setGitHubAppInstallData({ owner, repo, installUrl, message: 'GitHub App installation required for code sync' });
            setPhase('github-app-install');
        }
    }
}

/** Main content area - renders the appropriate content for each phase */
function StepContentArea(props: {
    phase: StepPhase;
    progress: WizardState['creationProgress'];
    isActive: boolean;
    isCompleted: boolean;
    isOpeningProject: boolean;
    showGenericError: boolean;
    isCancelled: boolean;
    meshCheckResult: MeshCheckResult | null;
    githubAppInstallData: GitHubAppInstallData | null;
    onRetryMeshCheck: () => void;
    onBack: () => void;
    onOpenConsole: () => void;
    onGitHubAppInstalled: () => void;
}) {
    const {
        phase, progress, isActive, isCompleted, isOpeningProject,
        showGenericError, isCancelled, meshCheckResult, githubAppInstallData,
        onRetryMeshCheck, onBack, onOpenConsole, onGitHubAppInstalled,
    } = props;

    if (phase === 'checking-mesh') {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay size="L" message="Checking API Mesh Access" subMessage="Verifying workspace configuration..." />
            </CenteredFeedbackContainer>
        );
    }

    if (phase === 'mesh-error' && meshCheckResult) {
        return (
            <MeshErrorDialog
                error={meshCheckResult.error || 'API Mesh API is not enabled for this workspace.'}
                setupInstructions={meshCheckResult.setupInstructions}
                onRetry={onRetryMeshCheck}
                onBack={onBack}
                onOpenConsole={onOpenConsole}
            />
        );
    }

    if (phase === 'github-app-install' && githubAppInstallData) {
        return (
            <GitHubAppInstallDialog
                owner={githubAppInstallData.owner}
                repo={githubAppInstallData.repo}
                installUrl={githubAppInstallData.installUrl}
                message={githubAppInstallData.message}
                onInstallDetected={onGitHubAppInstalled}
            />
        );
    }

    if (isActive && progress) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay
                    size="L"
                    message={progress.currentOperation || 'Processing'}
                    subMessage={progress.message}
                    helperText="This could take up to 3 minutes"
                />
            </CenteredFeedbackContainer>
        );
    }

    if (isCompleted && !progress?.error) {
        return <SuccessContent isOpeningProject={isOpeningProject} />;
    }

    if (showGenericError) {
        return <ErrorContent isCancelled={isCancelled} errorMessage={progress?.error} />;
    }

    if (phase === 'creating' && !progress) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay size="L" message="Initializing" subMessage="Preparing to create your project..." />
            </CenteredFeedbackContainer>
        );
    }

    return null;
}

/** Footer area - renders the appropriate buttons for each phase */
function StepFooterArea(props: {
    isCheckingMesh: boolean;
    isActive: boolean;
    isGitHubAppInstall: boolean;
    isCompleted: boolean;
    isOpeningProject: boolean;
    showGenericError: boolean;
    isCancelling: boolean;
    hasError: boolean;
    onBack: () => void;
    onCancel: () => void;
    onShowLogs: () => void;
    onOpenProject: () => void;
}) {
    const {
        isCheckingMesh, isActive, isGitHubAppInstall, isCompleted,
        isOpeningProject, showGenericError, isCancelling, hasError,
        onBack, onCancel, onShowLogs, onOpenProject,
    } = props;

    if (isCheckingMesh || isActive || isGitHubAppInstall) {
        return (
            <PageFooter
                leftContent={
                    <Button variant="secondary" onPress={isCheckingMesh ? onBack : onCancel} isQuiet isDisabled={isCancelling}>
                        {getCancelButtonText(isCheckingMesh, isCancelling)}
                    </Button>
                }
                centerContent={<Button variant="secondary" onPress={onShowLogs} isQuiet>Logs</Button>}
                constrainWidth={true}
            />
        );
    }

    if (isCompleted && !hasError) {
        return (
            <PageFooter
                centerContent={!isOpeningProject && <Button variant="secondary" onPress={onShowLogs} isQuiet>Logs</Button>}
                rightContent={!isOpeningProject && <Button variant="cta" onPress={onOpenProject}>View Projects</Button>}
                constrainWidth={true}
            />
        );
    }

    if (showGenericError) {
        return (
            <PageFooter
                leftContent={<Button variant="secondary" onPress={onBack} isQuiet>Back</Button>}
                centerContent={<Button variant="secondary" onPress={onShowLogs} isQuiet>Logs</Button>}
                constrainWidth={true}
            />
        );
    }

    return null;
}

interface ProjectCreationStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onBack: () => void;
    importedSettings?: ImportedSettings | null;
    packages?: DemoPackage[];
}

interface MeshCheckResult {
    success: boolean;
    apiEnabled: boolean;
    meshExists?: boolean;
    meshId?: string;
    meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error';
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
    const [phase, setPhase] = useState<StepPhase>('creating');
    const [meshCheckResult, setMeshCheckResult] = useState<MeshCheckResult | null>(null);
    const [githubAppInstallData, setGitHubAppInstallData] = useState<GitHubAppInstallData | null>(null);

    // Get stack directly from config - source of truth for components
    const stack = useMemo(
        () => state.selectedStack ? getStackById(state.selectedStack) : undefined,
        [state.selectedStack],
    );

    // Determine if checks are needed - check both stack dependencies and user-selected optional deps
    const effectiveDependencies = useMemo(
        () => [...(stack?.dependencies || []), ...(state.selectedOptionalDependencies || [])],
        [stack?.dependencies, state.selectedOptionalDependencies],
    );
    const needsMeshCheck = hasMeshInDependencies(effectiveDependencies);
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
            return true; // Not needed or no config, proceed
        }

        const { owner, repo } = extractGitHubRepoInfo(state.edsConfig);

        if (!owner || !repo) {
            return true; // Can't check without owner/repo, let it proceed and fail later if needed
        }

        try {
            const result = await webviewClient.request<{
                success: boolean;
                isInstalled: boolean;
                installUrl?: string;
                error?: string;
            }>('check-github-app', { owner, repo });

            if (result.success && !result.isInstalled && result.installUrl) {
                // App not installed, show dialog
                setGitHubAppInstallData({
                    owner,
                    repo,
                    installUrl: result.installUrl,
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
        // Run mesh check if needed (returns null on failure, meshInfo on success, undefined if no mesh)
        const meshInfo = needsMeshCheck
            ? await runMeshCheck(state, stack, effectiveDependencies, updateState, setMeshCheckResult, setPhase)
            : undefined;

        if (meshInfo === null) return; // Mesh check failed, phase already set

        const githubAppOk = await checkGitHubApp();
        if (!githubAppOk) return;

        // All checks passed, start creation
        setPhase('creating');

        const stateWithMeshInfo = meshInfo ? {
            ...state,
            apiMesh: { isChecking: false, apiEnabled: true, meshExists: true, ...meshInfo },
        } : state;
        // eslint-disable-next-line no-console
        console.log('[ProjectCreationStep] Before buildProjectConfig - state.edsConfig:', {
            hasEdsConfig: !!stateWithMeshInfo.edsConfig,
            repoUrl: stateWithMeshInfo.edsConfig?.repoUrl,
            selectedStack: stateWithMeshInfo.selectedStack,
        });
        const projectConfig = buildProjectConfig(stateWithMeshInfo, importedSettings, packages);
        vscode.createProject(projectConfig);
    }, [needsMeshCheck, checkGitHubApp, state, stack, effectiveDependencies, updateState, importedSettings, packages]);

    /**
     * Handle detected GitHub app installation
     * Called by the dialog when polling detects the app is now installed
     */
    const handleGitHubAppInstalled = useCallback(() => {
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
        runPreFlightChecks();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update phase based on progress
    useEffect(() => {
        const newPhase = derivePhaseFromProgress(progress, phase);
        if (newPhase) setPhase(newPhase);
    }, [progress, phase]);

    // Listen for creationFailed messages with GITHUB_APP_NOT_INSTALLED error
    useEffect(() => {
        const unsubscribe = vscode.onMessage('creationFailed', (data: unknown) => {
            handleCreationFailedMessage(data, setGitHubAppInstallData, setPhase);
        });
        return unsubscribe;
    }, []);

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
    const isGitHubAppInstall = phase === 'github-app-install';

    return (
        <div className="flex-column h-full w-full">
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
                    <StepContentArea
                        phase={phase}
                        progress={progress}
                        isActive={isActive}
                        isCompleted={isCompleted}
                        isOpeningProject={isOpeningProject}
                        showGenericError={!!showGenericError}
                        isCancelled={isCancelled}
                        meshCheckResult={meshCheckResult}
                        githubAppInstallData={githubAppInstallData}
                        onRetryMeshCheck={handleRetryMeshCheck}
                        onBack={onBack}
                        onOpenConsole={handleOpenConsole}
                        onGitHubAppInstalled={handleGitHubAppInstalled}
                    />
                </SingleColumnLayout>
            </div>

            <StepFooterArea
                isCheckingMesh={isCheckingMesh}
                isActive={isActive}
                isGitHubAppInstall={isGitHubAppInstall}
                isCompleted={isCompleted}
                isOpeningProject={isOpeningProject}
                showGenericError={!!showGenericError}
                isCancelling={isCancelling}
                hasError={!!progress?.error}
                onBack={onBack}
                onCancel={handleCancel}
                onShowLogs={handleShowLogs}
                onOpenProject={handleOpenProject}
            />
        </div>
    );
}
