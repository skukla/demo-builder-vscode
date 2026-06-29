/**
 * RepoSelectionInline
 *
 * The GitHub repository choose/create + AEM-Code-Sync-install body, re-homed from
 * the former GitHubRepoSelectionStep's TwoColumnLayout into a single column for the
 * StorefrontStep group. It owns the same selection wiring (useSelectionStep, cached
 * repos, new-repo creation, GitHub-App-install gate), but the Storefront area now
 * splits it across TWO sub-steps via the `phase` prop:
 *   - `repository` — the repo pick/create UI
 *   - `code-sync`  — the AEM Code Sync GitHub-App install UI
 *
 * ALL hooks/state/effects run regardless of `phase` (so both validities stay live
 * across the sub-step switch); only the RENDERED body changes. Two independent
 * verdicts flow OUT — `onRepoValidChange` (repo chosen/created) and
 * `onCodeSyncValidChange` (the app gate; existing repos pass) — so the Storefront
 * sections can gate each sub-step separately.
 *
 * @module features/eds/ui/steps/RepoSelectionInline
 */

import { Button, Divider, Text } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
    GitHubAppInstallModal,
    NewRepoForm,
    ResetToTemplateOption,
    buildAppStatusFromResult,
    computeCodeSyncValid,
    computeRepoValid,
    pollGitHubAppInstallation,
    type GitHubAppCheckResult,
    type GitHubAppStatus,
    type RepoCreationState,
} from './repoSelectionInline.helpers';
import { SelectionStepContent } from '@/core/ui/components/selection';
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

/** Which part of the repo/code-sync flow to render (validities stay live for both). */
export type RepoSelectionPhase = 'repository' | 'code-sync';

/** Props: state-driven like the parent step, but validity flows OUT to the parent. */
export interface RepoSelectionInlineProps extends Pick<BaseStepProps, 'state' | 'updateState'> {
    /** Which sub-step body to render: the repo pick/create UI or the Code Sync UI. */
    phase: RepoSelectionPhase;
    /** Reports whether the repository choice is valid (WITHOUT the app gate). */
    onRepoValidChange: (valid: boolean) => void;
    /** Reports whether the AEM Code Sync app gate is satisfied (existing repos pass). */
    onCodeSyncValidChange: (valid: boolean) => void;
}

/** Get GitHub App status text for the inline (new-repo) status badge. */
function getGitHubAppStatusText(status: GitHubAppStatus): string {
    if (status.isInstalled === null) return 'Not checked';
    if (status.isInstalled) return 'Verified';
    return status.codeStatus === undefined ? 'Registering...' : 'Not installed';
}

/** Get GitHub App status indicator for the inline (new-repo) status badge. */
function getGitHubAppStatusIndicator(
    status: GitHubAppStatus,
): 'completed' | 'empty' | 'pending' | 'error' {
    if (status.isChecking) return 'pending';
    if (status.isInstalled === true) return 'completed';
    if (status.isInstalled === false && status.codeStatus === undefined) return 'pending';
    if (status.isInstalled === false) return 'error';
    return 'empty';
}

/**
 * RepoSelectionInline Component.
 *
 * @param props - state/updateState, the phase to render, plus the two validity channels
 * @returns The single-column repo choose/create OR code-sync body (per `phase`)
 */
export function RepoSelectionInline({
    state,
    updateState,
    phase,
    onRepoValidChange,
    onCodeSyncValidChange,
}: RepoSelectionInlineProps): React.ReactElement {
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
            existingRepo: undefined,
            resetToTemplate: false, createdRepo: undefined,
            // Names are locked together; clear daLiveSite alongside.
            daLiveSite: '',
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
        // DA.live site name is locked to the GitHub repo name — see backlog
        // 2026-06-08-unify-da-site-and-repo-name for why the dual-identifier
        // model was retired.
        updateEdsConfig({ repoName: normalized, daLiveSite: normalized });
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

    // Validate pre-selected repo exists in loaded repos (for import flow).
    useEffect(() => {
        if (repoMode === 'existing' && selectedRepo && hasLoadedOnce && repos.length > 0) {
            const repoExists = repos.some(repo => repo.id === selectedRepo.id);
            if (!repoExists) {
                updateEdsConfig({
                    selectedRepo: undefined,
                    existingRepo: undefined,
                    repoName: '',
                });
            }
        }
    }, [hasLoadedOnce, repos, selectedRepo, repoMode, updateEdsConfig]);

    // Reset GitHub App status when repo mode changes.
    useEffect(() => {
        setGitHubAppStatus({ isChecking: false, isInstalled: null });
        setIsModalDismissed(false);
        lastCheckedRepo.current = null;
    }, [repoMode, selectedRepo]);

    // Re-check GitHub App when returning with an already-created repo.
    useEffect(() => {
        if (repoMode === 'new' && edsConfig?.createdRepo && githubAppStatus.isInstalled === null) {
            const { owner, name } = edsConfig.createdRepo;
            if (owner && name) {
                checkGitHubApp(owner, name, true);
            }
        }
    }, [repoMode, edsConfig?.createdRepo, githubAppStatus.isInstalled, checkGitHubApp]);

    // Report the repository-choice verdict (WITHOUT the app gate) — runs for both
    // phases so the `repository` sub-step gate stays live while showing `code-sync`.
    useEffect(() => {
        onRepoValidChange(computeRepoValid(repoMode, repoCreationState, selectedRepo, isLoading));
    }, [repoMode, repoCreationState, selectedRepo, isLoading, onRepoValidChange]);

    // Report the Code-Sync app-gate verdict — runs for both phases so the
    // `code-sync` sub-step gate stays live while showing `repository`.
    useEffect(() => {
        onCodeSyncValidChange(computeCodeSyncValid(repoMode, githubAppStatus, selectedRepo));
    }, [repoMode, githubAppStatus, selectedRepo, onCodeSyncValidChange]);

    // Derived state for showing reset option.
    const shouldShowResetOption = selectedRepo && hasLoadedOnce && !isLoading;
    const templateAvailable = !!(edsConfig?.templateOwner && edsConfig?.templateRepo);
    const showNewRepoStatus = repoMode === 'new' && repoCreationState.isCreated;

    // --- `repository` phase: pick/create the repo (no app-install UI) ---------
    if (phase === 'repository') {
        return (
            <div className="w-full relative">
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
            </div>
        );
    }

    // --- `code-sync` phase: AEM Code Sync app install (NEW repos only) --------
    // The `code-sync` sub-step is omitted entirely for an existing repo (its app gate
    // is deferred to StorefrontSetup after the fstab.yaml push — see storefrontSectionOrder),
    // so this phase only renders for a new repo.
    return (
        <div className="w-full relative">
            {showNewRepoStatus && (
                <>
                    <Divider size="S" marginTop="size-300" marginBottom="size-200" />
                    <StatusSection
                        label="AEM Code Sync App"
                        value={getGitHubAppStatusText(githubAppStatus)}
                        status={getGitHubAppStatusIndicator(githubAppStatus)}
                        emptyText="Installation required"
                    />
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
        </div>
    );
}
