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

import {
    ActionButton,
    Button,
    Checkbox,
    DialogTrigger,
    Flex,
    Heading,
    Text,
    TextField,
    View,
} from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { Modal } from '@/core/ui/components/ui/Modal';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { sleep } from '@/core/utils/sleep';
import { isValidRepositoryName } from '@/core/validation/normalizers';
import type { GitHubRepoItem } from '@/types/webview';

/** GitHub App installation status tracking. */
export interface GitHubAppStatus {
    isChecking: boolean;
    isInstalled: boolean | null; // null = not checked yet
    /** The actual code.status from the Helix admin endpoint (200, 400, 404, etc.) */
    codeStatus?: number;
    error?: string;
    installUrl?: string;
}

/** Repository creation state tracking. */
export interface RepoCreationState {
    isCreating: boolean;
    isCreated: boolean;
    error?: string;
}

/** GitHub App check result type. */
export interface GitHubAppCheckResult {
    success: boolean;
    isInstalled: boolean;
    codeStatus?: number;
    installUrl?: string;
    error?: string;
}

/**
 * Retry-poll for GitHub App installation with exponential backoff.
 * Extracted to reduce component complexity.
 */
export async function pollGitHubAppInstallation(
    owner: string,
    repo: string,
    setRecheckMessage: (msg: string) => void,
): Promise<{ status: GitHubAppStatus; failed: boolean }> {
    const maxAttempts = 5;
    const retryDelayMs = 5000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await webviewClient.request<GitHubAppCheckResult>('check-github-app', {
                owner,
                repo,
                lenient: true,
            });

            if (result.success && result.isInstalled) {
                return {
                    status: { isChecking: false, isInstalled: true, codeStatus: result.codeStatus },
                    failed: false,
                };
            }

            // HTTP 404 (codeStatus undefined) means repo not yet indexed -- retry
            if (result.codeStatus === undefined && attempt < maxAttempts) {
                setRecheckMessage(
                    `Repository is still being registered... (attempt ${attempt + 1} of ${maxAttempts})`,
                );
                await sleep(retryDelayMs);
                continue;
            }

            return {
                status: {
                    isChecking: false,
                    isInstalled: false,
                    codeStatus: result.codeStatus,
                    installUrl: result.installUrl,
                },
                failed: true,
            };
        } catch (err) {
            console.error('[GitHub App] Check failed:', err);
            return {
                status: { isChecking: false, isInstalled: false, error: (err as Error).message },
                failed: true,
            };
        }
    }

    // All retries exhausted
    return { status: { isChecking: false, isInstalled: false }, failed: true };
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
 * Selection-time Code Sync probe for an EXISTING repo: report what Helix says now and
 * stop. Lenient (a 400 code.status is installed-but-unsynced, fine at selection) and
 * non-triggering (`skipTrigger`), so it answers in ~1s instead of polling a code sync
 * for up to three minutes.
 *
 * Module-level rather than a component callback: it closes over nothing but its setter,
 * and inlining it pushed RepoSelectionInline past the complexity limit.
 *
 * @param owner - repo owner
 * @param repo - repo name
 * @param setStatus - receives the resulting status
 */
export async function probeExistingRepoApp(
    owner: string,
    repo: string,
    setStatus: (s: GitHubAppStatus) => void,
): Promise<void> {
    setStatus({ isChecking: true, isInstalled: null });
    try {
        const result = await webviewClient.request<GitHubAppCheckResult>('check-github-app', {
            owner,
            repo,
            lenient: true,
            skipTrigger: true,
        });
        setStatus(buildAppStatusFromResult(result));
    } catch {
        // Undetermined, not missing — the gate lets this through.
        setStatus({ isChecking: false, isInstalled: false });
    }
}

/**
 * Should the "AEM Code Sync App" status row render?
 *
 * Both modes since 2026-08-06 — the existing-repo check moved to selection and feeds
 * the same gate, so the row that explains a block has to be reachable for it too.
 * Extracted from the component: with it inline, RepoSelectionInline tripped the
 * complexity limit.
 *
 * @param repoMode - 'new' | 'existing'
 * @param repoCreated - a new repo has been created
 * @param hasSelectedRepo - an existing repo is chosen
 * @returns true when the row should show
 */
export function shouldShowAppStatus(
    repoMode: string,
    repoCreated: boolean,
    hasSelectedRepo: boolean,
): boolean {
    return repoMode === 'new' ? repoCreated : hasSelectedRepo;
}

export function computeCodeSyncValid(
    repoMode: string,
    githubAppStatus: GitHubAppStatus,
    selectedRepo: GitHubRepoItem | undefined,
): boolean {
    if (repoMode === 'new') {
        return githubAppStatus.isInstalled === true && !githubAppStatus.isChecking;
    }

    // Existing repos used to gate on nothing, so the only Code Sync check was
    // mid-pipeline — after fstab, block collection, smart-404 and quick-edit had
    // already written to the user's repo. That deferral was a workaround for a
    // classifier since fixed (89ef6fba, shipped beta.122); it outlived its reason.
    if (!selectedRepo) return false;
    if (githubAppStatus.isChecking) return false;

    // Block ONLY on a definitive answer. AEM returns the same 404 for
    // repo-does-not-exist, not-a-Helix-site, and App-not-installed, so treating
    // "could not tell" as "missing" would strand the users whose credential AEM
    // refuses — the exact bug class this check was broken by before.
    const definitivelyMissing =
        githubAppStatus.isInstalled === false && githubAppStatus.codeStatus === 404;
    return !definitivelyMissing;
}

/**
 * Compute whether the user can proceed based on repo mode and current state.
 * The GitHub-App-install gate lives here (new repos require app verified) —
 * the combination of the repo-choice gate and the Code-Sync app gate.
 */
export function computeCanProceed(
    repoMode: string,
    repoCreationState: RepoCreationState,
    githubAppStatus: GitHubAppStatus,
    selectedRepo: GitHubRepoItem | undefined,
    isLoading: boolean,
): boolean {
    return (
        computeRepoValid(repoMode, repoCreationState, selectedRepo, isLoading) &&
        computeCodeSyncValid(repoMode, githubAppStatus, selectedRepo)
    );
}

/** Build GitHubAppStatus from a check result. */
export function buildAppStatusFromResult(result: GitHubAppCheckResult): GitHubAppStatus {
    return {
        isChecking: false,
        isInstalled: result.success ? result.isInstalled : false,
        codeStatus: result.codeStatus,
        installUrl: result.installUrl,
        error: result.success ? undefined : result.error || 'Failed to check GitHub App status',
    };
}

/**
 * GitHubAppInstallModal - Shows the GitHub App installation modal for new repos.
 * Returns null when the modal should not be shown.
 */
export function GitHubAppInstallModal({
    repoMode,
    repoCreationState,
    createdRepo,
    githubAppStatus,
    isRechecking,
    isModalDismissed,
    recheckMessage,
    hasRecheckFailed,
    onCheckAgain,
    onOpenInstallPage,
    onDismiss,
}: {
    repoMode: string;
    repoCreationState: RepoCreationState;
    createdRepo?: { owner: string; name: string };
    githubAppStatus: GitHubAppStatus;
    isRechecking: boolean;
    isModalDismissed: boolean;
    recheckMessage: string;
    hasRecheckFailed: boolean;
    onCheckAgain: () => void;
    onOpenInstallPage: () => void;
    onDismiss: () => void;
}): React.ReactElement | null {
    const isNewWithCreatedRepo = repoMode === 'new' && repoCreationState.isCreated && !!createdRepo;
    if (!isNewWithCreatedRepo) return null;
    if (githubAppStatus.isInstalled === true) return null;

    const shouldShowModal =
        (githubAppStatus.isInstalled === false || isRechecking) && !isModalDismissed;
    if (!shouldShowModal || !createdRepo) return null;

    const { owner, name: repo } = createdRepo;

    return (
        <DialogTrigger
            type="modal"
            isOpen={true}
            onOpenChange={(isOpen) => {
                if (!isOpen) onDismiss();
            }}
        >
            <ActionButton isHidden>Open</ActionButton>
            {() => (
                <Modal
                    title="Install GitHub App"
                    actionButtons={
                        isRechecking
                            ? []
                            : [
                                  {
                                      label: 'Check Again',
                                      variant: 'secondary',
                                      onPress: onCheckAgain,
                                  },
                                  {
                                      label: 'Install App',
                                      variant: 'accent',
                                      onPress: onOpenInstallPage,
                                  },
                              ]
                    }
                    onClose={onDismiss}
                >
                    <div
                        style={{
                            minHeight: '220px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {isRechecking ? (
                            <LoadingDisplay message={recheckMessage} />
                        ) : hasRecheckFailed ? (
                            <Text UNSAFE_className="text-sm text-orange-700">
                                {githubAppStatus.codeStatus === undefined
                                    ? 'Your repository is still being registered. This can take a few minutes for new repositories. Please wait and try again.'
                                    : 'App not detected. Please verify the app is installed for this repository.'}
                            </Text>
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
                                        details: "We'll verify the installation completed",
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
                validationState={repoNameError || repoCreationState.error ? 'invalid' : undefined}
                errorMessage={repoNameError || repoCreationState.error}
                placeholder="my-eds-project"
                description={
                    githubUser
                        ? `Will be created as ${githubUser.login}/${repoName || 'my-eds-project'}`
                        : 'Name for your new GitHub repository'
                }
                width="100%"
                isRequired
                autoFocus
                isDisabled={repoCreationState.isCreated || repoCreationState.isCreating}
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
): { checked: boolean; locked: boolean; tone: 'info' | 'warn' | 'none'; message: string } {
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
                `Missing ${readiness.missing.join(', ')}. `
                + 'Setup cannot complete without a reset.',
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
export function ResetToTemplateOption({
    resetToTemplate,
    onResetToTemplateChange,
    disabled = false,
    readiness,
}: {
    resetToTemplate: boolean;
    onResetToTemplateChange: (isSelected: boolean) => void;
    /** Disabled until a repository is selected; always rendered so the row never reflows. */
    disabled?: boolean;
    /** Undefined while the readiness check is in flight. */
    readiness?: RepoReadinessState;
}): React.ReactElement {
    const { checked, locked, tone, message } = describeResetOption(
        readiness,
        resetToTemplate,
        disabled,
    );

    return (
        <Flex direction="column" gap="size-50" UNSAFE_className="reset-to-template-top">
            <Checkbox isSelected={checked} isDisabled={locked} onChange={onResetToTemplateChange}>
                Reset to template (replaces all content)
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
