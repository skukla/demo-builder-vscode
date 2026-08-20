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
import {
    CODE_SYNC_INSTALL_ACTION,
    CODE_SYNC_RECHECK_ACTION,
    buildCodeSyncInstallSteps,
    buildCodeSyncInstallSummary,
} from '../helpers/codeSyncInstallContent';
import { InlineNotice } from '@/core/ui/components/feedback';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { SuccessStateDisplay } from '@/core/ui/components/feedback/SuccessStateDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { type ElapsedStage, useElapsedStage } from '@/core/ui/hooks/useElapsedStage';
import { getValidationState } from '@/core/ui/utils/validationState';
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
    /**
     * The check never resolved — AEM refused the credential or was unreachable.
     *
     * Distinct from `isInstalled: false`, which asserts the app is absent. The
     * handler sets this instead of `installUrl`, because installing cannot fix a
     * refused credential. It is the signal for "we cannot tell"; the absence of a
     * `codeStatus` is NOT (a Helix 404 has no code.status and is perfectly definite).
     */
    undetermined?: boolean;
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
    /** Mirrors `CheckGitHubAppResponse.undetermined` — see `GitHubAppStatus`. */
    undetermined?: boolean;
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

            // Retry only what waiting can fix. This keyed off `codeStatus ===
            // undefined`, which is ALSO true of a definitive Helix 404 ("no such
            // site") — so a repo whose App was simply never installed spent 25
            // seconds counting "still being registered... (attempt 3 of 5)" and
            // then landed back where it started. An undetermined check is the one
            // that deserves another go: AEM refused or was unreachable, and the
            // next attempt may resolve it.
            if (result.undetermined && attempt < maxAttempts) {
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
                    undetermined: result.undetermined,
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
export async function probeRepoCodeSync(
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

/**
 * Which canonical view the Code Sync sub-step should render.
 *
 * The sub-step body is a full-width view, so it speaks the project's full-view
 * vocabulary — `LoadingDisplay`, `SuccessStateDisplay`, `StatusDisplay` — rather
 * than the single `StatusSection` row it used to show, which left a large empty
 * panel and no way to read the outcome.
 *
 * Deliberately takes NO repoMode. The install instructions used to render only
 * for `repoMode === 'new'`, so an existing repo whose app was missing was blocked
 * from continuing (`computeCodeSyncValid` refuses a definitive 404) with no
 * instructions anywhere on screen — a dead end. Every mode gets the same flow.
 *
 * @param status - the last app-check result
 * @param isRechecking - a user-triggered re-check is in flight
 */
export function resolveCodeSyncView(
    status: GitHubAppStatus,
    isRechecking: boolean,
    siteNotPossibleYet = false,
): { kind: 'checking' | 'verified' | 'needs-install' | 'cannot-verify' | 'after-setup' } {
    if (status.isChecking || isRechecking) return { kind: 'checking' };

    // The two DEFINITIVE shapes first, both read off the body's `code.status` on
    // an outer 200 (`githubAppService.checkHelixStatus`): sync is working, or
    // Helix knows this repo and reports no code sync for it. These are
    // measurements, and they outrank everything below — including
    // `siteNotPossibleYet`, which is a structural inference about what Helix CAN
    // answer. If it turns out Helix can already see the site, it can.
    if (status.isInstalled === true) return { kind: 'verified' };
    if (status.codeStatus === 404) return { kind: 'needs-install' };

    // No storefront content means Helix has no SITE for this repo — and
    // `admin.hlx.page/status` reports on the site, not the App. It answers
    // `404 no such site` however AEM Code Sync is configured, so the question is
    // unanswerable here rather than merely unanswered. Measured on
    // skukla/kukla-bodea 2026-08-20: GitHub listed the repo under the AEM Code
    // Sync installation and the endpoint 404'd anyway, 28 minutes after a
    // code-sync trigger Helix had accepted.
    //
    // Above `checking` because the caller does not probe in this state, so
    // `isInstalled` stays null and would otherwise spin forever. Phase 1 asks
    // once the reset has made the repo a storefront, which is the first moment
    // an answer exists.
    if (siteNotPossibleYet) return { kind: 'after-setup' };

    // Not yet asked. Never "missing" — we have no answer to report.
    if (status.isInstalled === null) return { kind: 'checking' };

    // Everything else is the same fact wearing different clothes: WE CANNOT
    // TELL. An outer 404 carries no `code.status` to read; a 401/403/5xx is
    // Helix declining. This step grew a view per diagnosis — five of them —
    // each added to explain what the one before it got wrong, and every one
    // ended at the same place: install it if you have not, because we cannot
    // check.
    return { kind: 'cannot-verify' };
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
    if (definitivelyMissing) return false;

    // An INFERRED missing App does not gate. It was gated on briefly (an
    // acknowledgement click), and the only way to make that honest was a line
    // saying why Continue was held — which turned out to be one more paragraph
    // on a screen that already said the same thing three ways. The screen IS the
    // encouragement: it is titled "Make sure AEM Code Sync is installed", lists
    // the steps, and offers the button. A forced click on top of an inference we
    // know is unreliable bought friction, not safety.
    //
    // The DEFINITIVE case above still blocks, because that one is measured.
    return true;
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
        // Carried through, not dropped. The handler computes it; the view needs it
        // to tell "cannot tell" apart from "definitely needs installing".
        undetermined: result.undetermined,
        error: result.success ? undefined : result.error || 'Failed to check GitHub App status',
    };
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
export const CODE_SYNC_CHECK_STAGES: ElapsedStage[] = [
    { afterMs: 6000, message: 'Still waiting on Adobe\u2026' },
    {
        afterMs: 20000,
        message:
            'Adobe may be running a first-time sync for this repository. ' +
            'That can take up to three minutes.',
    },
];

export function CodeSyncStatusView({
    createdRepo,
    selectedRepoFullName,
    status,
    isRechecking,
    recheckMessage,
    onCheckAgain,
    onOpenInstallPage,
    siteNotPossibleYet = false,
}: {
    /** Set in `new` mode once the repo exists. */
    createdRepo?: { owner: string; name: string };
    /** Set in `existing` mode — `owner/repo`. */
    selectedRepoFullName?: string;
    status: GitHubAppStatus;
    isRechecking: boolean;
    recheckMessage: string;
    onCheckAgain: () => void;
    onOpenInstallPage: () => void;
    /**
     * The repo has no storefront content, so Helix has no site for it and the
     * status endpoint cannot answer about AEM Code Sync at all. See
     * {@link resolveCodeSyncView}.
     */
    siteNotPossibleYet?: boolean;
}): React.ReactElement {
    const view = resolveCodeSyncView(status, isRechecking, siteNotPossibleYet);
    // Unconditional: every branch below returns, so this must precede them all.
    const longWait = useElapsedStage(view.kind === 'checking', CODE_SYNC_CHECK_STAGES);
    const [fallbackOwner, fallbackRepo] = (selectedRepoFullName ?? '/').split('/');
    const owner = createdRepo?.owner ?? fallbackOwner;
    const repo = createdRepo?.name ?? fallbackRepo;

    if (view.kind === 'checking') {
        return (
            <CenteredFeedbackContainer fill>
                <LoadingDisplay
                    size="L"
                    message="Checking AEM Code Sync"
                    // A caller-supplied line is always more specific than an
                    // elapsed-time guess -- the retry loop's "attempt 2 of 5" must
                    // not be overwritten by it.
                    subMessage={
                        recheckMessage || longWait || `Verifying ${owner}/${repo}...`
                    }
                />
            </CenteredFeedbackContainer>
        );
    }

    // Every branch below is wrapped the same way as `checking` above. Only that one
    // was centered, so the pane's content jumped to the top the moment the check
    // finished — the same view, in a different place, for no reason the user can
    // see. `CenteredFeedbackContainer` is the house treatment for exactly this.
    if (view.kind === 'after-setup') {
        return (
            <CenteredFeedbackContainer fill>
                <StatusDisplay
                    variant="info"
                    title="Code Sync is checked after setup"
                    height="auto"
                    actions={[
                        {
                            label: CODE_SYNC_INSTALL_ACTION,
                            variant: 'secondary',
                            onPress: onOpenInstallPage,
                        },
                    ]}
                >
                    <Text UNSAFE_className="text-sm text-gray-600">
                        {`Adobe can't see ${owner}/${repo} yet, because it isn't a storefront. ` +
                            'Setup will fix that, and verify Code Sync straight afterwards.'}
                    </Text>
                </StatusDisplay>
            </CenteredFeedbackContainer>
        );
    }

    if (view.kind === 'verified') {
        return (
            <CenteredFeedbackContainer fill>
                <SuccessStateDisplay
                    title="AEM Code Sync Verified"
                    message={`${owner}/${repo} is connected and ready to publish.`}
                />
            </CenteredFeedbackContainer>
        );
    }

    // ONE view for every shape of "we cannot tell". Says what we noticed if we
    // noticed anything, shows the install steps, and always lets the user past —
    // our signal is a guess here, and a guess must never be a wall.
    const definitive = view.kind === 'needs-install';

    return (
        <CenteredFeedbackContainer fill>
            <StatusDisplay
                variant="info"
                title={
                    definitive
                        ? 'Install the AEM Code Sync App'
                        : 'Make sure AEM Code Sync is installed'
                }
                height="auto"
                actions={[
                    {
                        label: CODE_SYNC_INSTALL_ACTION,
                        variant: 'accent',
                        onPress: onOpenInstallPage,
                    },
                    {
                        label: CODE_SYNC_RECHECK_ACTION,
                        variant: 'secondary',
                        onPress: onCheckAgain,
                    },
                ]}
            >
                {/* The summary and steps are shared with the mid-run install dialog
                    and have already been trimmed once; do not pad around them.
                    Three paragraphs were added here on 2026-08-20 and the screen
                    became a wall — one repeating what the Repository step had
                    just said about this repo, two saying in different words what
                    the title and the buttons already carry.

                    What is left: the title states the ask, the steps say what to
                    do on GitHub, the buttons do it. The single line below earns
                    its place only while Continue is held, because a disabled
                    button with no stated reason is its own bug. */}
                <NumberedInstructions instructions={buildCodeSyncInstallSteps(owner, repo)} />
                {/* Below the steps, not above them. This surface centres its title,
                    and a paragraph directly under it competed with the heading for
                    the same glance. `GitHubAppInstallDialog` keeps it as the
                    `description` lead-in because a modal has no centred title to
                    compete with — the shared COPY is identical either way, which
                    is the drift `codeSyncInstallContent` guards against. Where a
                    surface puts it is that surface's call. */}
                <Text UNSAFE_className="text-sm text-gray-600">
                    {buildCodeSyncInstallSummary(owner, repo)}
                </Text>
            </StatusDisplay>
        </CenteredFeedbackContainer>
    );
}

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
