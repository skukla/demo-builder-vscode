/**
 * agentPhaseChannel — hand-backs: a structured "waiting for you" that reaches the
 * hand-back sinks with its button AND the phase sinks as a line; and an operation's
 * steps as an agent hears them.
 */

import {
    phaseSinkHere,
    reportHandBack,
    reportPhase,
    stepPhaseReporter,
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

// An operation's steps, as an agent hears them (progress vocabulary slice 3, owner
// 2026-10-16): each step's name once, as it starts. A step reports again for every line
// under it ("Publishing the pages: 32 of 64 pages"); those lines are the modal's detail,
// and the chat and the agent's notification would otherwise repeat the name sixty times.
describe('stepPhaseReporter', () => {
    it('tells an agent each step once, in order, and a step it comes back to again', async () => {
        const phases: string[] = [];

        await withPhaseSinks([(m) => phases.push(m)], async () => {
            const step = stepPhaseReporter();
            step('Publishing the settings');
            step('Publishing the settings');
            step('Publishing the pages');
            step('Publishing the pages');
            step('Checking the settings');
            step('Publishing the pages');
        });

        expect(phases).toStrictEqual([
            'Publishing the settings',
            'Publishing the pages',
            'Checking the settings',
            'Publishing the pages',
        ]);
    });

    it('says nothing outside an agent call', () => {
        expect(() => stepPhaseReporter()('Publishing the settings')).not.toThrow();
    });
});

describe('phaseSinkHere', () => {
    // A scope that takes the lines from deeper in, and still has to tell the agent
    // listening outside it (creation's integration deploys, 2026-10-16).
    it('reports to the sinks in scope where it was made, from inside another scope', async () => {
        const outer: string[] = [];
        const inner: string[] = [];

        await withPhaseSinks([(line) => outer.push(line)], async () => {
            const toOuter = phaseSinkHere();
            await withPhaseSinks([(line) => inner.push(line)], async () => {
                reportPhase('from deeper in');
                toOuter('for the agent');
            });
        });

        expect(outer).toStrictEqual(['for the agent']);
        expect(inner).toStrictEqual(['from deeper in']);
    });

    it('reports nowhere when made outside any scope, even called from inside one', async () => {
        const inner: string[] = [];
        const toNobody = phaseSinkHere();

        await withPhaseSinks([(line) => inner.push(line)], async () => toNobody('nobody listening'));

        expect(inner).toStrictEqual([]);
    });
});
