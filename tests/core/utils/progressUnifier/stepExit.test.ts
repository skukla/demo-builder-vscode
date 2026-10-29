/**
 * The one decision every progress reporter makes when the spawned step closes.
 */
import { settleStep } from '@/core/utils/progressUnifier/stepExit';

const context = { command: 'brew install fnm' };

describe('settleStep', () => {
    it('exit code 0 resolves', () => {
        const resolve = jest.fn();
        const reject = jest.fn();
        settleStep(0, { continueOnError: false }, context, resolve, reject);
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(reject).not.toHaveBeenCalled();
    });

    it('a non-zero exit rejects, naming the code and the command', () => {
        const resolve = jest.fn();
        const reject = jest.fn();
        settleStep(1, { continueOnError: false }, context, resolve, reject);
        expect(resolve).not.toHaveBeenCalled();
        expect(reject).toHaveBeenCalledWith(new Error('Command failed with code 1: brew install fnm'));
    });

    it('a step that may fail resolves on a non-zero exit', () => {
        const resolve = jest.fn();
        const reject = jest.fn();
        settleStep(1, { continueOnError: true }, context, resolve, reject);
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(reject).not.toHaveBeenCalled();
    });

    it('a null code (killed by a signal) is a failure', () => {
        const resolve = jest.fn();
        const reject = jest.fn();
        settleStep(null, { continueOnError: false }, context, resolve, reject);
        expect(reject).toHaveBeenCalledWith(new Error('Command failed with code null: brew install fnm'));
    });
});
