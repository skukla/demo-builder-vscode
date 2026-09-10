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
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

describe('progressCapture', () => {
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
