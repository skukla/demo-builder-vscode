/**
 * The channel a step takes from deep inside an operation to the progress modal it
 * runs in (progress vocabulary slice 2, owner 2026-10-16). A plain progress line from
 * a nested command is only ever line 2; a step reported here is line 1.
 */

import { reportStep, withStepSink } from '@/core/utils/operationStepChannel';

describe('reportStep', () => {
    it('hands the step and the line under it to the modal the run is in, and says it was taken', async () => {
        const sink = jest.fn();

        const taken = await withStepSink(sink, async () => reportStep('Pushing to GitHub', 'demo-org/demo-repo'));

        expect(taken).toBe(true);
        expect(sink.mock.calls).toStrictEqual([['Pushing to GitHub', 'demo-org/demo-repo']]);
    });

    it('reaches the modal however deep the call is', async () => {
        const sink = jest.fn();

        await withStepSink(sink, async () => {
            await Promise.resolve();
            await (async () => reportStep('Saving your changes'))();
        });

        expect(sink.mock.calls).toStrictEqual([['Saving your changes', undefined]]);
    });

    // The caller then reports the step its own way: the notification's message.
    it('takes nothing when no modal is showing the run', () => {
        expect(reportStep('Pushing to GitHub')).toBe(false);
    });

    it('never fails the operation when the modal cannot take the step', async () => {
        const broken = (): void => {
            throw new Error('screen gone');
        };

        const taken = await withStepSink(broken, async () => reportStep('Pushing to GitHub'));

        expect(taken).toBe(true);
    });
});
