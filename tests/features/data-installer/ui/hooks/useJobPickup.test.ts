/**
 * Whether an accepted job's first status read is still to come (`isPickingUp`): the window keeps
 * waiting until it answers, and a read that finds no record lets go. Ported from
 * `importModalView.test.ts` (step 03, S7), where it lived beside the old window's view decisions.
 */

import { isPickingUp } from '@/features/data-installer/ui/hooks/useJobPickup';

describe('isPickingUp', () => {
    it.each([
        ['no job accepted', undefined, null, undefined, false, false],
        ['accepted, not asked about yet', 'a', null, undefined, false, true],
        ['accepted, the read is out', 'a', null, 'a', true, true],
        ['the read answered with no record', 'a', null, 'a', false, false],
        ['the read answered with this job', 'a', { activationId: 'a' }, 'a', false, false],
        ['an older job on screen, the read is out', 'b', { activationId: 'a' }, 'b', true, true],
    ])('%s', (_label, activation, record, asked, reading, expected) => {
        expect(isPickingUp(activation, record, asked, reading)).toBe(expected);
    });
});
