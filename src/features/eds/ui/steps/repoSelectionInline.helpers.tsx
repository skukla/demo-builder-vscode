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
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { SuccessStateDisplay } from '@/core/ui/components/feedback/SuccessStateDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { getValidationState } from '@/core/ui/utils/validationState';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { sleep } from '@/core/utils/sleep';
import { isValidRepositoryName } from '@/core/validation/normalizers';
import { describeSiteUnknown, explainSiteUnknown } from '@/features/eds/utils/siteUnknownReason';
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

    // Every EDS path targets `main`: the Helix status URL in `githubAppService`,
    // `DEFAULT_BRANCH` in `helixService`, and the template reset, which runs
    // `git clone --depth 1 --branch main`. A repo defaulting to anything else
    // cannot work, and fails in a way that names none of that — measured
    // 2026-08-19 on `skukla/kukla-bodea` (only branch `master`): Helix answered
    // `404 [admin] no such site` BEFORE authenticating, and the UI reported it
    // as Adobe failing to answer. Ticking the reset would not have saved it
    // either; the clone would have failed at Phase 1.
    //
    // UNKNOWN is not a rejection. A repo list cached before `defaultBranch`
    // existed carries none, and blocking on its absence would strand those
    // users over a field they cannot see.
    if (selectedRepo.defaultBranch && selectedRepo.defaultBranch !== 'main') return false;

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
    pendingReset = false,
): { kind: 'checking' | 'verified' | 'needs-install' | 'unverifiable' | 'pending-reset' } {
    if (status.isChecking || isRechecking) return { kind: 'checking' };
    if (status.isInstalled === true) return { kind: 'verified' };

    // Not yet asked. Never "missing" — we have no answer to report.
    if (status.isInstalled === null) return { kind: 'checking' };

    // An undetermined check OUTRANKS a pending reset. `undetermined` means Helix
    // refused our credential or was unreachable — a problem the reset does not
    // fix and that will bite again at Phase 3. Telling the user "Code Sync is
    // verified after setup" would hide it behind reassurance.
    if (status.undetermined) return { kind: 'unverifiable' };

    // The repo is not a storefront YET and is queued for reset-from-template.
    // Helix answers 404 "no such site" because the files that make it a site do
    // not exist — correct, and permanent until `storefrontSetupPhase1` performs
    // the reset, long after this wizard step. Reporting that as a failed check
    // blames latency for a known state and offers a re-check that cannot come
    // good; the reporter on 2026-08-19 tried three times over six minutes,
    // each firing a Helix code sync and polling it to exhaustion.
    //
    // Checked AFTER `verified`: a pending reset must never downgrade a real
    // answer, only explain the absence of one.
    if (pendingReset) return { kind: 'pending-reset' };

    // Undetermined means the check never resolved — a refused credential or an
    // unreachable service — and that says NOTHING about the app. Reporting it as
    // missing sends the user to reinstall one that is already there, which is
    // exactly what the old "Registering..." row did.
    //
    // Read the HANDLER's verdict, not the absence of a number. It sends
    // `installUrl` when it is confident enough to offer the install and withholds
    // it when it is not. `githubAppService` warns about the shortcut this used to
    // take: `httpNotFound` is the only signal meaning "Helix has never heard of
    // this repo", and callers "must not re-derive it from codeStatus === undefined,
    // which is equally true of a 401/403/5xx".
    //
    // That shortcut is why a brand-new repository — Helix 404, no `code.status` to
    // report, install genuinely required — showed "Couldn't verify" and offered
    // nothing but a re-check that could never come good.

    // Positive evidence either way: the handler offered somewhere to install, or
    // Helix reported an actual code.status. With neither, claim nothing.
    if (status.installUrl || status.codeStatus !== undefined) return { kind: 'needs-install' };

    return { kind: 'unverifiable' };
}

export function computeCodeSyncValid(
    repoMode: string,
    githubAppStatus: GitHubAppStatus,
    selectedRepo: GitHubRepoItem | undefined,
    installLinkOpened = false,
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

    // The INFERRED missing App: an outer 404 carries no `code.status` to read
    // (see `siteUnknownReason`), so the install prompt above it is a well-founded
    // guess, not a measurement. Blocking on a guess strands whoever it is wrong
    // about; letting it through silently is how an existing-repo user reached
    // Phase 3 — and a halt — only AFTER Phase 1 had reset their repo and Phase 2
    // had pushed to it.
    //
    // So: ask them to open the install page, and take the click as the
    // acknowledgement. Costs one click, keeps the user in control, and restores
    // the "learn before your repository is written to" guarantee that moving
    // this check earlier was meant to provide. Same bar `storefront-tools`
    // settled on after abandoning verification outright.
    const inferredMissing =
        githubAppStatus.isInstalled === false &&
        githubAppStatus.codeStatus === undefined &&
        !githubAppStatus.undetermined &&
        Boolean(githubAppStatus.installUrl);
    if (inferredMissing && !installLinkOpened) return false;

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
 * What to say when Helix DECLINED to answer.
 *
 * `unverifiable` means a refused credential or an unreachable service — not a
 * verdict about the site, and emphatically not one about the App. If the
 * preconditions we can check ourselves are bad, naming those is still true and
 * still useful, because they hold whatever Helix thinks. But when they are
 * clean we know nothing, and must say so: `explainSiteUnknown` would otherwise
 * fall through to "the App is probably missing", which asserts a cause we never
 * measured and sends the user to reinstall — the eleven-reinstalls failure this
 * module exists to prevent.
 *
 * @param checks - The preconditions we can verify without Helix
 * @param repoFullName - `owner/repo`
 * @returns A sentence that claims only what is known
 */
function describeUnverifiable(
    checks: { defaultBranch?: string; missingFiles?: string[] },
    repoFullName: string,
): string {
    const reason = explainSiteUnknown(checks);
    if (reason.kind !== 'app-probably-missing') {
        return describeSiteUnknown(reason, repoFullName);
    }
    return (
        `Adobe did not answer for ${repoFullName}, so we cannot tell whether AEM Code Sync `
        + 'is installed. This does NOT mean it is missing — a new repository can take a few '
        + 'minutes to register, and a refused sign-in looks the same from here. Check again '
        + 'in a moment.'
    );
}

export function CodeSyncStatusView({
    createdRepo,
    selectedRepoFullName,
    status,
    isRechecking,
    recheckMessage,
    onCheckAgain,
    onOpenInstallPage,
    pendingReset = false,
    siteChecks,
    installLinkOpened = false,
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
    /** The selected repo is not a storefront yet and is queued for reset. */
    pendingReset?: boolean;
    /**
     * What we can verify about the repo ourselves. A Helix 404 says only "no
     * such site"; these are what let us name WHICH precondition is unmet
     * instead of defaulting to "install the App".
     */
    siteChecks?: { defaultBranch?: string; missingFiles?: string[] };
    /** The user has opened the install page — the acknowledgement Continue waits on. */
    installLinkOpened?: boolean;
}): React.ReactElement {
    const view = resolveCodeSyncView(status, isRechecking, pendingReset);
    const [fallbackOwner, fallbackRepo] = (selectedRepoFullName ?? '/').split('/');
    const owner = createdRepo?.owner ?? fallbackOwner;
    const repo = createdRepo?.name ?? fallbackRepo;

    if (view.kind === 'checking') {
        return (
            <CenteredFeedbackContainer fill>
                <LoadingDisplay
                    size="L"
                    message="Checking AEM Code Sync"
                    subMessage={recheckMessage || `Verifying ${owner}/${repo}...`}
                />
            </CenteredFeedbackContainer>
        );
    }

    // Every branch below is wrapped the same way as `checking` above. Only that one
    // was centered, so the pane's content jumped to the top the moment the check
    // finished — the same view, in a different place, for no reason the user can
    // see. `CenteredFeedbackContainer` is the house treatment for exactly this.
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

    if (view.kind === 'pending-reset') {
        // Informational, not a warning: nothing has gone wrong and there is
        // nothing for the user to do. Deliberately offers no "Check Again" —
        // the answer cannot change until setup resets the repo, and a button
        // that re-asks a settled question is what made this look like a wall.
        return (
            <CenteredFeedbackContainer fill>
                <StatusDisplay
                    variant="info"
                    title="Code Sync is verified after setup"
                    height="auto"
                >
                    <Text UNSAFE_className="text-sm text-gray-600">
                        {owner}/{repo} is not an Edge Delivery storefront yet, so Adobe has no site
                        to report on. Setup will reset it from the template first, then verify AEM
                        Code Sync. You can continue.
                    </Text>
                </StatusDisplay>
            </CenteredFeedbackContainer>
        );
    }

    if (view.kind === 'unverifiable') {
        // Distinct from "not installed" ON PURPOSE. Adobe refusing the credential
        // says nothing about the app, and telling someone to install one that is
        // already there is the wrong remedy.
        return (
            <CenteredFeedbackContainer fill>
                <StatusDisplay
                    variant="warning"
                    title="Couldn't verify AEM Code Sync"
                    height="auto"
                    actions={[
                        {
                            label: CODE_SYNC_RECHECK_ACTION,
                            variant: 'accent',
                            onPress: onCheckAgain,
                        },
                    ]}
                >
                    <Text UNSAFE_className="text-sm text-gray-600">
                        {describeUnverifiable(siteChecks ?? {}, `${owner}/${repo}`)}
                    </Text>
                </StatusDisplay>
            </CenteredFeedbackContainer>
        );
    }

    // The remaining branch used to assume the App is missing. A Helix 404 does
    // not say that — it says Helix does not know the site, which has causes the
    // install flow cannot fix. Offer the install ONLY where it is the remedy.
    const siteReason = explainSiteUnknown(siteChecks ?? {});
    if (siteReason.kind !== 'app-probably-missing') {
        return (
            <CenteredFeedbackContainer fill>
                <StatusDisplay
                    variant={siteReason.kind === 'wrong-default-branch' ? 'warning' : 'info'}
                    title={
                        siteReason.kind === 'wrong-default-branch'
                            ? 'This repository uses a different default branch'
                            : 'Code Sync is verified after setup'
                    }
                    height="auto"
                >
                    <Text UNSAFE_className="text-sm text-gray-600">
                        {describeSiteUnknown(siteReason, `${owner}/${repo}`)}
                    </Text>
                </StatusDisplay>
            </CenteredFeedbackContainer>
        );
    }

    return (
        <CenteredFeedbackContainer fill>
            <StatusDisplay
                variant="info"
                title="Install the AEM Code Sync App"
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
                <NumberedInstructions
                    description={buildCodeSyncInstallSummary(owner, repo)}
                    instructions={buildCodeSyncInstallSteps(owner, repo)}
                />
                {/* Name the gate. Continue is held until the install page is
                    opened, and a disabled button with no stated reason is the
                    failure this whole screen exists to stop repeating. */}
                {!installLinkOpened && (
                    <Text UNSAFE_className="text-sm text-gray-600">
                        Open the install page to continue. We cannot confirm the app from
                        here, so this is your confirmation — you can install it now or check
                        that it is already there.
                    </Text>
                )}
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
