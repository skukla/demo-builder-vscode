/**
 * agentPhaseChannel — hand-backs: a structured "waiting for you" that reaches the
 * hand-back sinks with its button AND the phase sinks as a line.
 */

import {
    reportHandBack,
    withHandBackSinks,
    withPhaseSinks,
    type HandBack,
} from '@/core/utils/agentPhaseChannel';

const INSTALL: HandBack = {
    title: 'install the AEM Code Sync GitHub App on acme/shop',
    detail: 'The run resumes by itself once it is installed.',
    action: { label: 'Install App', url: 'https://github.com/apps/aem-code-sync/installations/new' },
};

describe('reportHandBack', () => {
    it('reaches the hand-back sinks with the whole hand-back', async () => {
        const seen: HandBack[] = [];
        await withHandBackSinks([(h) => seen.push(h)], async () => reportHandBack(INSTALL));
        expect(seen).toStrictEqual([INSTALL]);
    });

    it('reaches the phase sinks as one line naming the wait', async () => {
        const lines: string[] = [];
        await withPhaseSinks([(m) => lines.push(m)], async () => reportHandBack(INSTALL));
        expect(lines).toStrictEqual(['Waiting for you — install the AEM Code Sync GitHub App on acme/shop']);
    });

    it('is a no-op outside a tool call', () => {
        expect(() => reportHandBack(INSTALL)).not.toThrow();
    });

    it('a broken sink does not cost the operation', async () => {
        const seen: HandBack[] = [];
        await withHandBackSinks(
            [
                () => {
                    throw new Error('sink broke');
                },
                (h) => seen.push(h),
            ],
            async () => reportHandBack(INSTALL),
        );
        expect(seen).toStrictEqual([INSTALL]);
    });
});
