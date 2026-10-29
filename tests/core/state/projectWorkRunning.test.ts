/**
 * projectWorkRunning — the creations and resets running on each project in this
 * window (PL-82). The projects list reads it to show a tile as "Creating" or
 * "Resetting"; a project's status is never written to its file, so nothing else can
 * say so. It must be cleared on BOTH outcomes, survive a nested listing of the same
 * path, and say when it changes.
 */

import {
    onWorkChanged,
    runningCreations,
    runningWork,
    whileRunning,
} from '@/core/state/projectWorkRunning';

describe('whileRunning', () => {
    it('lists the project as running only while its work runs', async () => {
        let during: string | undefined;

        await whileRunning('/p/new', 'creating', async () => {
            during = runningWork('/p/new');
        });

        expect(during).toBe('creating');
        expect(runningWork('/p/new')).toBeUndefined();
    });

    it('lists a reset as resetting', async () => {
        let during: string | undefined;

        await whileRunning('/p/reset', 'resetting', async () => {
            during = runningWork('/p/reset');
        });

        expect(during).toBe('resetting');
        expect(runningWork('/p/reset')).toBeUndefined();
    });

    it('lists a republish as republishing', async () => {
        let during: string | undefined;

        await whileRunning('/p/republish', 'republishing', async () => {
            during = runningWork('/p/republish');
        });

        expect(during).toBe('republishing');
        expect(runningWork('/p/republish')).toBeUndefined();
    });

    it('says resetting while a reset runs, even when a republish of the same path does too', async () => {
        // A reset republishes as one of its steps; the larger job is the one to name.
        let during: string | undefined;

        await whileRunning('/p/reset-republish', 'resetting', () =>
            whileRunning('/p/reset-republish', 'republishing', async () => {
                during = runningWork('/p/reset-republish');
            }),
        );

        expect(during).toBe('resetting');
    });

    it('unlists work that fails, and passes the failure on', async () => {
        await expect(
            whileRunning('/p/broken', 'creating', async () => {
                throw new Error('clone failed');
            }),
        ).rejects.toThrow('clone failed');

        expect(runningWork('/p/broken')).toBeUndefined();
    });

    it('answers what the work resolves to', async () => {
        await expect(whileRunning('/p/x', 'resetting', async () => 42)).resolves.toBe(42);
    });

    it('keeps the outer run listed when an inner listing of the same path ends', async () => {
        // The agent lists its whole run; the creation step inside lists the path again.
        let afterInner: string | undefined;

        await whileRunning('/p/nested', 'creating', async () => {
            await whileRunning('/p/nested', 'creating', async () => undefined);
            afterInner = runningWork('/p/nested');
        });

        expect(afterInner).toBe('creating');
        expect(runningWork('/p/nested')).toBeUndefined();
    });

    it('says creating while a creation runs, even when a reset of the same path does too', async () => {
        let during: string | undefined;

        await whileRunning('/p/both', 'resetting', () =>
            whileRunning('/p/both', 'creating', async () => {
                during = runningWork('/p/both');
            }),
        );

        expect(during).toBe('creating');
    });

    it('lists only creations as running creations', async () => {
        await whileRunning('/p/a', 'creating', () =>
            whileRunning('/p/b', 'resetting', async () => {
                expect(runningCreations()).toEqual(['/p/a']);
            }),
        );
        expect(runningCreations()).toStrictEqual([]);
    });

    it('says when work starts and when it ends, until told to stop', async () => {
        const heard = jest.fn();
        const subscription = onWorkChanged(heard);

        await whileRunning('/p/told', 'resetting', async () => {
            expect(heard).toHaveBeenCalledTimes(1);
        });
        expect(heard).toHaveBeenCalledTimes(2);

        subscription.dispose();
        await whileRunning('/p/told', 'resetting', async () => undefined);
        expect(heard).toHaveBeenCalledTimes(2);
    });
});
