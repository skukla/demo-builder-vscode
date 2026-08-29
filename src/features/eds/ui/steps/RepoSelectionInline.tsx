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

import { Button, Text } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import React, { useEffect, useCallback, useState } from 'react';
import {
    CodeSyncStatusView,
    NewRepoForm,
    ResetToTemplateOption,
    computeCodeSyncValid,
    DefaultBranchNotice,
    computeRepoValid,
    type RepoReadinessState,
    pollGitHubAppInstallation,
    probeRepoCodeSync,
    shouldShowAppStatus,
    type GitHubAppStatus,
    type RepoCreationState,
} from './repoSelectionInline.helpers';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { useSelectionStep } from '@/core/ui/hooks';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
import {
    isValidRepositoryName,
    getRepositoryNameError,
    normalizeRepositoryName,
} from '@/core/validation/normalizers';
import type { GitHubRepoItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';
import { edsConfigStringDefaults, type WizardEdsConfig } from '../helpers/edsConfigDefaults';
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

/** Split `owner/repo`, or undefined when either half is missing. */
function parseRepoFullName(fullName?: string): { owner: string; name: string } | undefined {
    const [owner, name] = (fullName ?? '').split('/');
    return owner && name ? { owner, name } : undefined;
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
    const { repoMode, selectedRepo, resetToTemplate, githubUser, repoName, hasCreatedRepo } =
        readRepoSelection(edsConfig);

    const [repoNameError, setRepoNameError] = useState<string | undefined>();
    const [repoCreationState, setRepoCreationState] = useState<RepoCreationState>({
        isCreating: false,
        isCreated: hasCreatedRepo,
    });
    const [githubAppStatus, setGitHubAppStatus] = useState<GitHubAppStatus>({
        isChecking: false,
        isInstalled: null,
    });
    const [isRechecking, setIsRechecking] = useState(false);
    // Empty, not a generic line. The view falls back to "Verifying owner/repo..."
    // and lets CODE_SYNC_CHECK_STAGES speak once the wait outlives a glance; a
    // non-empty default here outranks both and pinned one static line over a
    // check that can run for three minutes. Set by the retry loop when it has
    // something specific to say ("attempt 2 of 5"), which still wins.
    const [recheckMessage, setRecheckMessage] = useState('');

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
        setGitHubAppStatus({ isChecking: false, isInstalled: null });
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
            }>('create-github-repo', { repoName, templateOwner, templateRepo, isPrivate: false });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to create repository');
            }

            updateEdsConfig({
                createdRepo: {
                    owner: result.data.owner,
                    name: result.data.name,
                    url: result.data.url,
                    fullName: result.data.fullName,
                },
            });
            setRepoCreationState({ isCreating: false, isCreated: true });

            // NOT ASKED YET — and say exactly that, nothing more.
            //
            // This used to assert `{isInstalled: false}` with no `codeStatus`, which
            // `resolveCodeSyncView` reads as "Adobe was asked and did not answer": a
            // claim about a request that never happened. It also silently disabled
            // the recovery below — the "re-check when returning with an already
            // created repo" effect fires only on `isInstalled === null`, so the
            // fabricated `false` was what kept it from ever running.
            //
            // `null` is the honest value AND the one that arms that effect. Do not
            // start a second check here: one poller is enough, and two produced the
            // interleaved duplicate checks seen on 2026-08-17, each triggering its
            // own Helix code sync.
            setGitHubAppStatus({ isChecking: false, isInstalled: null });
        } catch (err) {
            console.error('[GitHub Repo] Creation failed:', err);
            setRepoCreationState({
                isCreating: false,
                isCreated: false,
                error: (err as Error).message,
            });
        }
    }, [repoName, edsConfig?.templateOwner, edsConfig?.templateRepo, updateEdsConfig]);

    const handleCheckAgain = useCallback(async () => {
        // Both repo modes. This gate used to require a freshly CREATED repo, so
        // the only re-check affordance was inert for an existing one — which,
        // with the install flow also gated on `new`, left a selected repo whose
        // app was missing blocked with nothing to press.
        const target = edsConfig?.createdRepo
            ? { owner: edsConfig.createdRepo.owner, name: edsConfig.createdRepo.name }
            : parseRepoFullName(selectedRepo?.fullName);
        if (!target) return;

        setIsRechecking(true);
        // Clear, so a stale "attempt 2 of 5" from the previous run does not
        // outrank this run's elapsed-wait copy.
        setRecheckMessage('');
        setGitHubAppStatus({ isChecking: true, isInstalled: null });

        const { status } = await pollGitHubAppInstallation(
            target.owner,
            target.name,
            setRecheckMessage,
        );

        setGitHubAppStatus(status);
        setIsRechecking(false);
    }, [edsConfig?.createdRepo, selectedRepo?.fullName]);

    const handleOpenInstallPage = useCallback(() => {
        if (githubAppStatus.installUrl) {
            vscode.postMessage('openExternal', { url: githubAppStatus.installUrl });
        }
    }, [githubAppStatus.installUrl]);


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

    // Reset GitHub App status when repo mode changes.
    useEffect(() => {
        setGitHubAppStatus({ isChecking: false, isInstalled: null });
    }, [repoMode, selectedRepo]);

    const [readiness, setReadiness] = useState<RepoReadinessState | undefined>(undefined);

    // Helix has a SITE only for a repo with storefront content. Without one,
    // `admin.hlx.page/status` answers `404 no such site` whatever AEM Code Sync
    // is doing — so the App question is unanswerable here, not merely
    // unanswered, and asking it produces an install prompt aimed at people who
    // already have it installed. `empty` counts too: nothing to register either.
    // `undetermined` does NOT — we failed to read the repo, which says nothing
    // about whether it is a storefront, so the check still gets its turn.
    const siteNotPossibleYet =
        readiness?.kind === 'not-a-storefront' || readiness?.kind === 'empty';

    // Check Code Sync as soon as an EXISTING repo is picked, not mid-pipeline.
    //
    // The mid-pipeline gate sits after fstab, block collection, smart-404 and
    // quick-edit have written to the repo, so a user missing the App learned about
    // it only once their repository had been modified. `skipTrigger` keeps this
    // fast: a repo Helix has never indexed 404s, and the default path answers that
    // by triggering a code sync and polling for up to three minutes — fine there,
    // unusable behind a Continue button.
    useEffect(() => {
        if (repoMode !== 'existing' || !selectedRepo) return;
        // Wait for readiness, then skip entirely when the repo cannot have a
        // site yet. Probing anyway costs a round trip to be told nothing, and
        // -- on the "Check Again" path -- fires a code-sync trigger against the
        // user's repo that we measured accomplishes nothing in this state.
        if (readiness === undefined || siteNotPossibleYet) return;
        const [owner, name] = (selectedRepo.fullName ?? '').split('/');
        if (!owner || !name) return;
        void probeRepoCodeSync(owner, name, setGitHubAppStatus);
    }, [repoMode, selectedRepo, readiness, siteNotPossibleYet]);

    // Check the App for a created repo — both on returning to the step and right
    // after creation, which leaves `isInstalled: null` precisely to arm this.
    useEffect(() => {
        if (repoMode === 'new' && edsConfig?.createdRepo && githubAppStatus.isInstalled === null) {
            const { owner, name } = edsConfig.createdRepo;
            if (owner && name) {
                void probeRepoCodeSync(owner, name, setGitHubAppStatus);
            }
        }
    }, [repoMode, edsConfig?.createdRepo, githubAppStatus.isInstalled]);

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
                // indistinguishable from a request still in flight, and the Code
                // Sync probe waits on exactly that distinction. Undefined has to
                // mean "still asking" or the probe never fires at all. Matches what
                // the catch below already does for a failed request.
                if (!cancelled) setReadiness(result?.readiness ?? { kind: 'undetermined' });
            })
            .catch(() => {
                if (!cancelled) setReadiness({ kind: 'undetermined' });
            });
        return () => {
            cancelled = true;
        };
    }, [repoMode, selectedRepo]);

    // Report the repository-choice verdict (WITHOUT the app gate) — runs for both
    // phases so the `repository` sub-step gate stays live while showing `code-sync`.
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

    // Report the Code-Sync app-gate verdict — runs for both phases so the
    // `code-sync` sub-step gate stays live while showing `repository`.
    useEffect(() => {
        onCodeSyncValidChange(
            computeCodeSyncValid(repoMode, githubAppStatus, selectedRepo),
        );
    }, [repoMode, githubAppStatus, selectedRepo, onCodeSyncValidChange]);

    const templateAvailable = !!(edsConfig?.templateOwner && edsConfig?.templateRepo);
    const showAppStatus = shouldShowAppStatus(
        repoMode,
        repoCreationState.isCreated,
        !!selectedRepo,
    );

    // One predicate, read by the notice AND by the reset control it silences —
    // so they can never disagree about whether this repo is usable.
    const wrongDefaultBranch = Boolean(
        selectedRepo?.defaultBranch && selectedRepo.defaultBranch !== 'main',
    );

    // --- `repository` phase: pick/create the repo (no app-install UI) ---------
    if (phase === 'repository') {
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
                            disabled={!selectedRepo}
                            readiness={readiness}
                            unusable={wrongDefaultBranch}
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
                                loadingMessage: 'Loading your repositories...',
                                loadingSubMessage: 'Fetching repositories with write access',
                                errorTitle: 'Error Loading Repositories',
                                emptyTitle: 'No Repositories Found',
                                emptyMessage:
                                    'No repositories found with write access. Create a new repository to get started.',
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

    // --- `code-sync` phase: AEM Code Sync app install -------------------------
    // Present for BOTH repo modes since 2026-08-06 (see storefrontSectionOrder). The
    // existing-repo gate used to be deferred to StorefrontSetup, after the pipeline
    // had written to the repo; it now runs at selection.

    return (
        // `flex-1 flex-column` claims the pane's full height from `.step-view-anim`,
        // which is what lets CodeSyncStatusView centre in it rather than sit at the top.
        <div className="w-full relative flex-1 flex-column">
            {showAppStatus && (
                <CodeSyncStatusView
                    siteNotPossibleYet={siteNotPossibleYet}
                    createdRepo={edsConfig?.createdRepo}
                    selectedRepoFullName={selectedRepo?.fullName}
                    status={githubAppStatus}
                    isRechecking={isRechecking}
                    recheckMessage={recheckMessage}
                    onCheckAgain={handleCheckAgain}
                    onOpenInstallPage={handleOpenInstallPage}
                />
            )}
        </div>
    );
}
