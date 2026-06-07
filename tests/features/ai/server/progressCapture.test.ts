/**
 * progressCapture tests — capturing sendMessage into a sink and mapping events to
 * a lean phase timeline / result extraction.
 */

import {
    lastCompleteData,
    lastErrorData,
    toPhaseTimeline,
    withCapturedProgress,
    type CapturedEvent,
} from '@/features/ai/server/progressCapture';
import type { HandlerContext } from '@/types/handlers';

describe('progressCapture', () => {
    it('captures sendMessage events into the sink and still calls the base', async () => {
        const baseSend = jest.fn(async () => undefined);
        const base = { sendMessage: baseSend } as unknown as HandlerContext;
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
});
