/**
 * RepoSelectionInline helpers
 *
 * The pure verdicts behind the repository picker: is the repository choice valid,
 * is the selection the repo this step just created, and how should the
 * reset-to-template control present itself. No markup lives here — the form,
 * the reset control and the default-branch notice each have a file of their own
 * (`NewRepoForm`, `ResetToTemplateOption`, `DefaultBranchNotice`).
 *
 * @module features/eds/ui/steps/repoSelectionInline.helpers
 */

import type { GitHubRepoItem } from '@/types/webview';

/** Repository creation state tracking. */
export interface RepoCreationState {
    isCreating: boolean;
    isCreated: boolean;
    error?: string;
}

/**
 * Repo readiness as the UI holds it: the classifier's verdict, or undefined
 * while the check is still in flight. Undefined must read as "do not block" —
 * the step would otherwise flicker to invalid on every selection.
 */
export type RepoReadinessState =
    | { kind: 'empty' }
    | { kind: 'storefront' }
    | { kind: 'not-a-storefront'; missing: string[] }
    | { kind: 'undetermined'; reason?: string };

/**
 * Compute whether the REPOSITORY choice is valid (repo picked/created), WITHOUT
 * the AEM-Code-Sync app gate. This is the `repository` sub-step's verdict:
 * - new:      created and not mid-creation
 * - existing: a repo is selected and not loading
 */
export function computeRepoValid(
    repoMode: string,
    repoCreationState: RepoCreationState,
    selectedRepo: GitHubRepoItem | undefined,
    isLoading: boolean,
    readiness?: RepoReadinessState,
    resetToTemplate?: boolean,
): boolean {
    if (repoMode === 'new') {
        return repoCreationState.isCreated && !repoCreationState.isCreating;
    }
    if (!selectedRepo || isLoading) return false;

    // A non-`main` default branch does NOT block. It is surfaced as a warning at
    // the point of choice instead (`RepoSelectionInline`), because the reason to
    // care has moved three times in one session and a block needs a settled
    // justification that a warning does not. What is settled: our seven
    // `main--{repo}--{owner}` URL builders and the reset's
    // `git clone --branch main` both assume it, so such a repo will not work —
    // but the user, not our inference, gets to make that call.
    // See `.rptc/backlog/2026-08-20-storefront-branch-is-hardcoded-main.md`.

    // A populated repo that is not a storefront cannot complete setup: the
    // steps that need scripts/scripts.js and scripts/delayed.js skip
    // themselves, and the run still reports Complete. Reset is the remedy, so
    // it is required rather than offered.
    //
    // Only this state blocks. `empty` is auto-reset (nothing to lose),
    // `storefront` is the normal case, and `undetermined` must not stop setup
    // over a GitHub blip — it withholds the destructive default, not the user's
    // ability to continue.
    if (readiness?.kind === 'not-a-storefront') return resetToTemplate === true;

    return true;
}

/**
 * Is the selected repository the one this step just created? The reset-to-template
 * control stays quiet for it — a fresh copy of the template has nothing to reset.
 * Module-level for the same reason as its neighbours: one more predicate inline
 * pushed RepoSelectionInline past the complexity limit.
 *
 * @param createdRepo - what creation recorded, if anything
 * @param selectedRepo - the list's current selection
 */
export function isJustCreatedSelection(
    createdRepo: { fullName: string } | undefined,
    selectedRepo: GitHubRepoItem | undefined,
): boolean {
    return Boolean(createdRepo && selectedRepo && createdRepo.fullName === selectedRepo.fullName);
}

/**
 * Decide the reset control's appearance from what the repo actually contains.
 *
 * The control stays rendered in every state — including its notice row — so the
 * layout never reflows as readiness resolves. That was already true of the
 * warning row and is worth keeping: a step that jumps as you look at it reads
 * as broken.
 */
export function describeResetOption(
    readiness: RepoReadinessState | undefined,
    resetToTemplate: boolean,
    disabled: boolean,
    unusable = false,
): { checked: boolean; locked: boolean; tone: 'info' | 'warn' | 'none'; message: string } {
    // Nothing to say while the repo is unusable for a DIFFERENT reason. Its own
    // notice is already on screen, and "Setup cannot complete without a reset"
    // would be a false promise here — the reset clones `--branch main`, which is
    // exactly what this repo does not have. Two amber lines competing, one of
    // them wrong.
    if (unusable) {
        return { checked: false, locked: true, tone: 'none' as const, message: '' };
    }

    if (disabled) return { checked: false, locked: true, tone: 'none', message: '' };

    if (readiness?.kind === 'empty') {
        // Nothing to lose, so nothing to consent to. Shown as done, not asked.
        return {
            checked: true,
            locked: true,
            tone: 'info',
            message: 'This repository is empty — it will be set up from the template.',
        };
    }

    if (readiness?.kind === 'not-a-storefront') {
        return {
            checked: resetToTemplate,
            locked: false,
            tone: 'warn',
            message:
                `Missing ${readiness.missing.join(', ')}. ` +
                'Setup cannot complete without a reset.',
        };
    }

    return {
        checked: resetToTemplate,
        locked: false,
        tone: resetToTemplate ? 'warn' : 'none',
        message: resetToTemplate
            ? 'This will delete and recreate the repository with the selected template content.'
            : '',
    };
}
