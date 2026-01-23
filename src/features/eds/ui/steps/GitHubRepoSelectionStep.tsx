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
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
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
 * GitHubConfigurationSummary - Right column summary for GitHub selection
 */
interface GitHubConfigurationSummaryProps {
    githubUser?: { login: string };
    selectedRepo?: GitHubRepoItem;
    repoMode: 'new' | 'existing';
    repoName: string;
    githubAppStatus: GitHubAppStatus;
}

function GitHubConfigurationSummary({
    githubUser,
    selectedRepo,
    repoMode,
    repoName,
    githubAppStatus,
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

            {/* GitHub App Status - only show for existing repos */}
            {/* New repos skip this - app will be installed after repo creation */}
            {repoMode === 'existing' && isRepoComplete && (
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
        updateEdsConfig({
            repoMode: 'new',
            selectedRepo: undefined,
            existingRepo: undefined,
            existingRepoVerified: undefined,
            resetToTemplate: false,
        });
    }, [updateEdsConfig]);

    /**
     * Handle switching to use existing mode
     */
    const handleUseExisting = useCallback(() => {
        updateEdsConfig({
            repoMode: 'existing',
        });
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

            if (result.data?.success) {
                setGitHubAppStatus({
                    isChecking: false,
                    isInstalled: result.data.isInstalled,
                    codeStatus: result.data.codeStatus,
                    installUrl: result.data.installUrl,
                });
            } else {
                setGitHubAppStatus({
                    isChecking: false,
                    isInstalled: false,
                    codeStatus: result.data?.codeStatus,
                    error: result.data?.error || 'Failed to check GitHub App status',
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
     * Handle "Check Again" button click from within the modal
     * Uses lenient mode since user just completed installation
     */
    const handleCheckAgain = useCallback(() => {
        const owner = githubUser?.login;
        const repo = repoMode === 'new' ? repoName : selectedRepo?.name;

        if (owner && repo) {
            setIsRechecking(true);
            setGitHubAppStatus({
                isChecking: true,
                isInstalled: null,
            });
            // Use lenient mode - accepts non-404 since user just installed the app
            checkGitHubApp(owner, repo, true);
        }
    }, [githubUser?.login, repoMode, repoName, selectedRepo?.name, checkGitHubApp]);

    /**
     * Open GitHub App installation page
     */
    const handleOpenInstallPage = useCallback(() => {
        if (githubAppStatus.installUrl) {
            vscode.postMessage('openExternal', { url: githubAppStatus.installUrl });
        }
    }, [githubAppStatus.installUrl]);

    // Check GitHub App when EXISTING repo is selected
    // Skip check for NEW repos - the repo doesn't exist yet, so app can't be installed
    useEffect(() => {
        const owner = githubUser?.login;
        if (!owner) return;

        // Only check for existing repos - new repos don't exist yet
        if (repoMode === 'existing' && selectedRepo) {
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
    }, [githubUser?.login, repoMode, selectedRepo, checkGitHubApp]);

    // Update canProceed based on selection AND GitHub App status (existing repos only)
    useEffect(() => {
        const isNewValid = repoMode === 'new' && repoName.trim() !== '' && isValidRepositoryName(repoName);
        const isExistingValid = repoMode === 'existing' && !!selectedRepo;

        if (repoMode === 'new') {
            // New repos: just need valid name (app will be installed after repo creation)
            setCanProceed(isNewValid);
        } else {
            // Existing repos: require app verification
            const appVerified = githubAppStatus.isInstalled === true;
            const isCheckingApp = githubAppStatus.isChecking;
            setCanProceed(isExistingValid && appVerified && !isCheckingApp);
        }
    }, [repoMode, repoName, selectedRepo, githubAppStatus, setCanProceed]);

    // Left column: Repository selection
    const leftContent = (
        <>
            {/* Create New Repository mode */}
            {repoMode === 'new' && (
                <>
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-300">
                        <Heading level={2}>New Repository</Heading>
                        <Button variant="secondary" onPress={handleUseExisting}>
                            Browse
                        </Button>
                    </Flex>

                    <TextField
                        label="Repository Name"
                        value={repoName}
                        onChange={handleRepoNameChange}
                        onBlur={handleRepoNameBlur}
                        validationState={repoNameError ? 'invalid' : undefined}
                        errorMessage={repoNameError}
                        placeholder="my-eds-project"
                        description={githubUser ? `Will be created as ${githubUser.login}/${repoName || 'my-eds-project'}` : 'Name for your new GitHub repository'}
                        width="100%"
                        isRequired
                        autoFocus
                    />

                    <View
                        backgroundColor="gray-50"
                        borderRadius="medium"
                        padding="size-200"
                        marginTop="size-300"
                    >
                        <Flex alignItems="center" gap="size-150">
                            <InfoOutline size="S" UNSAFE_className="text-blue-500" />
                            <Text UNSAFE_className="text-sm text-gray-600">
                                Repository will be created from the EDS template with starter content.
                            </Text>
                        </Flex>
                    </View>
                </>
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

                    {/* Reset to template option - only show when repo is selected and not loading */}
                    {selectedRepo && !showLoading && (
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

            {/* GitHub App Status Section - only shows for EXISTING repos */}
            {/* New repos skip this check - app will be installed after repo creation */}
            {(() => {
                // Only show for existing repos with a selection
                if (repoMode !== 'existing' || !selectedRepo) return null;

                // Success state: no banner needed - status shown in Configuration Summary panel
                if (githubAppStatus.isInstalled === true) {
                    return null;
                }

                // Show modal when not installed OR when rechecking (unless dismissed)
                if ((githubAppStatus.isInstalled === false || isRechecking) && !isModalDismissed) {
                    const owner = githubUser?.login || '';
                    const repo = selectedRepo?.name || '';

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
                                    <div style={{ minHeight: '200px' }}>
                                        {isRechecking ? (
                                            <LoadingDisplay message="Checking installation status..." />
                                        ) : (
                                            <NumberedInstructions
                                                instructions={[
                                                    {
                                                        step: 'Click "Install App"',
                                                        details: 'Opens the GitHub app installation page',
                                                    },
                                                    {
                                                        step: `Select "${owner}/${repo}"`,
                                                        details: 'Choose which repositories the app can access',
                                                    },
                                                    {
                                                        step: 'Click "Install" to authorize',
                                                        details: 'The app needs read access for content sync',
                                                    },
                                                    {
                                                        step: 'Click "Check Again"',
                                                        details: 'We\'ll verify the installation',
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
