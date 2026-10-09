/**
 * RepoSelectionInline
 *
 * The GitHub repository choose/create body of the Storefront area's Repository sub-step:
 * the cached repository list, new-repo creation (which lands in the list, selected), the
 * reset-to-template choice and the default-branch notice. One verdict flows OUT —
 * `onRepoValidChange` (repo chosen/created) — and gates the sub-step.
 *
 * It no longer asks about AEM Code Sync (removed 2026-09-25). Adobe's status endpoint
 * reports on a SITE, which nothing before setup creates, and GitHub's installation list
 * refuses a user token — so before setup the question has no answer for a new repository,
 * and a step that said "checked later" beside an Install button promised a re-check it
 * could not deliver. Setup asks at the two moments it can be answered and shows the
 * install dialog there (storefrontSetupPhaseHelpers, storefrontSetupPhase3).
 *
 * @module features/eds/ui/steps/RepoSelectionInline
 */

import { Button, Text } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import React, { useEffect, useCallback } from 'react';
import { edsConfigStringDefaults, type WizardEdsConfig } from '../helpers/edsConfigDefaults';
import { useRepoCreation } from '../hooks/useRepoCreation';
import { useRepoReadiness } from '../hooks/useRepoReadiness';
import { DefaultBranchNotice } from './DefaultBranchNotice';
import { NewRepoForm } from './NewRepoForm';
import { computeRepoValid, isJustCreatedSelection } from './repoSelectionInline.helpers';
import { ResetToTemplateOption } from './ResetToTemplateOption';
import { SelectionStepContent } from '@/core/ui/components/selection/SelectionStepContent';
import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import type { GitHubRepoItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';
import '../styles/eds-steps.css';

/** Constant per call site — see PROJECT_SEARCH_FIELDS in AdobeProjectPicker. */
const REPO_SEARCH_FIELDS: ReadonlyArray<keyof GitHubRepoItem> = ['name', 'fullName', 'description'];

/** Props: state-driven like the parent step, but validity flows OUT to the parent. */
export interface RepoSelectionInlineProps extends Pick<BaseStepProps, 'state' | 'updateState'> {
    /** Reports whether the repository choice is valid. */
    onRepoValidChange: (valid: boolean) => void;
}

/**
 * The repo-selection values this component derives from `edsConfig`.
 *
 * Six optional-chain-plus-default reads, lifted out of the component body. They
 * are pure reads of one object and contributed a third of the component's
 * measured complexity while making no decisions of their own — which is exactly
 * the shape that belongs outside a component.
 */
function readRepoSelection(edsConfig: WizardEdsConfig): {
    repoMode: string;
    selectedRepo: GitHubRepoItem | undefined;
    resetToTemplate: boolean;
    // Derived from the state type rather than restated. Written out by hand this
    // was `string | undefined`, which is wrong — it is the auth user OBJECT — and
    // only a consumer passing it straight on made the compiler say so.
    githubUser: NonNullable<NonNullable<WizardEdsConfig>['githubAuth']>['user'];
    repoName: string;
    hasCreatedRepo: boolean;
} {
    return {
        repoMode: edsConfig?.repoMode || 'existing',
        selectedRepo: edsConfig?.selectedRepo,
        resetToTemplate: edsConfig?.resetToTemplate || false,
        githubUser: edsConfig?.githubAuth?.user,
        repoName: edsConfig?.repoName || '',
        hasCreatedRepo: Boolean(edsConfig?.createdRepo),
    };
}

/** True when an existing repo is selected against a loaded, non-empty repo list. */
function isValidExistingRepoSelection(
    repoMode: string,
    selectedRepo: GitHubRepoItem | undefined,
    hasLoadedOnce: boolean,
    repos: GitHubRepoItem[],
): selectedRepo is GitHubRepoItem {
    return repoMode === 'existing' && Boolean(selectedRepo) && hasLoadedOnce && repos.length > 0;
}

/**
 * RepoSelectionInline Component.
 *
 * @param props - state/updateState plus the validity channel
 * @returns The single-column repo choose/create body
 */
export function RepoSelectionInline({
    state,
    updateState,
    onRepoValidChange,
}: RepoSelectionInlineProps): React.ReactElement {
    const edsConfig = state.edsConfig;
    const { repoMode, selectedRepo, resetToTemplate, githubUser, repoName, hasCreatedRepo } =
        readRepoSelection(edsConfig);

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
        searchFields: REPO_SEARCH_FIELDS,
        onSelect: (repo) => {
            updateState({
                edsConfig: {
                    ...edsConfig,
                    ...edsConfigStringDefaults(edsConfig),
                    repoName: repo.name,
                    // DA.live site name is locked to the GitHub repo name —
                    // see backlog 2026-06-08-unify-da-site-and-repo-name for
                    // why the dual-identifier model was retired.
                    daLiveSite: repo.name,
                    repoMode: 'existing',
                    selectedRepo: repo,
                    existingRepo: repo.fullName,
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

    const updateEdsConfig = useCallback(
        (updates: Partial<typeof edsConfig>) => {
            updateState({
                edsConfig: {
                    ...edsConfig,
                    ...edsConfigStringDefaults(edsConfig),
                    ...updates,
                },
            });
        },
        [edsConfig, updateState],
    );

    const {
        repoNameError,
        repoNameInput,
        repoCreationState,
        resetCreation,
        handleRepoNameChange,
        handleRepoNameBlur,
        handleCreateRepository,
    } = useRepoCreation({ state, updateState, updateEdsConfig, repoName, hasCreatedRepo });

    const handleCreateNew = useCallback(() => {
        updateEdsConfig({
            repoMode: 'new',
            repoName: '',
            selectedRepo: undefined,
            existingRepo: undefined,
            resetToTemplate: false,
            createdRepo: undefined,
            // Names are locked together; clear daLiveSite alongside.
            daLiveSite: '',
        });
        resetCreation();
    }, [updateEdsConfig, resetCreation]);

    const handleUseExisting = useCallback(() => {
        updateEdsConfig({ repoMode: 'existing', createdRepo: undefined });
        resetCreation();
    }, [updateEdsConfig, resetCreation]);

    const handleResetToTemplateChange = useCallback(
        (isSelected: boolean) => {
            updateEdsConfig({ resetToTemplate: isSelected });
        },
        [updateEdsConfig],
    );

    // Validate pre-selected repo exists in loaded repos (for import flow).
    useEffect(() => {
        if (isValidExistingRepoSelection(repoMode, selectedRepo, hasLoadedOnce, repos)) {
            const repoExists = repos.some((repo) => repo.id === selectedRepo.id);
            if (!repoExists) {
                updateEdsConfig({
                    selectedRepo: undefined,
                    existingRepo: undefined,
                    repoName: '',
                });
            }
        }
    }, [hasLoadedOnce, repos, selectedRepo, repoMode, updateEdsConfig]);

    // Classify the selected repo so the reset control can ask only when there
    // is something to lose.
    const readiness = useRepoReadiness(repoMode, selectedRepo);

    // Report the repository-choice verdict.
    useEffect(() => {
        onRepoValidChange(
            computeRepoValid(
                repoMode,
                repoCreationState,
                selectedRepo,
                isLoading,
                readiness,
                resetToTemplate,
            ),
        );
    }, [
        repoMode,
        repoCreationState,
        selectedRepo,
        isLoading,
        readiness,
        resetToTemplate,
        onRepoValidChange,
    ]);

    const templateAvailable = !!(edsConfig?.templateOwner && edsConfig?.templateRepo);

    // One predicate, read by the notice AND by the reset control it silences —
    // so they can never disagree about whether this repo is usable.
    const wrongDefaultBranch = Boolean(
        selectedRepo?.defaultBranch && selectedRepo.defaultBranch !== 'main',
    );

    // The selected repository is the one this step just created: the reset-to-template
    // control stays quiet for it, because a fresh copy of the template has nothing to
    // reset. No banner — the selected row is the confirmation (owner, 2026-09-25).
    const justCreatedSelected = isJustCreatedSelection(edsConfig?.createdRepo, selectedRepo);

    return (
        <div className="w-full relative repo-selection-inline">
            {repoMode === 'new' && (
                <NewRepoForm
                    repoName={repoName}
                    repoNameInput={repoNameInput}
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
                    <DefaultBranchNotice selectedRepo={selectedRepo} />
                    {/* Always rendered (disabled until a repo is selected) so selecting one
                        never reflows the search + list below. */}
                    <ResetToTemplateOption
                        resetToTemplate={resetToTemplate}
                        onResetToTemplateChange={handleResetToTemplateChange}
                        disabled={!selectedRepo || justCreatedSelected}
                        readiness={readiness}
                        unusable={wrongDefaultBranch}
                        templateName={state.demo?.name}
                    />
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
                            loadingMessage: 'Loading your repositories',
                            loadingSubMessage: 'Fetching repositories with write access',
                            errorTitle: 'Error Loading Repositories',
                            emptyTitle: 'No Repositories Found',
                            emptyMessage:
                                'No repositories found with write access. Create a new repository to get started.',
                            searchPlaceholder: 'Type to filter repositories',
                            itemNoun: 'repository',
                            itemNounPlural: 'repositories',
                            ariaLabel: 'GitHub Repositories',
                        }}
                        renderDescription={(item) => (
                            <Text slot="description">
                                {item.isPrivate && (
                                    <span className="repo-private-badge">Private</span>
                                )}
                                {item.description || (
                                    <span className="repo-no-description">No description</span>
                                )}
                            </Text>
                        )}
                    />
                </>
            )}
        </div>
    );
}
