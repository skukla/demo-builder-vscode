/**
 * progressCapture tests — capturing sendMessage into a sink and mapping events to
 * a lean phase timeline / result extraction.
 */

import {
    lastCompleteData,
    lastErrorData,
    payloadOfEvent,
    toPhaseTimeline,
    withCapturedProgress,
    type CapturedEvent,
} from '@/features/ai/server/progressCapture';
import { withHandBackSinks, withPhaseSinks, type HandBack } from '@/core/utils/agentPhaseChannel';
import type { StorefrontGitHubAppRequiredPayload } from '@/types/webviewPayloads';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/** What `pauseForGitHubApp` sends, typed to the payload the wizard dialog reads. */
const APP_REQUIRED: StorefrontGitHubAppRequiredPayload = {
    owner: 'acme',
    repo: 'shop',
    installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
    message: 'AEM Code Sync is not installed on acme/shop',
};

describe('progressCapture', () => {
    // 2026-10-08: an agent-run creation waited 27 minutes for the App while this
    // event sat in the sink and the card read "Creating the project".
    it('hands the AEM Code Sync install back to the user, with the install page as the button', async () => {
        const base = createMockHandlerContext({ sendMessage: jest.fn(async () => undefined) });
        const seen: HandBack[] = [];
        const ctx = withCapturedProgress(base, []);

        await withHandBackSinks([(h) => seen.push(h)], () =>
            ctx.sendMessage('storefront-setup-github-app-required', APP_REQUIRED),
        );

        expect(seen).toStrictEqual([
            {
                title: 'install the AEM Code Sync GitHub App on acme/shop',
                detail: 'The run resumes by itself once it is installed.',
                action: { label: 'Install App', url: APP_REQUIRED.installUrl },
            },
        ]);
    });

    it('does not hand back on an event missing the repository or the install page', async () => {
        const base = createMockHandlerContext({ sendMessage: jest.fn(async () => undefined) });
        const seen: HandBack[] = [];
        const ctx = withCapturedProgress(base, []);

        await withHandBackSinks([(h) => seen.push(h)], () =>
            ctx.sendMessage('storefront-setup-github-app-required', { owner: 'acme' }),
        );

        expect(seen).toStrictEqual([]);
    });

    it("forwards the storefront setup's phases to the agent channel, and only those", async () => {
        const base = createMockHandlerContext({ sendMessage: jest.fn(async () => undefined) });
        const lines: string[] = [];
        const ctx = withCapturedProgress(base, []);

        await withPhaseSinks([(m) => lines.push(m)], async () => {
            await ctx.sendMessage('storefront-setup-progress', {
                phase: 'site-config',
                message: 'Verifying AEM Code Sync',
                subMessage: 'acme/shop',
                progress: 48,
            });
            await ctx.sendMessage('storefront-setup-progress', { phase: 'repo', progress: 10 });
            await ctx.sendMessage('reset-progress', { phase: 'x', message: 'Resetting' });
        });

        expect(lines).toStrictEqual(['Verifying AEM Code Sync — acme/shop']);
    });

    it('shows the wait in the timeline the agent reads, as a progress line', () => {
        expect(toPhaseTimeline([{ type: 'storefront-setup-github-app-required', data: APP_REQUIRED }])).toEqual([
            {
                phase: 'site-config',
                status: 'progress',
                message:
                    'Waiting for the user to install the AEM Code Sync GitHub App on acme/shop ' +
                    '(asked in VS Code; the run resumes by itself)',
            },
        ]);
    });

    it('captures sendMessage events into the sink and still calls the base', async () => {
        const baseSend = jest.fn(async () => undefined);
        const base = createMockHandlerContext({ sendMessage: baseSend });
        const sink: CapturedEvent[] = [];
        const ctx = withCapturedProgress(base, sink);

        await ctx.sendMessage('x-progress', { phase: 'a', progress: 5 });

        expect(sink).toEqual([{ type: 'x-progress', data: { phase: 'a', progress: 5 } }]);
        expect(baseSend).toHaveBeenCalledWith('x-progress', { phase: 'a', progress: 5 });
    });

    it('maps events to a lean phase timeline and ignores unknown types', () => {
        const events: CapturedEvent[] = [
            { type: 'x-progress', data: { phase: 'repo', message: 'creating', progress: 10 } },
            { type: 'x-noise', data: { whatever: true } },
            { type: 'x-error', data: { phase: 'dalive', error: 'boom' } },
            { type: 'x-complete', data: { repoUrl: 'u' } },
        ];
        expect(toPhaseTimeline(events)).toEqual([
            { phase: 'repo', status: 'progress', message: 'creating', progress: 10 },
            { phase: 'dalive', status: 'error', message: 'boom' },
            { phase: 'complete', status: 'complete' },
        ]);
    });

    it('extracts the last complete / error payloads', () => {
        const events: CapturedEvent[] = [
            { type: 'x-error', data: { error: 'first' } },
            { type: 'x-complete', data: { repoUrl: 'u' } },
        ];
        expect(lastCompleteData(events)).toEqual({ repoUrl: 'u' });
        expect(lastErrorData(events)).toEqual({ error: 'first' });
        expect(lastCompleteData([])).toBeUndefined();
    });
    it('prefers error over message, falls back to message, and reports neither when neither is a string', () => {
        const events: CapturedEvent[] = [
            { type: 'x-error', data: { phase: 'a', error: 'from error', message: 'ignored' } },
            { type: 'x-error', data: { phase: 'b', message: 'from message' } },
            { type: 'x-error', data: { phase: 'c', error: 500, message: 42 } },
        ];

        expect(toPhaseTimeline(events)).toStrictEqual([
            { phase: 'a', status: 'error', message: 'from error' },
            { phase: 'b', status: 'error', message: 'from message' },
            { phase: 'c', status: 'error', message: undefined },
        ]);
    });

    it('drops a progress message that is not a string and a progress value that is not a number', () => {
        const events: CapturedEvent[] = [
            { type: 'x-progress', data: { phase: 'p', message: 7, progress: '80' } },
        ];

        expect(toPhaseTimeline(events)).toStrictEqual([
            { phase: 'p', status: 'progress', message: undefined, progress: undefined },
        ]);
    });

    it('answers with the LAST complete payload, scanning back past later events', () => {
        const events: CapturedEvent[] = [
            { type: 'a-complete', data: { which: 'first' } },
            { type: 'b-complete', data: { which: 'second' } },
            { type: 'b-progress', data: { phase: 'after' } },
        ];

        expect(lastCompleteData(events)).toStrictEqual({ which: 'second' });
        expect(lastErrorData(events)).toBeUndefined();
    });

    it('reads a terminal event sitting at index 0, and an absent payload becomes an empty object', () => {
        expect(lastCompleteData([{ type: 'x-complete', data: undefined }])).toStrictEqual({});
        expect(lastErrorData([{ type: 'x-error', data: undefined }])).toStrictEqual({});
    });

    it('returns the payload of the LAST event with exactly the named type', () => {
        const events: CapturedEvent[] = [
            { type: 'github-auth-status', data: { authenticated: false } },
            { type: 'github-auth-status', data: { authenticated: true } },
            { type: 'dalive-auth-status', data: { authenticated: false } },
        ];

        expect(payloadOfEvent(events, 'github-auth-status')).toStrictEqual({
            authenticated: true,
        });
    });

    it('matches the named type exactly — a longer type ending in it is not a match', () => {
        const events: CapturedEvent[] = [{ type: 'x-github-auth-status', data: { a: 1 } }];

        expect(payloadOfEvent(events, 'github-auth-status')).toBeUndefined();
        expect(payloadOfEvent([{ type: 'only', data: undefined }], 'only')).toStrictEqual({});
        expect(payloadOfEvent([], 'only')).toBeUndefined();
    });
});
