/**
 * appStatusDisplay — the DOT VARIANT for a project card's integrations line.
 *
 * Its text moved to `projectStatusUtils.getAppStatusText` (2026-08-04): the line
 * now counts ("1 of 2 integrations failed"), and a status→string map cannot
 * count. What is left here is colour, which does not depend on how many.
 */

import { getAppStatusDisplay } from '@/core/ui/utils/appStatusDisplay';

describe('getAppStatusDisplay', () => {
    it('maps each known status to colour + variant', () => {
        expect(getAppStatusDisplay('deployed')).toEqual({ color: 'green', variant: 'success' });
        expect(getAppStatusDisplay('error')).toEqual({ color: 'red', variant: 'error' });
        expect(getAppStatusDisplay('not-deployed')).toEqual({ color: 'gray', variant: 'neutral' });
        expect(getAppStatusDisplay('stale')).toEqual({ color: 'yellow', variant: 'warning' });
    });

    it('carries no text — the line that uses this owns its own wording', () => {
        expect(getAppStatusDisplay('deployed')).not.toHaveProperty('text');
    });

    it('returns null for unknown or undefined status', () => {
        expect(getAppStatusDisplay(undefined)).toBeNull();
        expect(getAppStatusDisplay('unknown')).toBeNull();
    });
});
