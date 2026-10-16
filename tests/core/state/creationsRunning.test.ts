/**
 * creationsRunning — which project creations are running in this window (PL-82).
 * The projects list reads it to tell a project being created from one whose
 * creation failed or was cut off, so the list must be cleared on BOTH outcomes.
 */

import { isCreationRunning, whileCreating } from '@/core/state/creationsRunning';

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

    it('says nothing about a project that is not being created', () => {
        expect(isCreationRunning('/p/never')).toBe(false);
    });
});
