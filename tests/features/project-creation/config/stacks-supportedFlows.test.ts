/**
 * `supportedFlows` config gate (Step 4, config-first): expresses which stacks the
 * content flow may use as DATA, not a hardcoded predicate. EDS stacks support both
 * flows; non-EDS (headless) are commerce-only.
 */

import stacksConfig from '@/features/project-creation/config/stacks.json';

const stacks = (stacksConfig as { stacks: Array<{ id: string; supportedFlows?: string[] }> }).stacks;

describe('stacks.json supportedFlows', () => {
    it('every stack declares supportedFlows', () => {
        for (const s of stacks) {
            expect(Array.isArray(s.supportedFlows)).toBe(true);
        }
    });

    it('EDS stacks support both commerce and content', () => {
        for (const s of stacks.filter(s => s.id.startsWith('eds-'))) {
            expect(s.supportedFlows).toEqual(expect.arrayContaining(['commerce', 'content']));
        }
    });

    it('non-EDS stacks are commerce-only', () => {
        for (const s of stacks.filter(s => !s.id.startsWith('eds-'))) {
            expect(s.supportedFlows).toEqual(['commerce']);
        }
    });
});
