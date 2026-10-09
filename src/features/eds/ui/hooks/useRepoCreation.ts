/**
 * useRepoCreation
 *
 * The create-a-repository half of the Storefront area's repository picker: the
 * name the SC types and the GitHub name derived from it, the name error, and the
 * creation request and its state. The picker (`RepoSelectionInline`) owns the
 * two mode switches (New and Browse) and renders this through `NewRepoForm`.
 *
 * @module features/eds/ui/hooks/useRepoCreation
 */

import { useCallback, useState } from 'react';
import { edsConfigStringDefaults, type WizardEdsConfig } from '../helpers/edsConfigDefaults';
import type { RepoCreationState } from '../steps/repoSelectionInline.helpers';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import {
    isValidRepositoryName,
    getRepositoryNameError,
    normalizeRepositoryName,
} from '@/core/validation/normalizers';
import type { GitHubRepoItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/** What the picker hands in. */
export interface UseRepoCreationOptions extends Pick<BaseStepProps, 'state' | 'updateState'> {
    /** Merge a patch into edsConfig; the picker owns it because its other handlers use it too. */
    updateEdsConfig: (updates: Partial<WizardEdsConfig>) => void;
    /** The stored GitHub name (`edsConfig.repoName`, '' when absent). */
    repoName: string;
    /** Whether edsConfig already records a created repository. */
    hasCreatedRepo: boolean;
}

/** What the picker renders and wires. */
export interface UseRepoCreationResult {
    repoNameError: string | undefined;
    /** The field's text: what was typed while it still derives the stored name. */
    repoNameInput: string;
    repoCreationState: RepoCreationState;
    /** Forget a created/failed attempt; the picker calls it when it switches mode. */
    resetCreation: () => void;
    handleRepoNameChange: (value: string) => void;
    handleRepoNameBlur: () => void;
    handleCreateRepository: () => Promise<void>;
}

/**
 * Own the new-repository flow for the repository picker.
 *
 * @param options - wizard state, its updater, the edsConfig patcher and two reads of edsConfig
 * @returns the form's values and its handlers
 */
export function useRepoCreation({
    state,
    updateState,
    updateEdsConfig,
    repoName,
    hasCreatedRepo,
}: UseRepoCreationOptions): UseRepoCreationResult {
    const edsConfig = state.edsConfig;

    const [repoNameError, setRepoNameError] = useState<string | undefined>();
    // What the SC typed, kept as typed: the field shows it and the line beneath
    // shows the GitHub name derived from it, as the project-name field does.
    // Normalizing under the cursor turned "Kukla Just Rite" into
    // "kukla-just-rite" mid-word. The typed text is shown only while it still
    // derives the stored name, so a name set from anywhere else wins.
    const [typedRepoName, setTypedRepoName] = useState(repoName);
    const repoNameInput =
        normalizeRepositoryName(typedRepoName) === repoName ? typedRepoName : repoName;
    const [repoCreationState, setRepoCreationState] = useState<RepoCreationState>({
        isCreating: false,
        isCreated: hasCreatedRepo,
    });

    const resetCreation = useCallback(() => {
        setRepoCreationState({ isCreating: false, isCreated: false });
    }, []);

    const handleRepoNameChange = useCallback(
        (value: string) => {
            setTypedRepoName(value);
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
            // Now the list shows it selected, and the readiness check runs for it the
            // way it runs for any selected repository.
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
                    // Names are locked together (see the picker's onSelect).
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

    return {
        repoNameError,
        repoNameInput,
        repoCreationState,
        resetCreation,
        handleRepoNameChange,
        handleRepoNameBlur,
        handleCreateRepository,
    };
}
