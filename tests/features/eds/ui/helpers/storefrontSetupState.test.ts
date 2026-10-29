/**
 * The storefront setup step's state transitions, tested directly.
 *
 * The step's suites drive these through rendered pushes, which can only see
 * what reaches the screen. Several fields here never reach it while the phase
 * that set them is showing (the install-required line sits behind the dialog;
 * the completed message is never drawn) but they are still what the next
 * transition and the cancel read, so they are pinned here.
 */

import {
    applyComplete,
    applyError,
    applyGitHubAppRequired,
    applyIncompleteConfig,
    applyInstallDetected,
    applyProgress,
    getHelperText,
    initialSetupState,
    isActivePhase,
    setupLines,
    toStartEdsConfig,
    type StorefrontSetupPhase,
    type StorefrontSetupState,
} from '@/features/eds/ui/helpers/storefrontSetupState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { EDSConfig } from '@/types/webview';
import type { StorefrontGitHubAppRequiredPayload } from '@/types/webviewPayloads';

function runningState(overrides: Partial<StorefrontSetupState> = {}): StorefrontSetupState {
    return {
        ...initialSetupState('Starting storefront setup'),
        phase: 'content',
        message: 'Copying content',
        subMessage: '3 of 10 pages',
        progress: 52,
        partialState: {
            repoCreated: true,
            contentCopied: false,
            phase: 'content',
            repoUrl: 'https://github.com/test-owner/test-repo',
            repoOwner: 'test-owner',
            repoName: 'test-repo',
        },
        ...overrides,
    };
}

describe('initialSetupState', () => {
    it('starts idle at zero with nothing created yet', () => {
        expect(initialSetupState('Retrying storefront setup')).toStrictEqual({
            phase: 'idle',
            message: 'Retrying storefront setup',
            progress: 0,
            partialState: { repoCreated: false, contentCopied: false, phase: 'idle' },
        });
    });

    it('hands out a fresh object each time, so one run cannot edit the next', () => {
        const first = initialSetupState('a');
        const second = initialSetupState('a');
        expect(first).not.toBe(second);
        expect(first.partialState).not.toBe(second.partialState);
    });
});

// The working phases name a step, whose expectation comes from the stage table
// (`setupLines`); these two never do, so they keep their own.
describe('getHelperText', () => {
    it.each<[StorefrontSetupPhase, string]>([
        ['auth-recovery', 'Waiting for you to finish signing in'],
        ['cancelling', 'Usually a moment'],
    ])('%s gives the SC an expectation', (phase, expected) => {
        expect(getHelperText(phase)).toBe(expected);
    });

    it.each<StorefrontSetupPhase>(['idle', 'repository', 'content', 'github-app', 'completed', 'error', 'complete'])(
        '%s has no expectation of its own',
        (phase) => {
            expect(getHelperText(phase)).toBeUndefined();
        },
    );
});

// The same three lines as every progress surface (progress vocabulary, owner
// 2026-10-16): the step with its place in the run, what it is doing now, the step's
// expectation.
describe('setupLines', () => {
    it('shows the step, numbered, over what it is doing, with its expectation', () => {
        const lines = setupLines(
            runningState({
                stage: OPERATION_STAGES.copyingContent.label,
                position: { index: 4, total: 7 },
                message: '40 of 103 files',
            }),
        );

        expect(lines).toStrictEqual({
            message: 'Copying the content (4 of 7)',
            subMessage: '40 of 103 files',
            expectation: OPERATION_STAGES.copyingContent.expectation,
        });
    });

    it('shows a push with no step as it came: the sign-in wait', () => {
        const lines = setupLines(
            runningState({ phase: 'auth-recovery', message: 'DA.live session expired', subMessage: undefined }),
        );

        expect(lines).toStrictEqual({
            message: 'DA.live session expired',
            subMessage: undefined,
            expectation: 'Waiting for you to finish signing in',
        });
    });
});

describe('isActivePhase', () => {
    it.each<StorefrontSetupPhase>([
        'idle',
        'repository',
        'storefront-code',
        'code-sync',
        'site-config',
        'content',
        'block-library',
        'publish',
        'cancelling',
        'auth-recovery',
        'github-app',
    ])('%s is a run still going, so closing the wizard cancels it', (phase) => {
        expect(isActivePhase(phase)).toBe(true);
    });

    it.each<StorefrontSetupPhase>(['completed', 'error', 'complete'])(
        '%s is not a run to cancel',
        (phase) => {
            expect(isActivePhase(phase)).toBe(false);
        },
    );
});

describe('toStartEdsConfig', () => {
    const complete: EDSConfig = {
        accsHost: 'https://accs.example.com',
        storeViewCode: 'default',
        customerGroup: 'general',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
    };

    it('passes a complete config through with every field kept', () => {
        expect(toStartEdsConfig(complete)).toStrictEqual(complete);
    });

    it.each(['repoName', 'daLiveOrg', 'daLiveSite'] as const)(
        'refuses a config with no %s',
        (field) => {
            expect(toStartEdsConfig({ ...complete, [field]: '' })).toBeUndefined();
        },
    );

    it('refuses a missing config', () => {
        expect(toStartEdsConfig(undefined)).toBeUndefined();
    });
});

describe('applyProgress', () => {
    it('shows the push and records its phase for the cancel', () => {
        const next = applyProgress(runningState(), {
            phase: 'content',
            message: 'Copying content',
            subMessage: '4 of 10 pages',
            progress: 54,
        });
        expect(next.phase).toBe('content');
        expect(next.message).toBe('Copying content');
        expect(next.subMessage).toBe('4 of 10 pages');
        expect(next.progress).toBe(54);
        expect(next.partialState).toStrictEqual({
            ...runningState().partialState,
            contentCopied: false,
        });
    });

    it("keeps the push's step, its number and the run's start", () => {
        const next = applyProgress(runningState(), {
            phase: 'content',
            stage: OPERATION_STAGES.copyingContent.label,
            position: { index: 4, total: 7 },
            message: '40 of 103 files',
            progress: 54,
            startedAt: 1_760_000_000_000,
        });

        expect(next).toMatchObject({
            stage: OPERATION_STAGES.copyingContent.label,
            position: { index: 4, total: 7 },
            startedAt: 1_760_000_000_000,
        });
    });

    it('drops the step for a push with none, and keeps the clock running', () => {
        const running = runningState({ stage: 'Copying the content', startedAt: 1_760_000_000_000 });

        const next = applyProgress(running, { phase: 'auth-recovery', message: 'Sign in again', progress: -1 });

        expect(next.stage).toBeUndefined();
        expect(next.position).toBeUndefined();
        expect(next.startedAt).toBe(1_760_000_000_000);
    });

    it('records the repo for cleanup when a push carries it', () => {
        const next = applyProgress(initialSetupState('Starting storefront setup'), {
            phase: 'repository',
            message: 'Repository created',
            progress: 10,
            repoUrl: 'https://github.com/new-owner/new-repo',
            repoOwner: 'new-owner',
            repoName: 'new-repo',
        });
        expect(next.partialState).toStrictEqual({
            repoCreated: true,
            contentCopied: false,
            phase: 'repository',
            repoUrl: 'https://github.com/new-owner/new-repo',
            repoOwner: 'new-owner',
            repoName: 'new-repo',
        });
    });

    it('marks content copied once the run leaves the content phase', () => {
        const next = applyProgress(runningState(), {
            phase: 'block-library',
            message: 'Setting up blocks',
            progress: 60,
        });
        expect(next.partialState.contentCopied).toBe(true);
    });

    it('marks content copied on the terminal push', () => {
        const next = applyProgress(initialSetupState('Starting storefront setup'), {
            phase: 'complete',
            message: 'Done',
            progress: 100,
        });
        expect(next.partialState.contentCopied).toBe(true);
    });

    it('does not mark content copied before the content phase ends', () => {
        const before = applyProgress(initialSetupState('Starting storefront setup'), {
            phase: 'content',
            message: 'Copying content',
            progress: 50,
        });
        expect(before.partialState.contentCopied).toBe(false);
    });
});

describe('applyComplete', () => {
    it('moves to completed at full progress with the warnings, and everything created', () => {
        const next = applyComplete(runningState(), {
            message: 'Storefront live',
            githubRepo: 'test-owner/test-repo',
            warnings: ['Product pages will not render'],
        });
        expect(next).toStrictEqual({
            ...runningState(),
            phase: 'completed',
            message: 'Storefront live',
            warnings: ['Product pages will not render'],
            progress: 100,
            partialState: {
                ...runningState().partialState,
                repoCreated: true,
                contentCopied: true,
                phase: 'completed',
            },
        });
    });

    it('supplies its own message when the push has none', () => {
        const next = applyComplete(runningState(), { message: '', githubRepo: 'o/r' });
        expect(next.message).toBe('Storefront published successfully!');
    });
});

describe('applyError', () => {
    it('moves to error with the push message and detail', () => {
        const next = applyError(runningState(), { message: 'Publish failed', error: 'HTTP 502' });
        expect(next).toStrictEqual({
            ...runningState(),
            phase: 'error',
            message: 'Publish failed',
            error: 'HTTP 502',
        });
    });

    it('supplies its own message when the push has none', () => {
        expect(applyError(runningState(), { message: '', error: 'HTTP 502' }).message).toBe(
            'An error occurred',
        );
    });
});

describe('applyIncompleteConfig', () => {
    it('stops on an error that sends the SC back to the Storefront step', () => {
        expect(applyIncompleteConfig(runningState())).toStrictEqual({
            ...runningState(),
            phase: 'error',
            error: 'Storefront configuration is incomplete — go back and finish the Storefront step.',
        });
    });
});

describe('the AEM Code Sync pause', () => {
    const appRequired: StorefrontGitHubAppRequiredPayload = {
        owner: 'test-owner',
        repo: 'test-repo',
        installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
        message: 'Install AEM Code Sync to continue',
    };

    it('pauses on the install dialog, keeping what the run already created', () => {
        expect(applyGitHubAppRequired(runningState(), appRequired)).toStrictEqual({
            ...runningState(),
            phase: 'github-app',
            message: 'GitHub App installation required',
            githubAppData: appRequired,
        });
    });

    it('resumes at code sync and drops the dialog when the App is seen', () => {
        const paused = applyGitHubAppRequired(runningState(), appRequired);
        expect(applyInstallDetected(paused)).toStrictEqual({
            ...runningState(),
            phase: 'code-sync',
            message: 'AEM Code Sync installed — setup is continuing',
            subMessage: undefined,
            githubAppData: undefined,
        });
    });
});
