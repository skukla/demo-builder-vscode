/**
 * GitHubRepoSelectionStep
 *
 * Repository selection step for EDS projects using searchable list UI.
 * Matches the I/O Project Selection pattern with TwoColumnLayout.
 *
 * Features:
 * - Searchable list of repositories with write access
 * - "Create New Repository" action
 * - Reset to template option for existing repos (repurpose flow)
 * - Configuration summary showing selections
 * - Caching for fast navigation
 * - GitHub App installation check (blocks Continue until verified)
 *
 * Uses the shared useSelectionStep hook and SelectionStepContent component.
 */

import {
    ActionButton,
    Button,
    Checkbox,
    DialogTrigger,
    Divider,
    Flex,
    Heading,
    Text,
    TextField,
    View,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import Alert from '@spectrum-icons/workflow/Alert';
import React, { useEffect, useCallback, useState, useRef } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { Modal } from '@/core/ui/components/ui/Modal';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { StatusSection } from '@/core/ui/components/wizard';
import { useSelectionStep } from '@/core/ui/hooks';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
import {
    isValidRepositoryName,
    getRepositoryNameError,
    normalizeRepositoryName,
} from '@/core/validation/normalizers';
import type { GitHubRepoItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';
import '../styles/eds-steps.css';

/**
 * GitHub App installation status tracking
 */
interface GitHubAppStatus {
    isChecking: boolean;
    isInstalled: boolean | null;  // null = not checked yet
    /** The actual code.status from the Helix admin endpoint (200, 400, 404, etc.) */
    codeStatus?: number;
    error?: string;
    installUrl?: string;
}

/**
 * Repository creation state tracking
 */
interface RepoCreationState {
    isCreating: boolean;
    isCreated: boolean;
    error?: string;
}

/**
 * GitHubConfigurationSummary - Right column summary for GitHub selection
 */
interface GitHubConfigurationSummaryProps {
    githubUser?: { login: string };
    selectedRepo?: GitHubRepoItem;
    repoMode: 'new' | 'existing';
    repoName: string;
    githubAppStatus: GitHubAppStatus;
    repoCreationState: RepoCreationState;
}

function GitHubConfigurationSummary({
    githubUser,
    selectedRepo,
    repoMode,
    repoName,
    githubAppStatus,
    repoCreationState,
}: GitHubConfigurationSummaryProps) {
    // Build display value for repository
    const getRepoDisplayValue = () => {
        if (repoMode === 'new') {
            if (repoName && githubUser) {
                return `${githubUser.login}/${repoName}`;
            }
            return repoName || undefined;
        }
        return selectedRepo?.fullName;
    };

    const repoDisplayValue = getRepoDisplayValue();
    const isRepoComplete = repoMode === 'new' ? !!repoName : !!selectedRepo;

    // Get GitHub App status text for display
    const getGitHubAppStatusText = (): string => {
        if (githubAppStatus.isInstalled === null) return 'Not checked';
        if (githubAppStatus.isInstalled) return 'Verified';
        // Distinguish HTTP 404 (repo not indexed) from code.status 404 (app not installed)
        return githubAppStatus.codeStatus === undefined ? 'Registering...' : 'Not installed';
    };

    // Get GitHub App status indicator
    const getGitHubAppStatusIndicator = (): 'completed' | 'empty' | 'pending' | 'error' => {
        if (githubAppStatus.isChecking) return 'pending';
        if (githubAppStatus.isInstalled === true) return 'completed';
        // HTTP 404 (codeStatus undefined) = repo being registered by Helix, show pending
        // code.status 404 (codeStatus defined) = app not installed, show error
        if (githubAppStatus.isInstalled === false && githubAppStatus.codeStatus === undefined) return 'pending';
        if (githubAppStatus.isInstalled === false) return 'error';
        return 'empty'; // Only for null (not checked yet)
    };

    return (
        <View height="100%">
            <Heading level={3} marginBottom="size-300">
                Configuration Summary
            </Heading>

            {/* GitHub User */}
            <StatusSection
                label="GitHub Account"
                value={githubUser?.login}
                status={githubUser ? 'completed' : 'empty'}
                emptyText="Not connected"
            />

            <Divider size="S" />

            {/* Repository Selection */}
            <StatusSection
                label="Repository"
                value={repoDisplayValue}
                status={isRepoComplete ? 'completed' : 'empty'}
                emptyText={repoMode === 'new' ? 'Enter repository name' : 'Not selected'}
            />

            {/* GitHub App Status - show ONLY for NEW repos after creation
                EXISTING repos: App check deferred to StorefrontSetup (Helix needs fstab.yaml first) */}
            {repoMode === 'new' && repoCreationState.isCreated && (
                <>
                    <Divider size="S" />
                    <StatusSection
                        label="AEM Code Sync App"
                        value={getGitHubAppStatusText()}
                        status={getGitHubAppStatusIndicator()}
                        emptyText="Installation required"
                    />
                </>
            )}
        </View>
    );
}

/**
 * GitHubAppInstallModal - Shows the GitHub App installation modal for new repos.
 * Returns null when the modal should not be shown.
 */
function GitHubAppInstallModal({
    repoMode,
    repoCreationState,
    createdRepo,
    githubAppStatus,
    isRechecking,
    isModalDismissed,
    recheckMessage,
    hasRecheckFailed,
    onCheckAgain,
    onOpenInstallPage,
    onDismiss,
}: {
    repoMode: string;
    repoCreationState: RepoCreationState;
    createdRepo?: { owner: string; name: string };
    githubAppStatus: GitHubAppStatus;
    isRechecking: boolean;
    isModalDismissed: boolean;
    recheckMessage: string;
    hasRecheckFailed: boolean;
    onCheckAgain: () => void;
    onOpenInstallPage: () => void;
    onDismiss: () => void;
}): React.ReactElement | null {
    const isNewWithCreatedRepo = repoMode === 'new' && repoCreationState.isCreated && !!createdRepo;
    if (!isNewWithCreatedRepo) return null;
    if (githubAppStatus.isInstalled === true) return null;

    const shouldShowModal = (githubAppStatus.isInstalled === false || isRechecking) && !isModalDismissed;
    if (!shouldShowModal || !createdRepo) return null;

    const { owner, name: repo } = createdRepo;

    return (
        <DialogTrigger type="modal" isOpen={true} onOpenChange={(isOpen) => { if (!isOpen) onDismiss(); }}>
            <ActionButton isHidden>Open</ActionButton>
            {() => (
                <Modal
                    title="Install GitHub App"
                    actionButtons={
                        isRechecking
                            ? []
                            : [
                                { label: 'Check Again', variant: 'secondary', onPress: onCheckAgain },
                                { label: 'Install App', variant: 'accent', onPress: onOpenInstallPage },
                            ]
                    }
                    onClose={onDismiss}
                >
                    <div style={{ minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isRechecking ? (
                            <LoadingDisplay message={recheckMessage} />
                        ) : hasRecheckFailed ? (
                            <Text UNSAFE_className="text-sm text-orange-700">
                                {githubAppStatus.codeStatus === undefined
                                    ? 'Your repository is still being registered. This can take a few minutes for new repositories. Please wait and try again.'
                                    : 'App not detected. Please verify the app is installed for this repository.'}
                            </Text>
                        ) : (
                            <NumberedInstructions
                                instructions={[
                                    { step: 'Click "Install App"', details: 'Opens the AEM Code Sync GitHub App page' },
                                    { step: 'Configure the app', details: `Click "Configure", sign in if prompted, then click "Configure" next to "${owner}"` },
                                    { step: 'Grant repository access', details: `Select "Only select repositories", search for "${repo}", and click the green "Save" button` },
                                    { step: 'Return here and click "Check Again"', details: 'We\'ll verify the installation completed' },
                                ]}
                            />
                        )}
                    </div>
                </Modal>
            )}
        </DialogTrigger>
    );
}

/** GitHub App check result type */
interface GitHubAppCheckResult {
    success: boolean;
    isInstalled: boolean;
    codeStatus?: number;
    installUrl?: string;
    error?: string;
}

/**
 * Retry-poll for GitHub App installation with exponential backoff.
 * Extracted to reduce component complexity.
 */
async function pollGitHubAppInstallation(
    owner: string,
    repo: string,
    setRecheckMessage: (msg: string) => void,
): Promise<{ status: GitHubAppStatus; failed: boolean }> {
    const maxAttempts = 5;
    const retryDelayMs = 5000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await webviewClient.request<GitHubAppCheckResult>(
                'check-github-app', { owner, repo, lenient: true },
            );

            if (result.success && result.isInstalled) {
                return {
                    status: { isChecking: false, isInstalled: true, codeStatus: result.codeStatus },
                    failed: false,
                };
            }

            // HTTP 404 (codeStatus undefined) means repo not yet indexed -- retry
            if (result.codeStatus === undefined && attempt < maxAttempts) {
                setRecheckMessage(`Repository is still being registered... (attempt ${attempt + 1} of ${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                continue;
            }

            return {
                status: { isChecking: false, isInstalled: false, codeStatus: result.codeStatus, installUrl: result.installUrl },
                failed: true,
            };
        } catch (err) {
            console.error('[GitHub App] Check failed:', err);
            return {
                status: { isChecking: false, isInstalled: false, error: (err as Error).message },
                failed: true,
            };
        }
    }

    // All retries exhausted
    return { status: { isChecking: false, isInstalled: false }, failed: true };
}

/**
 * Compute whether the user can proceed based on repo mode and current state.
 * Extracted from useEffect to reduce component complexity.
 */
function computeCanProceed(
    repoMode: string,
    repoCreationState: RepoCreationState,
    githubAppStatus: GitHubAppStatus,
    selectedRepo: GitHubRepoItem | undefined,
    isLoading: boolean,
): boolean {
    if (repoMode === 'new') {
        return (
            repoCreationState.isCreated &&
            githubAppStatus.isInstalled === true &&
            !githubAppStatus.isChecking &&
            !repoCreationState.isCreating
        );
    }
    return !!selectedRepo && !isLoading;
}

/**
 * Build GitHubAppStatus from a check result.
 * Extracted to simplify checkGitHubApp callback.
 */
function buildAppStatusFromResult(result: GitHubAppCheckResult): GitHubAppStatus {
    return {
        isChecking: false,
        isInstalled: result.success ? result.isInstalled : false,
        codeStatus: result.codeStatus,
        installUrl: result.installUrl,
        error: result.success ? undefined : (result.error || 'Failed to check GitHub App status'),
    };
}

/**
 * NewRepoForm - Form for creating a new repository.
 * Extracted to reduce main component complexity.
 */
function NewRepoForm({
    repoName,
    githubUser,
    repoNameError,
    repoCreationState,
    templateAvailable,
    onRepoNameChange,
    onRepoNameBlur,
    onUseExisting,
    onCreateRepository,
}: {
    repoName: string;
    githubUser?: { login: string };
    repoNameError?: string;
    repoCreationState: RepoCreationState;
    templateAvailable: boolean;
    onRepoNameChange: (value: string) => void;
    onRepoNameBlur: () => void;
    onUseExisting: () => void;
    onCreateRepository: () => void;
}): React.ReactElement {
    return (
        <View
            backgroundColor="gray-50"
            borderRadius="medium"
            padding="size-300"
        >
            <Heading level={3} margin={0} marginBottom="size-200">Create New Repository</Heading>

            <TextField
                label="Repository Name"
                value={repoName}
                onChange={onRepoNameChange}
                onBlur={onRepoNameBlur}
                validationState={repoNameError || repoCreationState.error ? 'invalid' : undefined}
                errorMessage={repoNameError || repoCreationState.error}
                placeholder="my-eds-project"
                description={githubUser ? `Will be created as ${githubUser.login}/${repoName || 'my-eds-project'}` : 'Name for your new GitHub repository'}
                width="100%"
                isRequired
                autoFocus
                isDisabled={repoCreationState.isCreated || repoCreationState.isCreating}
            />

            <Flex justifyContent="end" gap="size-100" marginTop="size-200">
                <Button variant="secondary" onPress={onUseExisting}>
                    Browse
                </Button>
                {!repoCreationState.isCreated && (
                    <Button
                        variant="accent"
                        onPress={onCreateRepository}
                        isDisabled={
                            !repoName ||
                            !isValidRepositoryName(repoName) ||
                            repoCreationState.isCreating ||
                            !templateAvailable
                        }
                    >
                        Create
                    </Button>
                )}
            </Flex>

            <LoadingOverlay isVisible={repoCreationState.isCreating} />
        </View>
    );
}

/**
 * ResetToTemplateOption - Checkbox with warning for resetting existing repos.
 * Extracted to reduce main component complexity.
 */
function ResetToTemplateOption({
    resetToTemplate,
    onResetToTemplateChange,
}: {
    resetToTemplate: boolean;
    onResetToTemplateChange: (isSelected: boolean) => void;
}): React.ReactElement {
    return (
        <Flex direction="column" gap="size-100" marginTop="size-300">
            <Checkbox
                isSelected={resetToTemplate}
                onChange={onResetToTemplateChange}
            >
                Reset to template (replaces all content)
            </Checkbox>

            <View
                marginStart="size-300"
                minHeight="size-250"
                UNSAFE_className="reset-warning-container"
            >
                <Flex
                    alignItems="center"
                    gap="size-100"
                    UNSAFE_className={resetToTemplate ? 'reset-warning-visible' : 'reset-warning-hidden'}
                >
                    <Alert size="S" UNSAFE_className="text-orange-500 flex-shrink-0" />
                    <Text UNSAFE_className="text-xs text-orange-600">
                        This will delete and recreate the repository with the selected template content.
                    </Text>
                </Flex>
            </View>
        </Flex>
    );
}

/**
 * GitHubRepoSelectionStep Component
 */
export function GitHubRepoSelectionStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const edsConfig = state.edsConfig;
    const repoMode = edsConfig?.repoMode || 'existing';
    const selectedRepo = edsConfig?.selectedRepo;
    const resetToTemplate = edsConfig?.resetToTemplate || false;
    const githubUser = edsConfig?.githubAuth?.user;
    const repoName = edsConfig?.repoName || '';

    const [repoNameError, setRepoNameError] = useState<string | undefined>();
    const [repoCreationState, setRepoCreationState] = useState<RepoCreationState>({
        isCreating: false,
        isCreated: !!edsConfig?.createdRepo,
    });
    const [githubAppStatus, setGitHubAppStatus] = useState<GitHubAppStatus>({
        isChecking: false,
        isInstalled: null,
    });
    const [isRechecking, setIsRechecking] = useState(false);
    const [recheckMessage, setRecheckMessage] = useState('Checking installation status...');
    const [hasRecheckFailed, setHasRecheckFailed] = useState(false);
    const [isModalDismissed, setIsModalDismissed] = useState(false);
    const lastCheckedRepo = useRef<string | null>(null);

    const {
        items: repos,
        filteredItems: filteredRepos,
        showLoading,
        isLoading,
        isRefreshing,
        hasLoadedOnce,
        error,
        searchQuery,
        setSearchQuery,
        load: loadRepos,
        refresh,
        selectItem,
    } = useSelectionStep<GitHubRepoItem>({
        cacheKey: 'githubReposCache',
        messageType: 'get-github-repos',
        errorMessageType: 'get-github-repos-error',
        state,
        updateState,
        selectedItem: selectedRepo,
        searchFilterKey: 'githubRepoSearchFilter',
        autoSelectSingle: false,
        searchFields: ['name', 'fullName', 'description'],
        onSelect: (repo) => {
            updateState({
                edsConfig: {
                    ...edsConfig,
                    accsHost: edsConfig?.accsHost || '',
                    storeViewCode: edsConfig?.storeViewCode || '',
                    customerGroup: edsConfig?.customerGroup || '',
                    repoName: repo.name,
                    daLiveOrg: edsConfig?.daLiveOrg || '',
                    daLiveSite: edsConfig?.daLiveSite || '',
                    repoMode: 'existing',
                    selectedRepo: repo,
                    existingRepo: repo.fullName,
                    existingRepoVerified: true,
                },
            });
        },
        validateBeforeLoad: () => {
            if (!state.edsConfig?.githubAuth?.isAuthenticated) {
                return { valid: false, error: 'GitHub authentication required. Please go back and authenticate.' };
            }
            return { valid: true };
        },
    });

    const updateEdsConfig = useCallback((updates: Partial<typeof edsConfig>) => {
        updateState({
            edsConfig: {
                ...edsConfig,
                accsHost: edsConfig?.accsHost || '',
                storeViewCode: edsConfig?.storeViewCode || '',
                customerGroup: edsConfig?.customerGroup || '',
                repoName: edsConfig?.repoName || '',
                daLiveOrg: edsConfig?.daLiveOrg || '',
                daLiveSite: edsConfig?.daLiveSite || '',
                ...updates,
            },
        });
    }, [edsConfig, updateState]);

    const resetLocalState = useCallback(() => {
        setRepoCreationState({ isCreating: false, isCreated: false });
        setGitHubAppStatus({ isChecking: false, isInstalled: null });
        setIsModalDismissed(false);
        lastCheckedRepo.current = null;
    }, []);

    const handleCreateNew = useCallback(() => {
        updateEdsConfig({
            repoMode: 'new', repoName: '', selectedRepo: undefined,
            existingRepo: undefined, existingRepoVerified: undefined,
            resetToTemplate: false, createdRepo: undefined,
        });
        resetLocalState();
    }, [updateEdsConfig, resetLocalState]);

    const handleUseExisting = useCallback(() => {
        updateEdsConfig({ repoMode: 'existing', createdRepo: undefined });
        resetLocalState();
    }, [updateEdsConfig, resetLocalState]);

    const handleResetToTemplateChange = useCallback((isSelected: boolean) => {
        updateEdsConfig({ resetToTemplate: isSelected });
    }, [updateEdsConfig]);

    const handleRepoNameChange = useCallback((value: string) => {
        const normalized = normalizeRepositoryName(value);
        updateEdsConfig({ repoName: normalized });
        setRepoNameError(getRepositoryNameError(normalized));
    }, [updateEdsConfig]);

    const handleRepoNameBlur = useCallback(() => {
        setRepoNameError(getRepositoryNameError(repoName));
    }, [repoName]);

    const checkGitHubApp = useCallback(async (owner: string, repo: string, lenient = false) => {
        const repoKey = `${owner}/${repo}`;
        if (lastCheckedRepo.current === repoKey && !lenient) return;
        lastCheckedRepo.current = repoKey;

        try {
            const result = await webviewClient.request<GitHubAppCheckResult>(
                'check-github-app', { owner, repo, lenient },
            );
            setGitHubAppStatus(buildAppStatusFromResult(result));
        } catch (err) {
            console.error('[GitHub App] Check failed:', err);
            setGitHubAppStatus({ isChecking: false, isInstalled: false, error: (err as Error).message });
        } finally {
            setIsRechecking(false);
        }
    }, []);

    const handleCreateRepository = useCallback(async () => {
        const templateOwner = edsConfig?.templateOwner;
        const templateRepo = edsConfig?.templateRepo;

        if (!templateOwner || !templateRepo) {
            setRepoCreationState({ isCreating: false, isCreated: false, error: 'Template configuration not available. Please check your stack settings.' });
            return;
        }
        if (!repoName || !isValidRepositoryName(repoName)) {
            setRepoNameError(getRepositoryNameError(repoName));
            return;
        }

        setRepoCreationState({ isCreating: true, isCreated: false });
        setRepoNameError(undefined);

        try {
            const result = await webviewClient.request<{
                success: boolean;
                data?: { owner: string; name: string; url: string; fullName: string };
                error?: string;
            }>('create-github-repo', { repoName, templateOwner, templateRepo, isPrivate: false });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to create repository');
            }

            updateEdsConfig({
                createdRepo: { owner: result.data.owner, name: result.data.name, url: result.data.url, fullName: result.data.fullName },
            });
            setRepoCreationState({ isCreating: false, isCreated: true });
            setGitHubAppStatus({ isChecking: false, isInstalled: false, installUrl: 'https://github.com/apps/aem-code-sync/installations/select_target' });
        } catch (err) {
            console.error('[GitHub Repo] Creation failed:', err);
            setRepoCreationState({ isCreating: false, isCreated: false, error: (err as Error).message });
        }
    }, [repoName, edsConfig?.templateOwner, edsConfig?.templateRepo, updateEdsConfig]);

    const handleCheckAgain = useCallback(async () => {
        if (repoMode !== 'new' || !edsConfig?.createdRepo) return;

        setIsRechecking(true);
        setHasRecheckFailed(false);
        setRecheckMessage('Checking installation status...');
        setGitHubAppStatus({ isChecking: true, isInstalled: null });

        const { status, failed } = await pollGitHubAppInstallation(
            edsConfig.createdRepo.owner, edsConfig.createdRepo.name, setRecheckMessage,
        );

        setGitHubAppStatus(status);
        setHasRecheckFailed(failed);
        setIsRechecking(false);
    }, [repoMode, edsConfig?.createdRepo]);

    const handleOpenInstallPage = useCallback(() => {
        if (githubAppStatus.installUrl) {
            vscode.postMessage('openExternal', { url: githubAppStatus.installUrl });
        }
    }, [githubAppStatus.installUrl]);

    // Validate pre-selected repo exists in loaded repos (for import flow)
    // If the imported repo no longer exists, clear all repo-related state
    useEffect(() => {
        if (repoMode === 'existing' && selectedRepo && hasLoadedOnce && repos.length > 0) {
            const repoExists = repos.some(repo => repo.id === selectedRepo.id);
            if (!repoExists) {
                // Pre-selected repo doesn't exist - clear selection and name
                updateEdsConfig({
                    selectedRepo: undefined,
                    existingRepo: undefined,
                    existingRepoVerified: undefined,
                    repoName: '', // Clear imported name since repo doesn't exist
                });
            }
        }
    }, [hasLoadedOnce, repos, selectedRepo, repoMode, updateEdsConfig]);

    // Reset GitHub App status when repo mode changes
    // - EXISTING repos: No check at this step (deferred to StorefrontSetup after fstab.yaml)
    // - NEW repos: Status set to "not installed" in handleCreateRepository after creation
    useEffect(() => {
        // Reset status when switching modes or when existing repo selection changes
        setGitHubAppStatus({
            isChecking: false,
            isInstalled: null,
        });
        setIsModalDismissed(false);
        lastCheckedRepo.current = null;
    }, [repoMode, selectedRepo]);

    // Re-check GitHub App when returning to this step with an already-created repo.
    // githubAppStatus resets to null on mount, but createdRepo persists — re-verify so Continue enables.
    useEffect(() => {
        if (repoMode === 'new' && edsConfig?.createdRepo && githubAppStatus.isInstalled === null) {
            const { owner, name } = edsConfig.createdRepo;
            if (owner && name) {
                checkGitHubApp(owner, name, true);
            }
        }
    }, [repoMode, edsConfig?.createdRepo, githubAppStatus.isInstalled, checkGitHubApp]);

    // Update canProceed based on selection and repo mode
    useEffect(() => {
        setCanProceed(computeCanProceed(repoMode, repoCreationState, githubAppStatus, selectedRepo, isLoading));
    }, [repoMode, repoCreationState, selectedRepo, githubAppStatus, isLoading, setCanProceed]);

    // Derived state for showing reset option
    const shouldShowResetOption = selectedRepo && hasLoadedOnce && !isLoading;
    const templateAvailable = !!(edsConfig?.templateOwner && edsConfig?.templateRepo);

    // Left column: Repository selection
    const leftContent = (
        <>
            {repoMode === 'new' && (
                <NewRepoForm
                    repoName={repoName}
                    githubUser={githubUser}
                    repoNameError={repoNameError}
                    repoCreationState={repoCreationState}
                    templateAvailable={templateAvailable}
                    onRepoNameChange={handleRepoNameChange}
                    onRepoNameBlur={handleRepoNameBlur}
                    onUseExisting={handleUseExisting}
                    onCreateRepository={handleCreateRepository}
                />
            )}

            {repoMode === 'existing' && (
                <>
                    <SelectionStepContent
                        headerAction={
                            <Button variant="accent" onPress={handleCreateNew}>
                                <Add size="S" />
                                <Text>New</Text>
                            </Button>
                        }
                        items={repos}
                        filteredItems={filteredRepos}
                        showLoading={showLoading}
                        isLoading={isLoading}
                        isRefreshing={isRefreshing}
                        hasLoadedOnce={hasLoadedOnce}
                        error={error}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onLoad={loadRepos}
                        onRefresh={refresh}
                        selectedId={selectedRepo?.id}
                        onSelect={selectItem}
                        labels={{
                            loadingMessage: 'Loading your repositories...',
                            loadingSubMessage: 'Fetching repositories with write access',
                            errorTitle: 'Error Loading Repositories',
                            emptyTitle: 'No Repositories Found',
                            emptyMessage: 'No repositories found with write access. Create a new repository to get started.',
                            searchPlaceholder: 'Type to filter repositories...',
                            itemNoun: 'repository',
                            itemNounPlural: 'repositories',
                            ariaLabel: 'GitHub Repositories',
                        }}
                        renderDescription={(item) => (
                            <Text slot="description">
                                {item.isPrivate && (
                                    <span className="repo-private-badge">Private</span>
                                )}
                                {item.description || <span className="repo-no-description">No description</span>}
                            </Text>
                        )}
                    />
                    {shouldShowResetOption && (
                        <ResetToTemplateOption
                            resetToTemplate={resetToTemplate}
                            onResetToTemplateChange={handleResetToTemplateChange}
                        />
                    )}
                </>
            )}

            <GitHubAppInstallModal
                repoMode={repoMode}
                repoCreationState={repoCreationState}
                createdRepo={edsConfig?.createdRepo}
                githubAppStatus={githubAppStatus}
                isRechecking={isRechecking}
                isModalDismissed={isModalDismissed}
                recheckMessage={recheckMessage}
                hasRecheckFailed={hasRecheckFailed}
                onCheckAgain={handleCheckAgain}
                onOpenInstallPage={handleOpenInstallPage}
                onDismiss={() => setIsModalDismissed(true)}
            />
        </>
    );

    // Right column: Configuration Summary
    const rightContent = (
        <GitHubConfigurationSummary
            githubUser={githubUser}
            selectedRepo={selectedRepo}
            repoMode={repoMode}
            repoName={repoName}
            githubAppStatus={githubAppStatus}
            repoCreationState={repoCreationState}
        />
    );

    return (
        <div className="h-full w-full relative">
            <TwoColumnLayout
                leftContent={leftContent}
                rightContent={rightContent}
            />
        </div>
    );
}
