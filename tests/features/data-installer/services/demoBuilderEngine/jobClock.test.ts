/**
 * Step timings for engine jobs, in Debug Logs (walk F112): a restore left 2 min 21 s with no line.
 */

import { jobClock, timed } from '@/features/data-installer/services/demoBuilderEngine/jobClock';

describe('jobClock', () => {
    beforeEach(() => jest.useFakeTimers({ now: 0 }));
    afterEach(() => jest.useRealTimers());

    it('logs each step with the seconds since the job began', () => {
        const log = jest.fn();
        const took = jobClock(log, 'Removal of my-luma');

        jest.setSystemTime(12_345);
        took('decided what to take back');

        expect(log).toHaveBeenCalledWith('Removal of my-luma: decided what to take back at 12.3 s');
    });

    it('times one piece of work and hands back its answer', async () => {
        const log = jest.fn();

        const answer = await timed(log, 'Install of my-luma: read the datapack', async () => {
            jest.setSystemTime(4_200);
            return 'rows';
        });

        expect(answer).toBe('rows');
        expect(log).toHaveBeenCalledWith('Install of my-luma: read the datapack in 4.2 s');
    });

    it('CONTROL: logs nothing when the work fails, and lets the failure through', async () => {
        const log = jest.fn();

        await expect(
            timed(log, 'x', async () => Promise.reject(new Error('library down')))
        ).rejects.toThrow('library down');
        expect(log).not.toHaveBeenCalled();
    });
});
