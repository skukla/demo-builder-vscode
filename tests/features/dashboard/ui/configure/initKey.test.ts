/**
 * keyForInit — a re-opened Configure starts from the project as it is now (PL-76).
 *
 * The entry keys the screen on the `init` payload. A new payload must give a new key
 * (the screen remounts and re-seeds everything); the same payload must keep its key
 * (a re-render while the SC is typing must not wipe the form).
 */

import { keyForInit } from '@/features/dashboard/ui/configure/initKey';

describe('keyForInit', () => {
    it('keeps the key for the same payload, so a re-render does not remount', () => {
        const init = { project: { name: 'bodea' } };

        expect(keyForInit(init)).toBe(keyForInit(init));
    });

    it('gives a re-opened Configure a new key, so it remounts', () => {
        const first = { project: { name: 'bodea' } };
        const reopened = { project: { name: 'bodea' } };

        expect(keyForInit(reopened)).not.toBe(keyForInit(first));
    });
});
