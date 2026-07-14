/**
 * appStatusDisplay — display text/color mapping for `appStatusSummary`, the
 * sibling of meshStatusDisplay. Surfaces an app status dot on the projects card.
 */

import { getAppStatusDisplay } from '@/core/ui/utils/appStatusDisplay';

describe('getAppStatusDisplay', () => {
    it('maps each known status to text + color + variant', () => {
        expect(getAppStatusDisplay('deployed')).toEqual({
            text: 'App Deployed',
            color: 'green',
            variant: 'success',
        });
        expect(getAppStatusDisplay('error')).toEqual({
            text: 'App Error',
            color: 'red',
            variant: 'error',
        });
        expect(getAppStatusDisplay('not-deployed')).toEqual({
            text: 'Not Deployed',
            color: 'gray',
            variant: 'neutral',
        });
        expect(getAppStatusDisplay('stale')).toEqual({
            text: 'Redeploy App',
            color: 'yellow',
            variant: 'warning',
        });
    });

    it('returns null for unknown or undefined status', () => {
        expect(getAppStatusDisplay(undefined)).toBeNull();
        expect(getAppStatusDisplay('unknown')).toBeNull();
    });
});
