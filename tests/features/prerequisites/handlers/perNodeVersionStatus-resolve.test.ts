/**
 * Prerequisites Handlers - the per-Node variant decision the check and continue flows share.
 *
 * `resolvePerNodeVariantStatus` was one copy in each handler until PL-69 pair 20
 * (2026-10-09). The flows differ only in what they do when the tool IS installed (the
 * first pass reuses cached per-version results, the continue pass re-checks), so that
 * step arrives as a callback and this suite pins the three branches around it.
 */

import { resolvePerNodeVariantStatus } from '@/features/prerequisites/handlers/shared';
import type { PerNodeVariantStatus } from '@/features/prerequisites/handlers/shared';

const INSTALLED_EVERYWHERE: PerNodeVariantStatus = {
    perNodeVariantMissing: false,
    missingVariantMajors: [],
    perNodeVersionStatus: [{ version: 'Node 20', major: '20', component: '10.0.0', installed: true }],
};

describe('resolvePerNodeVariantStatus', () => {
    it('reports nothing, and asks nothing, when no majors are required', async () => {
        const whenInstalled = jest.fn().mockResolvedValue(INSTALLED_EVERYWHERE);

        const result = await resolvePerNodeVariantStatus(undefined, true, whenInstalled);

        expect(result).toEqual({ perNodeVariantMissing: false, missingVariantMajors: [], perNodeVersionStatus: [] });
        expect(whenInstalled).not.toHaveBeenCalled();
    });

    it('reports every required major as missing, in order, when the tool is not installed', async () => {
        const whenInstalled = jest.fn().mockResolvedValue(INSTALLED_EVERYWHERE);

        const result = await resolvePerNodeVariantStatus(['18', '20', '24'], false, whenInstalled);

        expect(result).toEqual({
            perNodeVariantMissing: true,
            missingVariantMajors: ['18', '20', '24'],
            perNodeVersionStatus: [
                { version: 'Node 18', major: '18', component: '', installed: false },
                { version: 'Node 20', major: '20', component: '', installed: false },
                { version: 'Node 24', major: '24', component: '', installed: false },
            ],
        });
        expect(whenInstalled).not.toHaveBeenCalled();
    });

    it('does not hand the caller\'s array back as the missing list', async () => {
        const required = ['20'];

        const result = await resolvePerNodeVariantStatus(required, false, jest.fn());

        expect(result.missingVariantMajors).not.toBe(required);
        expect(result.missingVariantMajors).toEqual(['20']);
    });

    it('lets the flow decide when the tool is installed, handing it the required majors', async () => {
        const whenInstalled = jest.fn().mockResolvedValue(INSTALLED_EVERYWHERE);

        const result = await resolvePerNodeVariantStatus(['20'], true, whenInstalled);

        expect(whenInstalled).toHaveBeenCalledTimes(1);
        expect(whenInstalled).toHaveBeenCalledWith(['20']);
        expect(result).toBe(INSTALLED_EVERYWHERE);
    });
});
