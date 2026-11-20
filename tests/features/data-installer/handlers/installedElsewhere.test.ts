/**
 * The removal doors' stop, by the pack's display name (step-07 D6). Which instances differ is
 * `instanceKey.ts`'s, with its own suite.
 */

import { installedElsewhereLine } from '@/features/data-installer/handlers/installedElsewhere';

describe('installedElsewhereLine', () => {
    it('names the pack as the SC knows it', () => {
        expect(installedElsewhereLine('Luma')).toBe(
            'Luma is installed on another Commerce instance. Switch the project back to remove it.'
        );
    });
});
