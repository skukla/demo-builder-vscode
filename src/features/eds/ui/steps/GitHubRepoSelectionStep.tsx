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

import React, { useEffect, useCallback, useState, useRef } from 'react';
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
import LinkOut from '@spectrum-icons/workflow/LinkOut';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { StatusSection } from '@/core/ui/components/wizard';
import { Modal } from '@/core/ui/components/ui/Modal';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import {
    isValidRepositoryName,
    getRepositoryNameError,
    normalizeRepositoryName,
} from '@/core/validation/normalizers';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { useSelectionStep } from '@/core/ui/hooks';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
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
        return githubAppStatus.isInstalled ? 'Verified' : 'Not installed';
    };

    // Get GitHub App status indicator
    const getGitHubAppStatusIndicator = (): 'completed' | 'empty' | 'pending' | 'error' => {
        if (githubAppStatus.isChecking) return 'pending';
        if (githubAppStatus.isInstalled === true) return 'completed';
        if (githubAppStatus.isInstalled === false) return 'error'; // Shows value, not emptyText
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

            {/* GitHub App Status - show for existing repos OR for new repos after creation */}
            {((repoMode === 'existing' && isRepoComplete) ||
              (repoMode === 'new' && repoCreationState.isCreated)) && (
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

    // Validation state
    const [repoNameError, setRepoNameError] = useState<string | undefined>();

    // Repository creation state (for new repos)
    const [repoCreationState, setRepoCreationState] = useState<RepoCreationState>({
        isCreating: false,
        isCreated: !!edsConfig?.createdRepo,  // Restore from state if navigating back
    });

    // GitHub App installation status
    const [githubAppStatus, setGitHubAppStatus] = useState<GitHubAppStatus>({
        isChecking: false,
        isInstalled: null,
    });

    // Track if we're rechecking from within the modal (vs initial check)
    const [isRechecking, setIsRechecking] = useState(false);

    // Track if user dismissed the GitHub App modal (reset when repo changes)
    const [isModalDismissed, setIsModalDismissed] = useState(false);

    // Track last checked repo to avoid duplicate checks
    const lastCheckedRepo = useRef<string | null>(null);

    // Use selection step hook for repository list
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
        autoSelectSingle: false,  // Don't auto-select, user should choose
        searchFields: ['name', 'fullName', 'description'],
        onSelect: (repo) => {
            updateState({
                edsConfig: {
                    ...edsConfig,
                    accsHost: edsConfig?.accsHost || '',
                    storeViewCode: edsConfig?.storeViewCode || '',
                    customerGroup: edsConfig?.customerGroup || '',
                    repoName: edsConfig?.repoName || '',
                    daLiveOrg: edsConfig?.daLiveOrg || '',
                    daLiveSite: edsConfig?.daLiveSite || '',
                    repoMode: 'existing',
                    selectedRepo: repo,
                    // Also set existingRepo for backward compatibility
                    existingRepo: repo.fullName,
                    existingRepoVerified: true,
                },
            });
        },
        validateBeforeLoad: () => {
            if (!state.edsConfig?.githubAuth?.isAuthenticated) {
                return {
                    valid: false,
                    error: 'GitHub authentication required. Please go back and authenticate.',
                };
            }
            return { valid: true };
        },
    });

    /**
     * Update EDS config state
     */
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

    /**
     * Handle switching to create new mode
     */
    const handleCreateNew = useCallback(() => {
        // Clear existing repo selection and repo name (start fresh)
        updateEdsConfig({
            repoMode: 'new',
            repoName: '', // Clear so user enters a new name
            selectedRepo: undefined,
            existingRepo: undefined,
            existingRepoVerified: undefined,
            resetToTemplate: false,
            createdRepo: undefined, // Clear any previously created repo
        });
        // Reset local creation state
        setRepoCreationState({ isCreating: false, isCreated: false });
        setGitHubAppStatus({ isChecking: false, isInstalled: null });
        setIsModalDismissed(false);
        lastCheckedRepo.current = null;
    }, [updateEdsConfig]);

    /**
     * Handle switching to use existing mode
     */
    const handleUseExisting = useCallback(() => {
        // Clear new repo state
        updateEdsConfig({
            repoMode: 'existing',
            createdRepo: undefined, // Clear any previously created repo
        });
        // Reset local creation state
        setRepoCreationState({ isCreating: false, isCreated: false });
        setGitHubAppStatus({ isChecking: false, isInstalled: null });
        setIsModalDismissed(false);
        lastCheckedRepo.current = null;
    }, [updateEdsConfig]);

    /**
     * Handle reset to template checkbox change
     */
    const handleResetToTemplateChange = useCallback((isSelected: boolean) => {
        updateEdsConfig({ resetToTemplate: isSelected });
    }, [updateEdsConfig]);

    /**
     * Handle repository name change
     * Normalizes input for consistent repo naming
     */
    const handleRepoNameChange = useCallback((value: string) => {
        // Normalize the input for consistent repo naming
        const normalized = normalizeRepositoryName(value);
        updateEdsConfig({ repoName: normalized });

        // Validate and show error if needed
        const error = getRepositoryNameError(normalized);
        setRepoNameError(error);
    }, [updateEdsConfig]);

    /**
     * Validate repository name on blur
     */
    const handleRepoNameBlur = useCallback(() => {
        const error = getRepositoryNameError(repoName);
        setRepoNameError(error);
    }, [repoName]);

    /**
     * Check GitHub App installation for a repository
     * @param lenient - If true, accepts non-404 as installed (for post-install verification)
     *                  If false (default), requires 200 status (strict verification)
     */
    const checkGitHubApp = useCallback(async (owner: string, repo: string, lenient = false) => {
        const repoKey = `${owner}/${repo}`;

        // Skip if same repo already checked with same mode
        // Allow recheck if switching from strict to lenient (user clicked "Check Again")
        if (lastCheckedRepo.current === repoKey && !lenient) {
            return;
        }

        lastCheckedRepo.current = repoKey;

        try {
            const result = await webviewClient.request<{
                success: boolean;
                isInstalled: boolean;
                codeStatus?: number;
                installUrl?: string;
                error?: string;
            }>('check-github-app', { owner, repo, lenient });

            if (result.success) {
                setGitHubAppStatus({
                    isChecking: false,
                    isInstalled: result.isInstalled,
                    codeStatus: result.codeStatus,
                    installUrl: result.installUrl,
                });
            } else {
                setGitHubAppStatus({
                    isChecking: false,
                    isInstalled: false,
                    codeStatus: result.codeStatus,
                    error: result.error || 'Failed to check GitHub App status',
                });
            }
        } catch (error) {
            console.error('[GitHub App] Check failed:', error);
            setGitHubAppStatus({
                isChecking: false,
                isInstalled: false,
                error: (error as Error).message,
            });
        } finally {
            setIsRechecking(false);
        }
    }, []);

    /**
     * Create a new GitHub repository from template
     * Called when user clicks "Create" button
     */
    const handleCreateRepository = useCallback(async () => {
        // Validate template config is available
        const templateOwner = edsConfig?.templateOwner;
        const templateRepo = edsConfig?.templateRepo;

        if (!templateOwner || !templateRepo) {
            setRepoCreationState({
                isCreating: false,
                isCreated: false,
                error: 'Template configuration not available. Please check your stack settings.',
            });
            return;
        }

        if (!repoName || !isValidRepositoryName(repoName)) {
            setRepoNameError(getRepositoryNameError(repoName));
            return;
        }

        // Start creation
        setRepoCreationState({ isCreating: true, isCreated: false });
        setRepoNameError(undefined);

        try {
            const result = await webviewClient.request<{
                success: boolean;
                data?: {
                    owner: string;
                    name: string;
                    url: string;
                    fullName: string;
                };
                error?: string;
            }>('create-github-repo', {
                repoName,
                templateOwner,
                templateRepo,
                isPrivate: false,
            });

            if (result.success && result.data) {
                // Repository created successfully
                const createdRepo = result.data;

                // Store the created repo info in state
                updateEdsConfig({
                    createdRepo: {
                        owner: createdRepo.owner,
                        name: createdRepo.name,
                        url: createdRepo.url,
                        fullName: createdRepo.fullName,
                    },
                });

                setRepoCreationState({ isCreating: false, isCreated: true });

                // For newly created repos from template, the GitHub App is NEVER pre-installed.
                // Skip the automatic check (which can return stale cached data from a previously
                // deleted repo with the same name) and directly show "not installed" status.
                // User must install the app and click "Check Again" to verify.
                setGitHubAppStatus({
                    isChecking: false,
                    isInstalled: false,
                    installUrl: `https://github.com/apps/aem-code-sync/installations/select_target`,
                });
            } else {
                throw new Error(result.error || 'Failed to create repository');
            }
        } catch (error) {
            console.error('[GitHub Repo] Creation failed:', error);
            setRepoCreationState({
                isCreating: false,
                isCreated: false,
                error: (error as Error).message,
            });
        }
    }, [repoName, edsConfig?.templateOwner, edsConfig?.templateRepo, updateEdsConfig, checkGitHubApp]);

    /**
     * Handle "Check Again" button click from within the modal
     * Uses lenient mode since user just completed installation
     */
    const handleCheckAgain = useCallback(() => {
        // For new repos, use the created repo info; for existing repos, use selected repo
        let owner: string | undefined;
        let repo: string | undefined;

        if (repoMode === 'new' && edsConfig?.createdRepo) {
            owner = edsConfig.createdRepo.owner;
            repo = edsConfig.createdRepo.name;
        } else if (repoMode === 'existing' && selectedRepo) {
            owner = selectedRepo.fullName.split('/')[0];
            repo = selectedRepo.name;
        }

        if (owner && repo) {
            setIsRechecking(true);
            setGitHubAppStatus({
                isChecking: true,
                isInstalled: null,
            });
            // Use lenient mode - accepts non-404 since user just installed the app
            checkGitHubApp(owner, repo, true);
        }
    }, [repoMode, edsConfig?.createdRepo, selectedRepo, checkGitHubApp]);

    /**
     * Open GitHub App installation page
     */
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

    // Check GitHub App when EXISTING repo is selected
    // Skip check for NEW repos - the repo doesn't exist yet, so app can't be installed
    useEffect(() => {
        // Only check for existing repos - new repos don't exist yet
        if (repoMode === 'existing' && selectedRepo) {
            // Extract owner from fullName (e.g., "owner/repo" -> "owner")
            // Don't use githubUser.login - repo may belong to an org
            const owner = selectedRepo.fullName.split('/')[0];

            // Reset state immediately when repo changes to prevent stale state flash
            setIsModalDismissed(false);
            setGitHubAppStatus({
                isChecking: true,
                isInstalled: null,
            });
            checkGitHubApp(owner, selectedRepo.name);
        } else {
            // Reset status for new repos or when no repo selected
            setGitHubAppStatus({
                isChecking: false,
                isInstalled: null,
            });
            setIsModalDismissed(false);
            lastCheckedRepo.current = null;
        }
    }, [repoMode, selectedRepo, checkGitHubApp]);

    // Update canProceed based on selection AND GitHub App status
    useEffect(() => {
        const appVerified = githubAppStatus.isInstalled === true;
        const isCheckingApp = githubAppStatus.isChecking;
        const isCreatingRepo = repoCreationState.isCreating;

        if (repoMode === 'new') {
            // New repos: require repo to be created AND app verified
            // User must click "Create" first, then wait for app installation
            const isRepoCreated = repoCreationState.isCreated;
            setCanProceed(isRepoCreated && appVerified && !isCheckingApp && !isCreatingRepo);
        } else {
            // Existing repos: require repo selection AND app verification
            const isExistingValid = !!selectedRepo;
            setCanProceed(isExistingValid && appVerified && !isCheckingApp);
        }
    }, [repoMode, repoCreationState, selectedRepo, githubAppStatus, setCanProceed]);

    // Derived state for showing reset option (extracted per SOP to avoid long boolean chain in JSX)
    const shouldShowResetOption = selectedRepo && hasLoadedOnce && !isLoading;

    // Left column: Repository selection
    const leftContent = (
        <>
            {/* Create New Repository mode */}
            {repoMode === 'new' && (
                <View
                    backgroundColor="gray-50"
                    borderRadius="medium"
                    padding="size-300"
                >
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-200">
                        <Heading level={3} margin={0}>Create New Repository</Heading>
                        <Flex gap="size-100">
                            {/* Create button */}
                            {!repoCreationState.isCreated && (
                                <Button
                                    variant="accent"
                                    onPress={handleCreateRepository}
                                    isDisabled={
                                        !repoName ||
                                        !isValidRepositoryName(repoName) ||
                                        repoCreationState.isCreating ||
                                        !edsConfig?.templateOwner ||
                                        !edsConfig?.templateRepo
                                    }
                                >
                                    Create
                                </Button>
                            )}
                            <Button variant="secondary" onPress={handleUseExisting}>
                                Browse
                            </Button>
                        </Flex>
                    </Flex>

                    <TextField
                        label="Repository Name"
                        value={repoName}
                        onChange={handleRepoNameChange}
                        onBlur={handleRepoNameBlur}
                        validationState={repoNameError || repoCreationState.error ? 'invalid' : undefined}
                        errorMessage={repoNameError || repoCreationState.error}
                        placeholder="my-eds-project"
                        description={githubUser ? `Will be created as ${githubUser.login}/${repoName || 'my-eds-project'}` : 'Name for your new GitHub repository'}
                        width="100%"
                        isRequired
                        autoFocus
                        isDisabled={repoCreationState.isCreated || repoCreationState.isCreating}
                    />

                    {/* Loading overlay while creating */}
                    <LoadingOverlay isVisible={repoCreationState.isCreating} />
                </View>
            )}

            {/* Use Existing Repository mode */}
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

                    {/* Reset to template option - only show when repo is selected and initial load complete */}
                    {shouldShowResetOption && (
                        <Flex direction="column" gap="size-100" marginTop="size-300">
                            <Checkbox
                                isSelected={resetToTemplate}
                                onChange={handleResetToTemplateChange}
                            >
                                Reset to template (replaces all content)
                            </Checkbox>

                            {/* Warning notice - fixed height container prevents layout jump */}
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
                    )}
                </>
            )}

            {/* GitHub App Status Section - shows for EXISTING repos OR NEW repos after creation */}
            {(() => {
                // Determine if we should show the modal based on repo mode
                const isExistingWithSelection = repoMode === 'existing' && !!selectedRepo;
                const isNewWithCreatedRepo = repoMode === 'new' && repoCreationState.isCreated && !!edsConfig?.createdRepo;

                // Only show for repos that need app verification
                if (!isExistingWithSelection && !isNewWithCreatedRepo) return null;

                // Success state: no banner needed - status shown in Configuration Summary panel
                if (githubAppStatus.isInstalled === true) {
                    return null;
                }

                // Show modal when not installed OR when rechecking (unless dismissed)
                if ((githubAppStatus.isInstalled === false || isRechecking) && !isModalDismissed) {
                    // Get owner/repo for display
                    let owner: string;
                    let repo: string;

                    if (isNewWithCreatedRepo && edsConfig?.createdRepo) {
                        owner = edsConfig.createdRepo.owner;
                        repo = edsConfig.createdRepo.name;
                    } else if (selectedRepo) {
                        owner = selectedRepo.fullName.split('/')[0];
                        repo = selectedRepo.name;
                    } else {
                        return null;
                    }

                    const handleDismiss = () => {
                        setIsModalDismissed(true);
                    };

                    return (
                        <DialogTrigger type="modal" isOpen={true} onOpenChange={(isOpen) => { if (!isOpen) handleDismiss(); }}>
                            {/* Hidden trigger - modal auto-opens */}
                            <ActionButton isHidden>Open</ActionButton>
                            {() => (
                                <Modal
                                    title="Install GitHub App"
                                    actionButtons={
                                        isRechecking
                                            ? [] // Hide buttons while rechecking
                                            : [
                                                { label: 'Check Again', variant: 'secondary', onPress: handleCheckAgain },
                                                { label: 'Install App', variant: 'accent', onPress: handleOpenInstallPage },
                                            ]
                                    }
                                    onClose={handleDismiss}
                                >
                                    {/* Fixed height container prevents modal resize during recheck */}
                                    <div style={{ minHeight: '220px' }}>
                                        {isRechecking ? (
                                            <LoadingDisplay message="Checking installation status..." />
                                        ) : (
                                            <NumberedInstructions
                                                instructions={[
                                                    {
                                                        step: 'Click "Install App"',
                                                        details: 'Opens the AEM Code Sync GitHub App page',
                                                    },
                                                    {
                                                        step: 'Configure the app',
                                                        details: `Click "Configure", sign in if prompted, then click "Configure" next to "${owner}"`,
                                                    },
                                                    {
                                                        step: 'Grant repository access',
                                                        details: `Select "Only select repositories", search for "${repo}", and click the green "Save" button`,
                                                    },
                                                    {
                                                        step: 'Return here and click "Check Again"',
                                                        details: 'We\'ll verify the installation completed',
                                                    },
                                                ]}
                                            />
                                        )}
                                    </div>
                                </Modal>
                            )}
                        </DialogTrigger>
                    );
                }

                return null;
            })()}
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

    // Show overlay during initial GitHub App check (only for existing repos, not during recheck)
    const isInitialChecking = repoMode === 'existing' && githubAppStatus.isChecking && !isRechecking;

    return (
        <div className="h-full w-full relative">
            <TwoColumnLayout
                leftContent={leftContent}
                rightContent={rightContent}
            />
            <LoadingOverlay
                isVisible={isInitialChecking}
            />
        </div>
    );
}
