/**
 * Storefront Setup Handlers — the wizard's cancel.
 *
 * Leaving the Publish Storefront step while setup runs (Back, or the step's own
 * Cancel) sends `storefront-setup-cancel`. The handler asks first when the run has
 * made something, then stops the run. It removes nothing itself: the run does that
 * once its running step has ended, from its own record of what it made, through the
 * same function the agent's stop reaches (`storefrontSetupHandlers-stop.test.ts`, F275).
 *
 * Until 2026-11-18 this handler deleted things at once, from the webview's guess at
 * what existed, while the running step carried on, with a second cleanup
 * (`CleanupService`) that ran on the Adobe sign-in and never took pages off the CDN.
 */

import type { HandlerContext } from '@/types/handlers';

const mockPerformEdsCleanup = jest.fn();
jest.mock('@/features/projects-dashboard/services/edsExternalCleanup', () => ({
    performEdsCleanup: (...args: unknown[]) => mockPerformEdsCleanup(...args),
}));

import * as vscode from 'vscode';
import {
    handleCancelStorefrontSetup,
    type StorefrontSetupPartialState,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockShowWarningMessage = vscode.window.showWarningMessage as jest.Mock;

const CONFIRM = 'Yes, Cancel';

function createContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
    });
}

/** A partial state that says "the repo exists", which is what arms the question. */
function repoCreated(
    overrides: Partial<StorefrontSetupPartialState> = {}
): StorefrontSetupPartialState {
    return {
        repoCreated: true,
        contentCopied: false,
        phase: 'repository',
        repoOwner: 'demo-org',
        repoName: 'demo-repo',
        ...overrides,
    };
}

/** A context whose setup run is in flight, with its stop. */
function running(): { context: HandlerContext; stop: AbortController } {
    const context = createContext();
    const stop = new AbortController();
    context.sharedState.storefrontSetupAbortController = stop;
    return { context, stop };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockShowWarningMessage.mockResolvedValue(CONFIRM);
});

describe('handleCancelStorefrontSetup — when the confirmation dialog appears', () => {
    it('asks before stopping a run that made something, modally, with one destructive choice', async () => {
        const { context } = running();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Cancelling will delete the GitHub repository and DA.live content created so far. Continue?',
            { modal: true },
            CONFIRM
        );
    });

    it('asks when only DA.live content was copied', async () => {
        const { context } = running();

        await handleCancelStorefrontSetup(context, {
            partialState: repoCreated({ repoCreated: false, contentCopied: true }),
        });

        expect(mockShowWarningMessage).toHaveBeenCalled();
    });

    it('does not ask when nothing was created, and stops the run', async () => {
        const { context, stop } = running();

        const result = await handleCancelStorefrontSetup(context, {
            partialState: { repoCreated: false, contentCopied: false, phase: 'idle' },
        });

        expect(mockShowWarningMessage).not.toHaveBeenCalled();
        expect(stop.signal.aborted).toBe(true);
        expect(result).toEqual({ success: true });
    });

    it('does not ask when there is no payload at all', async () => {
        const { context } = running();

        const result = await handleCancelStorefrontSetup(context);

        expect(mockShowWarningMessage).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });
});

describe('handleCancelStorefrontSetup — declining the dialog', () => {
    it('leaves the run alone', async () => {
        mockShowWarningMessage.mockResolvedValue(undefined);
        const { context, stop } = running();

        const result = await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(stop.signal.aborted).toBe(false);
        expect(context.sharedState.storefrontSetupAbortController).toBe(stop);
        expect(result).toEqual({ success: true });
    });

    it('treats any other dialog answer as a decline', async () => {
        mockShowWarningMessage.mockResolvedValue('Cancel');
        const { context, stop } = running();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(stop.signal.aborted).toBe(false);
    });
});

describe('handleCancelStorefrontSetup — confirmed', () => {
    it('stops the run and removes nothing itself: the run removes what it made after its step', async () => {
        const { context, stop } = running();

        const result = await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(stop.signal.aborted).toBe(true);
        expect(mockPerformEdsCleanup).not.toHaveBeenCalled();
        expect(context.sendMessage).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('removes nothing when no run is in flight: there is no run to say what it made', async () => {
        const context = createContext();

        const result = await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(mockPerformEdsCleanup).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });
});
