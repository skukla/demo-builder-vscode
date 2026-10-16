/**
 * creationsRunning — which project creations are running in this window (PL-82).
 * The projects list reads it to show a tile as "Creating"; a project's status is
 * never written to its file, so nothing else can say so. It must be cleared on BOTH
 * outcomes, survive a nested listing of the same path, and say when it changes.
 */

import {
    isCreationRunning,
    onCreationsChanged,
    runningCreations,
    whileCreating,
} from '@/core/state/creationsRunning';

describe('whileCreating', () => {
    it('lists the project as running only while its creation runs', async () => {
        let during = false;

        await whileCreating('/p/new', async () => {
            during = isCreationRunning('/p/new');
        });

        expect(during).toBe(true);
        expect(isCreationRunning('/p/new')).toBe(false);
    });

    it('unlists a creation that fails, and passes the failure on', async () => {
        await expect(
            whileCreating('/p/broken', async () => {
                throw new Error('clone failed');
            }),
        ).rejects.toThrow('clone failed');

        expect(isCreationRunning('/p/broken')).toBe(false);
    });

    it('answers what the creation resolves to', async () => {
        await expect(whileCreating('/p/x', async () => 42)).resolves.toBe(42);
    });

    it('keeps the outer run listed when an inner listing of the same path ends', async () => {
        // The agent lists its whole run; the creation step inside lists the path again.
        let afterInner = false;

        await whileCreating('/p/nested', async () => {
            await whileCreating('/p/nested', async () => undefined);
            afterInner = isCreationRunning('/p/nested');
        });

        expect(afterInner).toBe(true);
        expect(isCreationRunning('/p/nested')).toBe(false);
    });

    it('lists every running path', async () => {
        await whileCreating('/p/a', async () => {
            expect(runningCreations()).toEqual(['/p/a']);
        });
        expect(runningCreations()).toStrictEqual([]);
    });

    it('says when a creation starts and when it ends, until told to stop', async () => {
        const heard = jest.fn();
        const subscription = onCreationsChanged(heard);

        await whileCreating('/p/told', async () => {
            expect(heard).toHaveBeenCalledTimes(1);
        });
        expect(heard).toHaveBeenCalledTimes(2);

        subscription.dispose();
        await whileCreating('/p/told', async () => undefined);
        expect(heard).toHaveBeenCalledTimes(2);
    });
});
