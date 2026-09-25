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
import React, { useEffect, useCallback, useState } from 'react';
import { edsConfigStringDefaults, type WizardEdsConfig } from '../helpers/edsConfigDefaults';
import {
    NewRepoForm,
    ResetToTemplateOption,
    DefaultBranchNotice,
    computeRepoValid,
    type RepoReadinessState,
    type RepoCreationState,
    isJustCreatedSelection,
} from './repoSelectionInline.helpers';
import { SelectionStepContent } from '@/core/ui/components/selection/SelectionStepContent';
import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import {
    isValidRepositoryName,
    getRepositoryNameError,
    normalizeRepositoryName,
} from '@/core/validation/normalizers';
import type { GitHubRepoItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';
import '../styles/eds-steps.css';


/** Props: state-driven like the parent step, but validity flows OUT to the parent. */
/** Constant per call site — see PROJECT_SEARCH_FIELDS in AdobeProjectPicker. */
const REPO_SEARCH_FIELDS: ReadonlyArray<keyof GitHubRepoItem> = ['name', 'fullName', 'description'];

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

    const [repoNameError, setRepoNameError] = useState<string | undefined>();
    const [repoCreationState, setRepoCreationState] = useState<RepoCreationState>({
        isCreating: false,
        isCreated: hasCreatedRepo,
    });

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

    const resetLocalState = useCallback(() => {
        setRepoCreationState({ isCreating: false, isCreated: false });
    }, []);

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
        resetLocalState();
    }, [updateEdsConfig, resetLocalState]);

    const handleUseExisting = useCallback(() => {
        updateEdsConfig({ repoMode: 'existing', createdRepo: undefined });
        resetLocalState();
    }, [updateEdsConfig, resetLocalState]);

    const handleResetToTemplateChange = useCallback(
        (isSelected: boolean) => {
            updateEdsConfig({ resetToTemplate: isSelected });
        },
        [updateEdsConfig],
    );

    const handleRepoNameChange = useCallback(
        (value: string) => {
            const normalized = normalizeRepositoryName(value);
            // DA.live site name is locked to the GitHub repo name — see backlog
            // 2026-06-08-unify-da-site-and-repo-name for why the dual-identifier
            // model was retired.
            updateEdsConfig({ repoName: normalized, daLiveSite: normalized });
            setRepoNameError(getRepositoryNameError(normalized));
        },
        [updateEdsConfig],
    );

    const handleRepoNameBlur = useCallback(() => {
        setRepoNameError(getRepositoryNameError(repoName));
    }, [repoName]);

    const handleCreateRepository = useCallback(async () => {
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

        setRepoCreationState({ isCreating: true, isCreated: false });
        setRepoNameError(undefined);

        try {
            const result = await webviewClient.request<{
                success: boolean;
                data?: { owner: string; name: string; url: string; fullName: string };
                error?: string;
            }>('create-github-repo', {
                repoName,
                templateOwner,
                templateRepo,
                isPrivate: false,
                // An added demo's source may not be a GitHub template; the handler checks.
                ...(state.demo ? { fromAddedDemo: true } : {}),
            });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to create repository');
            }

            // The new repository becomes the SELECTED repository, in the list, first.
            //
            // It used to stay in the create form's "created" state with `repoMode: 'new'`,
            // and the list — cached in wizard state and fetched only when empty — never
            // heard of it. Coming back to this step meant Browse, then Refresh, then a
            // click, to arrive where creation had already put you (owner, 2026-09-25).
            // Now the list shows it selected, and the Code Sync probe runs for it the way
            // it runs for any selected repository.
            const created: GitHubRepoItem = {
                id: result.data.fullName,
                name: result.data.name,
                owner: result.data.owner,
                fullName: result.data.fullName,
                description: null,
                isPrivate: false,
                htmlUrl: result.data.url,
                defaultBranch: 'main',
                updatedAt: new Date().toISOString(),
            };
            updateState({
                githubReposCache: [
                    created,
                    ...(state.githubReposCache ?? []).filter((repo) => repo.id !== created.id),
                ],
                edsConfig: {
                    ...edsConfig,
                    ...edsConfigStringDefaults(edsConfig),
                    createdRepo: {
                        owner: result.data.owner,
                        name: result.data.name,
                        url: result.data.url,
                        fullName: result.data.fullName,
                    },
                    repoMode: 'existing',
                    selectedRepo: created,
                    existingRepo: created.fullName,
                    repoName: created.name,
                    // Names are locked together (see onSelect above).
                    daLiveSite: created.name,
                    resetToTemplate: false,
                },
            });
            setRepoCreationState({ isCreating: false, isCreated: true });
        } catch (err) {
            console.error('[GitHub Repo] Creation failed:', err);
            setRepoCreationState({
                isCreating: false,
                isCreated: false,
                error: (err as Error).message,
            });
        }
    }, [repoName, edsConfig, state.githubReposCache, state.demo, updateState]);

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

    const [readiness, setReadiness] = useState<RepoReadinessState | undefined>(undefined);

    // Classify the selected repo so the reset control can ask only when there
    // is something to lose. Undefined while in flight — the gate treats that as
    // "do not block", so the step never flickers to invalid mid-check.

    useEffect(() => {
        if (repoMode !== 'existing' || !selectedRepo) {
            setReadiness(undefined);
            return;
        }
        const [owner, name] = selectedRepo.fullName.split('/');
        if (!owner || !name) return;

        let cancelled = false;
        setReadiness(undefined);
        webviewClient
            .request<{ success: boolean; readiness?: RepoReadinessState }>(
                'check-repo-readiness',
                { owner, repo: name },
            )
            .then((result) => {
                // A stale response must not overwrite a newer selection's answer.
                //
                // Fall back to `undetermined` rather than leaving it undefined: a
                // successful response with no `readiness` field would otherwise be
                // indistinguishable from a request still in flight, and the reset
                // control reads that distinction. Matches the catch below.
                if (!cancelled) setReadiness(result?.readiness ?? { kind: 'undetermined' });
            })
            .catch(() => {
                if (!cancelled) setReadiness({ kind: 'undetermined' });
            });
        return () => {
            cancelled = true;
        };
    }, [repoMode, selectedRepo]);

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
