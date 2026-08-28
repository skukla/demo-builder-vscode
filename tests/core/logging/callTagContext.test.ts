/**
 * callTagContext — the ambient call tag (AI-2d).
 *
 * The concurrency test is the point of the whole mechanism: two interleaved
 * calls must each see their own tag across awaits, because interleaving is
 * exactly why the debug log needed tags.
 */

import { currentCallTag, nextCallTag, runWithCallTag } from '@/core/logging/callTagContext';

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('callTagContext', () => {
    it('is undefined outside any call', () => {
        expect(currentCallTag()).toBeUndefined();
    });

    it('carries the tag across awaits inside a call', async () => {
        const tag = nextCallTag();
        await runWithCallTag(tag, async () => {
            expect(currentCallTag()).toBe(tag);
            await tick();
            expect(currentCallTag()).toBe(tag);
        });
        expect(currentCallTag()).toBeUndefined();
    });

    it('keeps CONCURRENT calls separate — the interleaving case', async () => {
        const seen: Array<[number, number | undefined]> = [];
        const call = (tag: number): Promise<void> =>
            runWithCallTag(tag, async () => {
                seen.push([tag, currentCallTag()]);
                await tick();
                seen.push([tag, currentCallTag()]);
                await tick();
                seen.push([tag, currentCallTag()]);
            });

        await Promise.all([call(101), call(202)]);

        // Every observation matches its own call, never the neighbour's.
        for (const [expected, observed] of seen) {
            expect(observed).toBe(expected);
        }
        expect(seen).toHaveLength(6);
    });

    it('tags are monotonic', () => {
        const a = nextCallTag();
        const b = nextCallTag();
        expect(b).toBe(a + 1);
    });
});
