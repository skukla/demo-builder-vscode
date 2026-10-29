/**
 * A step's position in a run whose steps are known before it starts: "(3 of 9)".
 */
import { numberedSteps, stepPosition } from '@/core/utils/numberedSteps';

const STEPS = ['Setting up the repository', 'Setting up the code', 'Copying the content'];

describe('stepPosition', () => {
    it("is the step's place in the list, 1-based, with the list's length", () => {
        expect(stepPosition(STEPS, 'Setting up the code')).toEqual({ index: 2, total: 3 });
    });

    it('is nothing for a step the list does not name', () => {
        expect(stepPosition(STEPS, 'Waiting for you')).toBeUndefined();
    });

    // "1 of 1" says nothing a step alone does not.
    it('is nothing when the run has one step', () => {
        expect(stepPosition(['Copying the content'], 'Copying the content')).toBeUndefined();
    });
});

describe('numberedSteps', () => {
    it('hands each step on with its position, the line under it unchanged', () => {
        const report = jest.fn();

        numberedSteps(STEPS, report)('Copying the content', '40 of 103 files');

        expect(report).toHaveBeenCalledWith('Copying the content', '40 of 103 files', { index: 3, total: 3 });
    });
});
