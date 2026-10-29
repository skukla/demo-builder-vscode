/**
 * The storefront setup step's state: which phases exist, what each one tells
 * the SC, and how each message from the extension moves the state on.
 *
 * Pure functions only. The hook that owns the run (`useStorefrontSetup`) hands
 * each of these to `setSetupState`, so every transition here can be tested
 * without rendering anything.
 *
 * Phases:
 * - idle: Initial state before operations start
 * - repository: Creating/fetching GitHub repository
 * - storefront-code: Installing blocks and configuring storefront code
 * - code-sync: Verifying code bus synchronization
 * - site-config: Configuring site permissions and routing
 * - github-app: Waiting for GitHub App installation
 * - content: Copying demo content to DA.live
 * - block-library: Setting up block library in DA.live
 * - publish: Publishing content to CDN
 * - completed: All operations successful
 * - error: Operation failed
 *
 * @module features/eds/ui/helpers/storefrontSetupState
 */

import { expectationFor } from '@/core/utils/operationStages';
import { stageLine } from '@/core/utils/stageLine';
import type { WizardState } from '@/types/webview';
import type {
    OperationPosition,
    StorefrontGitHubAppRequiredPayload,
    StorefrontSetupCompletePayload,
    StorefrontSetupErrorPayload,
    StorefrontSetupProgressPayload,
    StorefrontSetupProgressPhase,
} from '@/types/webviewPayloads';
import type {
    StorefrontSetupPartialState,
    StorefrontSetupStartPayload,
} from '@/types/webviewRequests';

/** The progress a finished run shows. Every other value arrives on the push. */
const COMPLETE_PROGRESS = 100;

/**
 * Setup phase states
 */
// The wire phases live in @/types/webviewPayloads (ONE declaration with the
// senders — this union used to be a local twin missing the 'auth-recovery'
// and 'complete' values the pipeline actually pushes). The webview adds its
// local-only states on top.
export type StorefrontSetupPhase =
    | StorefrontSetupProgressPhase
    | 'idle'
    | 'github-app'
    | 'completed'
    | 'error';

/**
 * Internal state for setup progress tracking
 */
export interface StorefrontSetupState {
    phase: StorefrontSetupPhase;
    /** Line 1 while the run works: the step, from the stage table. */
    stage?: string;
    /** The step's place in the run, "(4 of 7)". */
    position?: OperationPosition;
    /** With a step, line 2: what it is doing now. Without one, line 1. */
    message: string;
    subMessage?: string;
    /** When the run began, for the screen's clock. */
    startedAt?: number;
    progress: number;
    error?: string;
    /**
     * Non-fatal reasons product detail pages will not work.
     *
     * The completed screen used to hardcode "Storefront Published" and render
     * nothing from the completion payload — so a storefront that could not serve
     * a single PDP looked identical to a healthy one. The extension had been
     * sending the explanation since 2026-07-28; nothing displayed it.
     */
    warnings?: string[];
    githubAppData?: StorefrontGitHubAppRequiredPayload;
    // StorefrontSetupPartialState lives in @/types/webviewRequests — ONE
    // declaration with the cancel request's handler (this file used to carry a
    // byte-identical twin). It is what the cancel hands over for cleanup.
    partialState: StorefrontSetupPartialState;
}

/** A fresh, not-yet-started state: the first mount and every Retry begin here. */
export function initialSetupState(message: string): StorefrontSetupState {
    return {
        phase: 'idle',
        message,
        progress: 0,
        partialState: {
            repoCreated: false,
            contentCopied: false,
            phase: 'idle',
        },
    };
}

/**
 * Row 3 for the two phases that name no step: what the SC is waiting on. Every
 * working phase names a step (`storefrontSetupProgress.ts` on the extension side),
 * whose expectation comes from the shared stage table instead.
 */
export function getHelperText(phase: StorefrontSetupPhase): string | undefined {
    if (phase === 'auth-recovery') return 'Waiting for you to finish signing in';
    if (phase === 'cancelling') return 'Usually a moment';
    return undefined;
}

/**
 * The loader's three lines (progress vocabulary, owner 2026-10-16): the step with its
 * place in the run, what it is doing now, and the step's expectation, worded as every
 * other surface words the same work. A push with no step shows as it came.
 */
export function setupLines(state: StorefrontSetupState): {
    message: string;
    subMessage?: string;
    expectation?: string;
} {
    if (!state.stage) {
        const { message, subMessage } = state;
        return { message, subMessage, expectation: getHelperText(state.phase) };
    }
    return {
        message: stageLine(state.stage, state.position),
        subMessage: state.message,
        expectation: expectationFor(state.stage) ?? getHelperText(state.phase),
    };
}

/**
 * Convert the wizard's optional-fields EDSConfig into the start request's
 * REQUIRED config, or undefined when the wizard state is incomplete. The
 * wizard's Continue gate makes incompleteness unreachable in practice; this
 * states that contract at the boundary instead of casting past it.
 */
export function toStartEdsConfig(
    eds: WizardState['edsConfig'],
): StorefrontSetupStartPayload['edsConfig'] | undefined {
    if (!eds?.repoName || !eds.daLiveOrg || !eds.daLiveSite) return undefined;
    return {
        ...eds,
        repoName: eds.repoName,
        daLiveOrg: eds.daLiveOrg,
        daLiveSite: eds.daLiveSite,
    };
}

/**
 * Check if a phase is actively processing — i.e. closing the wizard now should
 * send the cancel that offers cleanup of whatever setup already created.
 */
export function isActivePhase(phase: StorefrontSetupPhase): boolean {
    return [
        'idle',
        'repository',
        'storefront-code',
        'code-sync',
        'site-config',
        'content',
        'block-library',
        'publish',
        'cancelling',
        // Setup paused for a DA.live re-auth is still running — and the re-auth
        // prompt is exactly where users give up. This phase was missing from the
        // list, so closing the wizard there skipped the cancel and orphaned the
        // created repo/content silently (decided with the user 2026-08-22).
        'auth-recovery',
        // Same reasoning, since EDS-20 (2026-09-25): the install dialog is shown by
        // a run that is still going and waiting for the App, not by one that ended.
        'github-app',
    ].includes(phase);
}

/** A progress push from the extension. */
export function applyProgress(
    prev: StorefrontSetupState,
    data: StorefrontSetupProgressPayload,
): StorefrontSetupState {
    // Update partial state based on phase transitions
    const newPartialState = { ...prev.partialState, phase: data.phase };

    // A push carrying repoUrl means the repo exists — record it for
    // cancel-cleanup. This used to be gated on phase !== 'repository',
    // which excluded exactly the pushes that carry repo info (they are
    // all 'repository'-phase pushes), so repoCreated never got set from
    // progress and cancelling mid-setup skipped repo cleanup. Found when
    // the shared payload type made the comparison provably dead.
    if (data.repoUrl) {
        newPartialState.repoCreated = true;
        newPartialState.repoUrl = data.repoUrl;
        newPartialState.repoOwner = data.repoOwner;
        newPartialState.repoName = data.repoName;
    }

    // Mark content as copied when completing content phase. The wire's
    // terminal value is 'complete' — this compared against the local
    // 'completed' state and so never matched (same dead-comparison find).
    if (
        data.phase === 'complete' ||
        (prev.partialState.phase === 'content' && data.phase !== 'content')
    ) {
        newPartialState.contentCopied = true;
    }

    return {
        ...prev,
        phase: data.phase,
        // A push with no step (the sign-in wait) drops the last one; the clock
        // keeps counting the whole run.
        stage: data.stage,
        position: data.position,
        message: data.message,
        subMessage: data.subMessage,
        progress: data.progress,
        startedAt: data.startedAt ?? prev.startedAt,
        partialState: newPartialState,
    };
}

/** The run finished: everything it created now exists. */
export function applyComplete(
    prev: StorefrontSetupState,
    data: StorefrontSetupCompletePayload,
): StorefrontSetupState {
    return {
        ...prev,
        phase: 'completed',
        message: data.message || 'Storefront published successfully!',
        warnings: data.warnings,
        progress: COMPLETE_PROGRESS,
        partialState: {
            ...prev.partialState,
            repoCreated: true,
            contentCopied: true,
            phase: 'completed',
        },
    };
}

/** The run failed. */
export function applyError(
    prev: StorefrontSetupState,
    data: StorefrontSetupErrorPayload,
): StorefrontSetupState {
    return {
        ...prev,
        phase: 'error',
        message: data.message || 'An error occurred',
        error: data.error,
    };
}

/** The wizard state cannot start a run; the SC has to go back and finish it. */
export function applyIncompleteConfig(prev: StorefrontSetupState): StorefrontSetupState {
    return {
        ...prev,
        phase: 'error',
        error: 'Storefront configuration is incomplete — go back and finish the Storefront step.',
    };
}

/** The run paused to wait for AEM Code Sync to be installed. */
export function applyGitHubAppRequired(
    prev: StorefrontSetupState,
    data: StorefrontGitHubAppRequiredPayload,
): StorefrontSetupState {
    return {
        ...prev,
        phase: 'github-app',
        message: 'GitHub App installation required',
        githubAppData: data,
    };
}

/**
 * The dialog's own check saw the App.
 *
 * The run is still going: it has been polling for the App since it showed
 * the dialog (`pauseForGitHubApp`) and resumes on its own within one poll.
 * This only takes the dialog down ahead of that, so it does not sit over a
 * run that has already moved on; the run's next progress push replaces the
 * line. Until EDS-20 (2026-09-25) the run had ENDED at the dialog and this
 * landed on an error screen asking for Retry, which re-ran everything.
 */
export function applyInstallDetected(prev: StorefrontSetupState): StorefrontSetupState {
    return {
        ...prev,
        phase: 'code-sync',
        message: 'AEM Code Sync installed — setup is continuing',
        subMessage: undefined,
        githubAppData: undefined,
    };
}
