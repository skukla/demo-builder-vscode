/**
 * StorefrontSetupStep — what a progress push actually decides.
 *
 * Every field of `storefront-setup-progress` drives something the SC can see or
 * something the cancel-cleanup depends on: the loader's three rows, whether the
 * step counts as "still running", and the partial state the cancel request
 * carries so the extension knows what to tear down. Those bookkeeping rules have
 * been wrong twice before — `repoCreated` was gated on a phase that could never
 * carry a repo URL, and `contentCopied` compared the wire's 'complete' against
 * the webview-local 'completed' — so this suite pins the decisions rather than
 * the rendering.
 */

import {
    cancelPayloads,
    pushProgress,
    renderStep,
    resetDriver,
    subscribedMessageTypes,
} from './StorefrontSetupStep.driver.testUtils';
import { screen } from '@testing-library/react';
import type { StorefrontSetupProgressPhase } from '@/types/webviewPayloads';

beforeEach(() => {
    resetDriver();
});

const loader = () => screen.getByTestId('loading');
const lastCancelPartialState = () => cancelPayloads().at(-1)?.partialState;

describe('StorefrontSetupStep — idle', () => {
    it('blocks Continue and shows only the loader', () => {
        const { setCanProceed } = renderStep();

        expect(setCanProceed).toHaveBeenCalledWith(false);
        expect(loader()).toHaveTextContent('Starting storefront setup...');
        expect(loader()).toHaveAttribute('data-progress', '0');
        expect(loader()).toHaveAttribute('data-size', 'L');
        // 'idle' has no static expectation to show — the switch's default arm.
        expect(loader()).toHaveAttribute('data-helper-text', '');
        expect(screen.queryByText('Storefront Setup Failed')).not.toBeInTheDocument();
        expect(screen.queryByText('Storefront Published')).not.toBeInTheDocument();
        expect(screen.queryByTestId('github-app-dialog')).not.toBeInTheDocument();
    });

    it('reports the untouched partial state when the wizard closes straight away', () => {
        const { unmount } = renderStep();

        unmount();

        expect(lastCancelPartialState()).toEqual({
            repoCreated: false,
            contentCopied: false,
            phase: 'idle',
        });
    });
});

describe('StorefrontSetupStep — the loader rows', () => {
    it('shows the message, sub-message and progress the push carried', () => {
        renderStep();

        pushProgress({
            phase: 'publish',
            message: 'Publishing content...',
            subMessage: '12 of 40 paths',
            progress: 70,
        });

        expect(loader()).toHaveTextContent('Publishing content...');
        expect(loader()).toHaveAttribute('data-sub-message', '12 of 40 paths');
        expect(loader()).toHaveAttribute('data-progress', '70');
    });

    // Row 3 is a STATIC expectation per phase. Each phase gets its own value so
    // the block never reflows; a phase falling through to its neighbour's arm is
    // exactly what these cases catch.
    const HELPER_TEXT: Array<[StorefrontSetupProgressPhase, string]> = [
        ['repository', 'This may take up to 30 seconds'],
        ['storefront-code', 'This may take about a minute'],
        ['code-sync', 'This may take up to a minute'],
        ['site-config', 'This may take up to a minute'],
        ['content', 'This may take 1-2 minutes'],
        ['block-library', 'This may take up to 30 seconds'],
        ['publish', 'This may take 2-3 minutes'],
        ['auth-recovery', 'Waiting for you to finish signing in'],
        ['cancelling', 'This should only take a moment'],
    ];

    it.each(HELPER_TEXT)('phase %s expects "%s"', (phase, helperText) => {
        renderStep();

        pushProgress({ phase, message: `Working on ${phase}`, progress: 10 });

        expect(loader()).toHaveAttribute('data-helper-text', helperText);
    });

    it("stops showing the loader once the pipeline's own final push lands", () => {
        renderStep();

        pushProgress({ phase: 'complete', message: 'Done', progress: 100 });

        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
});

describe('StorefrontSetupStep — repo bookkeeping for cancel-cleanup', () => {
    it('records the repo identity from a push that carries it', () => {
        const { unmount } = renderStep();

        pushProgress({
            phase: 'repository',
            message: 'Creating repository...',
            progress: 10,
            repoUrl: 'https://github.com/test-org/test-repo',
            repoOwner: 'test-org',
            repoName: 'test-repo',
        });
        unmount();

        expect(lastCancelPartialState()).toEqual({
            repoCreated: true,
            repoUrl: 'https://github.com/test-org/test-repo',
            repoOwner: 'test-org',
            repoName: 'test-repo',
            contentCopied: false,
            phase: 'repository',
        });
    });

    it('leaves the repo unrecorded when the push carries no repo URL', () => {
        const { unmount } = renderStep();

        pushProgress({ phase: 'repository', message: 'Creating repository...', progress: 10 });
        unmount();

        expect(lastCancelPartialState()).toEqual({
            repoCreated: false,
            contentCopied: false,
            phase: 'repository',
        });
    });
});

describe('StorefrontSetupStep — contentCopied bookkeeping', () => {
    const contentCopiedAfter = (pushes: Parameters<typeof pushProgress>[0][]): boolean => {
        const { unmount } = renderStep();
        pushes.forEach(pushProgress);
        unmount();
        return lastCancelPartialState()?.contentCopied === true;
    };

    it('stays false while the pipeline is still short of the content phase', () => {
        expect(
            contentCopiedAfter([{ phase: 'repository', message: 'Creating...', progress: 10 }]),
        ).toBe(false);
    });

    it('stays false while the content phase is still pushing its own updates', () => {
        expect(
            contentCopiedAfter([
                { phase: 'content', message: 'Copying content...', progress: 50 },
                { phase: 'content', message: 'Copying content: nav', progress: 53 },
            ]),
        ).toBe(false);
    });

    it('flips true when the pipeline leaves the content phase', () => {
        expect(
            contentCopiedAfter([
                { phase: 'content', message: 'Copying content...', progress: 50 },
                { phase: 'publish', message: 'Publishing...', progress: 70 },
            ]),
        ).toBe(true);
    });

    it("flips true on the wire's terminal 'complete', whatever came before it", () => {
        expect(
            contentCopiedAfter([
                { phase: 'complete', message: 'Setup complete', progress: 100 },
                // A later active push is only there to make the state readable:
                // the 'complete' phase is not active, so it sends no cancel.
                { phase: 'publish', message: 'Publishing...', progress: 70 },
            ]),
        ).toBe(true);
    });
});

describe('StorefrontSetupStep — cancel reads the latest config, not the mounted one', () => {
    it('sends the DA.live target the wizard holds at unmount time', () => {
        const { rerenderWith, unmount } = renderStep();
        pushProgress({ phase: 'content', message: 'Copying content...', progress: 50 });

        rerenderWith({
            state: {
                edsConfig: {
                    repoName: 'test-repo',
                    daLiveOrg: 'renamed-org',
                    daLiveSite: 'renamed-site',
                },
            },
        });
        unmount();

        expect(cancelPayloads().at(-1)?.edsConfig).toEqual({
            daLiveOrg: 'renamed-org',
            daLiveSite: 'renamed-site',
        });
    });

    it('survives a config that has gone away before the wizard closed', () => {
        const { rerenderWith, unmount } = renderStep();
        pushProgress({ phase: 'content', message: 'Copying content...', progress: 50 });

        rerenderWith({ state: { edsConfig: undefined } });
        unmount();

        const sent = cancelPayloads().at(-1)?.edsConfig;
        expect(sent).toBeDefined();
        expect(Object.keys(sent ?? {}).sort()).toEqual(['daLiveOrg', 'daLiveSite']);
        expect(sent?.daLiveOrg).toBeUndefined();
        expect(sent?.daLiveSite).toBeUndefined();
    });
});

describe('StorefrontSetupStep — subscriptions', () => {
    it('subscribes to all four pipeline channels and releases every one on unmount', () => {
        const { unmount } = renderStep();

        expect(subscribedMessageTypes()).toEqual([
            'storefront-setup-complete',
            'storefront-setup-error',
            'storefront-setup-github-app-required',
            'storefront-setup-progress',
        ]);

        unmount();

        expect(subscribedMessageTypes()).toEqual([]);
    });
});
