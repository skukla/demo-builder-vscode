/**
 * RepoSelectionInline helpers
 *
 * Pure functions + presentational sub-components extracted VERBATIM from the
 * former GitHubRepoSelectionStep so RepoSelectionInline stays within the file-size
 * budget. Behavior is unchanged — only the home moved (TwoColumn step → inline
 * single-column body within the Storefront group).
 *
 * @module features/eds/ui/steps/repoSelectionInline.helpers
 */

import { Button, Checkbox, Flex, Heading, Text, TextField, View } from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import React from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { getValidationState } from '@/core/ui/utils/validationState';
import { isValidRepositoryName } from '@/core/validation/normalizers';
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
 * Compute whether the AEM-Code-Sync app gate is satisfied (the `code-sync`
 * sub-step's verdict). Code Sync logically follows Repository, so it is never
 * satisfied before a repo exists:
 * - new:      the app is verified installed and not mid-check (implies the repo
 *             was created — the app can't be installed before that)
 * - existing: ready once a repo is actually SELECTED (no app gate at this step —
 *             it's deferred to StorefrontSetup after the fstab.yaml push — but the
 *             step isn't "done" until a repo has been chosen)
 */
/**
 * Report what Helix says about Code Sync right now, and stop.
 *
 * Lenient (a 400 code.status is installed-but-unsynced, which is fine at this
 * point) and non-triggering (`skipTrigger`), so it answers in about a second
 * instead of firing a code sync and polling it for up to three minutes.
 *
 * BOTH step-level checks land here — the existing repo just selected, and the new
 * repo just created. The created-repo path used to run a near-copy that omitted
 * `skipTrigger` while its docstring claimed otherwise, so creating a repository
 * sat on "Checking AEM Code Sync" for minutes: Helix 404s a repo it has never
 * indexed, and the sync that would fix that cannot run until the App is installed.
 * The user needs the install steps first, not a wait that resolves nothing. The
 * mid-pipeline gate still triggers, because that is where the latency is affordable.
 *
 * Module-level rather than a component callback: it closes over nothing but its
 * setter, and inlining it pushed RepoSelectionInline past the complexity limit.
 *
 * @param owner - repo owner
 * @param repo - repo name
 * @param setStatus - receives the resulting status
 */
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
 * The Code Sync sub-step BODY — one canonical view per state.
 *
 * Replaces a lone `StatusSection` row (plus a modal that only ever opened for a
 * newly created repo) with the project's full-view vocabulary, so this sub-step
 * reads like its siblings instead of an almost-empty panel:
 *
 * | state         | component                                     |
 * |---------------|-----------------------------------------------|
 * | checking      | `LoadingDisplay` (the webview spinner)        |
 * | verified      | `SuccessStateDisplay` (large green check)     |
 * | needs-install | `StatusDisplay` info + `NumberedInstructions` |
 * | unverifiable  | `StatusDisplay` warning                       |
 *
 * The install flow renders for BOTH repo modes. It previously required
 * `repoMode === 'new'`, so an existing repo missing the app was blocked by
 * `computeCodeSyncValid` with no instructions anywhere on screen — a dead end.
 */

/*
 * Every branch below passes `fill`, so all four states centre in the SAME place.
 * A short one (a spinner, a green check) lands in the middle of the pane; the
 * install steps grow past it and scroll. One state centred and the next
 * top-aligned is the jump reported as "the message is too high in the web view".
 */
/**
 * Copy for a Code Sync check that outlives a glance.
 *
 * Two different checks render this same view. The selection-time probe passes
 * `skipTrigger` and answers in about a second. "Check Again"
 * (`pollGitHubAppInstallation`) does NOT, so when Helix has never heard of the
 * repo the handler TRIGGERS a real code sync and polls for it — bounded by
 * `TIMEOUTS.LONG` over 30 attempts in `checkGitHubAppHandler.triggerAndWaitForCodeSync`,
 * i.e. up to three minutes. That path previously showed one static line for its
 * whole duration, so the user with the most to wait for got the least evidence
 * anything was happening.
 *
 * The copy hedges on purpose. From the webview we cannot see WHICH path the
 * handler took — only that it has not answered yet. Past ~6s the trigger path is
 * much the likelier one, so "may be" is the strongest claim the evidence carries.
 * The three-minute figure is read from the timeout above, not estimated.
 */
/**
 * The line under the name field: where the repo WILL live, or where it now DOES.
 *
 * Tense is the whole point. "Will be created as …" stayed on screen after the repo
 * existed, which is the same class of mistake as an empty field that is actually
 * satisfied — the UI describing an intention rather than the state.
 */
function describeRepoTarget(
    repoName: string,
    repoCreationState: RepoCreationState,
    githubUser?: { login: string },
): string {
    if (!githubUser) return 'Name for your new GitHub repository';

    const target = `${githubUser.login}/${repoName || 'my-eds-project'}`;
    return repoCreationState.isCreated && !repoCreationState.isCreating
        ? `Created as ${target}`
        : `Will be created as ${target}`;
}

/**
 * NewRepoForm - Form for creating a new repository.
 */
export function NewRepoForm({
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
        <View backgroundColor="gray-50" borderRadius="medium" padding="size-300">
            <Heading level={3} margin={0} marginBottom="size-200">
                Create New Repository
            </Heading>

            <TextField
                label="Repository Name"
                value={repoName}
                onChange={onRepoNameChange}
                onBlur={onRepoNameBlur}
                // The field that did the work says so. Creation left it grey and
                // disabled with helper text still in the future tense, so the only
                // confirmation was a tick in the summary panel across the screen.
                // `valid` is what draws Spectrum's checkmark, the same mark the
                // project-name field earns.
                validationState={getValidationState(
                    repoNameError || repoCreationState.error,
                    repoCreationState.isCreated && !repoCreationState.isCreating,
                )}
                errorMessage={repoNameError || repoCreationState.error}
                placeholder="my-eds-project"
                description={describeRepoTarget(repoName, repoCreationState, githubUser)}
                width="100%"
                isRequired
                autoFocus
                // READ-only once created, not DISABLED. Both stop editing, but a
                // disabled Spectrum field suppresses the validation icon — so the
                // checkmark this field earns on success was drawn and then hidden.
                // Still disabled while the request is in flight: there is nothing to
                // report yet, and greying it is the honest signal that it is busy.
                isReadOnly={repoCreationState.isCreated}
                isDisabled={repoCreationState.isCreating}
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

/**
 * ResetToTemplateOption - reset control, presented by what the repo contains.
 *
 * Consent is asked only where something could be destroyed. An empty repo is
 * reset automatically and told, not asked; a populated non-storefront requires
 * the reset because setup cannot otherwise succeed; a real storefront gets the
 * original prompt and warning.
 */
/**
 * The non-`main` default-branch notice.
 *
 * A NOTICE, not a full-pane `StatusDisplay`: nothing here is fatal and the repo
 * picker below stays usable. Rendered as a wall once (2026-08-20) and it
 * swallowed the list while Continue was one checkbox away.
 *
 * Returns null when the branch is fine or unknown — unknown is not a fault (a
 * repo list cached before `defaultBranch` existed carries none).
 *
 * @param selectedRepo - The chosen repo, if any
 * @returns The notice, or null
 */
export function DefaultBranchNotice({
    selectedRepo,
}: {
    selectedRepo?: GitHubRepoItem;
}): React.ReactElement | null {
    const branch = selectedRepo?.defaultBranch;
    if (!selectedRepo || !branch || branch === 'main') return null;

    return (
        <InlineNotice
            title="This repository uses a different default branch"
            testId="default-branch-notice"
        >
            Demo Builder builds storefronts from <strong>main</strong>, and{' '}
            {selectedRepo.fullName} defaults to <strong>{branch}</strong>. Rename its default
            branch to main on GitHub, or choose a different repository.
        </InlineNotice>
    );
}

export function ResetToTemplateOption({
    resetToTemplate,
    onResetToTemplateChange,
    disabled = false,
    readiness,
    unusable = false,
    templateName,
}: {
    resetToTemplate: boolean;
    onResetToTemplateChange: (isSelected: boolean) => void;
    /** Disabled until a repository is selected; always rendered so the row never reflows. */
    disabled?: boolean;
    /** Undefined while the readiness check is in flight. */
    readiness?: RepoReadinessState;
    /**
     * The repo cannot be used for a reason a reset would NOT fix — today, a
     * non-`main` default branch. Silences this control so the notice above it
     * is the only thing asking for attention.
     */
    unusable?: boolean;
    /** What the reset goes back to, when it is an added demo ("Reset to Isle5 by Jen"). */
    templateName?: string;
}): React.ReactElement {
    const { checked, locked, tone, message } = describeResetOption(
        readiness,
        resetToTemplate,
        disabled,
        unusable,
    );

    return (
        <Flex direction="column" gap="size-50" UNSAFE_className="reset-to-template-top">
            <Checkbox isSelected={checked} isDisabled={locked} onChange={onResetToTemplateChange}>
                {`Reset to ${templateName ?? 'template'} (replaces all content)`}
            </Checkbox>

            <View marginStart="size-300" UNSAFE_className="reset-warning-container">
                <Flex
                    alignItems="center"
                    gap="size-100"
                    UNSAFE_className={
                        tone === 'none' ? 'reset-warning-hidden' : 'reset-warning-visible'
                    }
                >
                    <Alert
                        size="S"
                        UNSAFE_className={
                            tone === 'info'
                                ? 'text-blue-500 flex-shrink-0'
                                : 'text-orange-500 flex-shrink-0'
                        }
                    />
                    <Text
                        UNSAFE_className={
                            tone === 'info' ? 'text-xs text-blue-600' : 'text-xs text-orange-600'
                        }
                    >
                        {message}
                    </Text>
                </Flex>
            </View>
        </Flex>
    );
}
