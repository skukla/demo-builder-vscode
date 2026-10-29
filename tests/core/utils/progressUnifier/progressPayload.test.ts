/**
 * The determinate progress update every exact and timed reporter sends.
 */
import { determinateProgress } from '@/core/utils/progressUnifier/progressPayload';

const context = { stepIndex: 1, totalSteps: 4, stepName: 'Install Node 20' };

describe('determinateProgress', () => {
    it('places the step percent inside its share of the overall bar', () => {
        expect(determinateProgress(context, 50, '50% downloaded')).toEqual({
            overall: { percent: 38, currentStep: 2, totalSteps: 4, stepName: 'Install Node 20' },
            command: { type: 'determinate', percent: 50, detail: '50% downloaded', confidence: 'exact' },
        });
    });

    it('a finished step fills its whole share', () => {
        const update = determinateProgress(context, 100, 'Complete');
        expect(update.overall.percent).toBe(50);
        expect(update.command?.percent).toBe(100);
    });

    it('the first step at 0 is 0 overall', () => {
        const update = determinateProgress({ ...context, stepIndex: 0 }, 0, 'Starting');
        expect(update.overall).toEqual({
            percent: 0, currentStep: 1, totalSteps: 4, stepName: 'Install Node 20',
        });
    });

    it('carries the confidence it is given', () => {
        expect(determinateProgress(context, 100, 'Complete', 'synthetic').command?.confidence)
            .toBe('synthetic');
    });
});
