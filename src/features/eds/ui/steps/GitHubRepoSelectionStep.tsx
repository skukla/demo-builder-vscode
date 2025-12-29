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
 *
 * Uses the shared useSelectionStep hook and SelectionStepContent component.
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
    Button,
    Checkbox,
    Divider,
    Flex,
    Heading,
    Text,
    TextField,
    View,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Info from '@spectrum-icons/workflow/Info';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import {
    isValidRepositoryName,
    getRepositoryNameError,
    normalizeRepositoryName,
} from '@/core/validation/normalizers';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { useSelectionStep } from '@/core/ui/hooks';
import type { GitHubRepoItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/**
 * StatusSection - Reusable status display section (matches ConfigurationSummary pattern)
 */
interface StatusSectionProps {
    label: string;
    value?: string;
    status: 'completed' | 'pending' | 'empty';
    emptyText?: string;
}

function StatusSection({ label, value, status, emptyText = 'Not selected' }: StatusSectionProps) {
    const renderIcon = () => {
        switch (status) {
            case 'completed':
                return <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />;
            default:
                return null;
        }
    };

    const renderContent = () => {
        if (status === 'empty') {
            return <Text UNSAFE_className="text-sm text-gray-600">{emptyText}</Text>;
        }

        return (
            <Flex gap="size-100" alignItems="center">
                {renderIcon()}
                <Text UNSAFE_className="text-sm">{value}</Text>
            </Flex>
        );
    };

    return (
        <View marginTop="size-200" marginBottom="size-200">
            <Text UNSAFE_className="text-xs font-semibold text-gray-700 text-uppercase letter-spacing-05">
                {label}
            </Text>
            <View marginTop="size-100">
                {renderContent()}
            </View>
        </View>
    );
}

/**
 * GitHubConfigurationSummary - Right column summary for GitHub selection
 */
interface GitHubConfigurationSummaryProps {
    githubUser?: { login: string };
    selectedRepo?: GitHubRepoItem;
    repoMode: 'new' | 'existing';
    repoName: string;
}

function GitHubConfigurationSummary({
    githubUser,
    selectedRepo,
    repoMode,
    repoName,
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

            <style>{`
                .text-uppercase { text-transform: uppercase; }
                .letter-spacing-05 { letter-spacing: 0.05em; }
                .font-semibold { font-weight: 600; }
                .text-xs { font-size: 0.75rem; }
                .text-sm { font-size: 0.875rem; }
                .text-gray-600 { color: var(--spectrum-global-color-gray-600); }
                .text-gray-700 { color: var(--spectrum-global-color-gray-700); }
                .text-green-600 { color: var(--spectrum-global-color-green-600); }
                .text-orange-500 { color: var(--spectrum-global-color-orange-500); }
                .text-orange-600 { color: var(--spectrum-global-color-orange-600); }
            `}</style>
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

    // Update canProceed based on selection
    useEffect(() => {
        const isNewValid = repoMode === 'new' && repoName.trim() !== '' && isValidRepositoryName(repoName);
        const isExistingValid = repoMode === 'existing' && !!selectedRepo;
        setCanProceed(isNewValid || isExistingValid);
    }, [repoMode, repoName, selectedRepo, setCanProceed]);

    // Left column: Repository selection
    const leftContent = (
        <>
            {/* Create New Repository mode */}
            {repoMode === 'new' && (
                <>
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-300">
                        <Heading level={2}>New Repository</Heading>
                        <Button variant="secondary" onPress={handleUseExisting}>
                            Use Existing
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
                            <Info size="S" UNSAFE_className="text-blue-500" />
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
                            heading: githubUser?.login
                                ? `Repositories for ${githubUser.login}`
                                : 'Select Repository',
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

                    {/* Reset to template option - only show when repo is selected */}
                    {selectedRepo && (
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

            <style>{`
                .font-medium { font-weight: 500; }
                .text-sm { font-size: 0.875rem; }
                .text-xs { font-size: 0.75rem; }
                .text-gray-400 { color: var(--spectrum-global-color-gray-400); }
                .text-gray-600 { color: var(--spectrum-global-color-gray-600); }
                .text-green-600 { color: var(--spectrum-global-color-green-600); }
                .text-blue-500 { color: var(--spectrum-global-color-blue-500); }
                .text-orange-500 { color: var(--spectrum-global-color-orange-500); }
                .flex-shrink-0 { flex-shrink: 0; }

                /* Repository list item styling */
                .repo-private-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 1px 6px;
                    margin-right: 6px;
                    background: var(--spectrum-global-color-gray-200);
                    border-radius: 4px;
                    font-size: 0.6875rem;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }
                .repo-no-description {
                    font-style: italic;
                }

                /* Reset Warning - Simple fade transition */
                .reset-warning-visible {
                    opacity: 1;
                    transition: opacity 0.15s ease-out;
                }
                .reset-warning-hidden {
                    opacity: 0;
                    transition: opacity 0.15s ease-out;
                }
            `}</style>
        </>
    );

    // Right column: Configuration Summary
    const rightContent = (
        <GitHubConfigurationSummary
            githubUser={githubUser}
            selectedRepo={selectedRepo}
            repoMode={repoMode}
            repoName={repoName}
        />
    );

    return (
        <TwoColumnLayout
            leftContent={leftContent}
            rightContent={rightContent}
        />
    );
}
