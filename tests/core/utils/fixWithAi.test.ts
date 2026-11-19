/**
 * Retry, then Fix with AI — and Fix with AI at once for a failure a retry cannot help (owner,
 * 2026-11-19: a merge that cannot find its files left the SC with a Retry that would fail again).
 */

import { failedButtonLabel, RETRIES_BEFORE_FIX } from '@/core/utils/fixWithAi';

describe('failedButtonLabel', () => {
    it('offers Retry until retrying has not helped, when a retry can help', () => {
        expect(failedButtonLabel(0)).toBe('Retry');
        expect(failedButtonLabel(RETRIES_BEFORE_FIX)).toBe('Fix with AI');
    });

    it('offers Fix with AI at once when a retry cannot help', () => {
        expect(failedButtonLabel(0, false)).toBe('Fix with AI');
    });
});
