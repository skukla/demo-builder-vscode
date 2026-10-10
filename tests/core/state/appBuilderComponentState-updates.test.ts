/**
 * Whether the running app is behind its clone (AB-71), and forgetting a recorded
 * update once it has been applied.
 *
 * `runsOlderCode` is asked by both the update check and Update itself, so the
 * card's badge and the button agree; the cases here are the ones the two share.
 */

import { clearUpdateAvailable, runsOlderCode } from '@/core/state/appBuilderComponentState';
import type { AppBuilderComponentState } from '@/types/base';
import { makeAppBuilderComponent } from './appBuilderComponentState.testUtils';

describe('runsOlderCode', () => {
    it('is true when the deploy recorded one commit and the clone is at another', () => {
        expect(runsOlderCode('aaa111', 'bbb222')).toBe(true);
    });

    it('is false when the clone is at the commit that was deployed', () => {
        expect(runsOlderCode('aaa111', 'aaa111')).toBe(false);
    });

    it('trusts the clone when the deploy recorded no commit', () => {
        expect(runsOlderCode(undefined, 'bbb222')).toBe(false);
    });

    it('is false when the clone has no commit to compare against', () => {
        expect(runsOlderCode('aaa111', undefined)).toBe(false);
    });
});

describe('clearUpdateAvailable', () => {
    it('removes the recorded update and nothing else', () => {
        const base = makeAppBuilderComponent({ kind: 'integration' });
        const state: AppBuilderComponentState = {
            ...base,
            updateAvailable: { commit: 'bbb222', checkedAt: '2026-10-10T00:00:00.000Z' },
        };

        clearUpdateAvailable(state);

        expect(state).toStrictEqual(base);
    });
});
