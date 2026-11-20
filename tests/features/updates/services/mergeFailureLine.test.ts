/**
 * mergeFailureLine — what an SC reads when a template merge failed (owner, 2026-11-19): git's
 * reason in plain words when it is a known one, else as git said it.
 */

import { mergeFailureLine } from '@/features/updates/services/templateMergeBase';

describe('mergeFailureLine', () => {
    it("says a missing blob as what went wrong, not git's mechanism", () => {
        expect(mergeFailureLine('repository lacks the necessary blob to perform 3-way merge')).toBe(
            "Couldn't merge the changes: the versions of the files the changes were made from aren't available.",
        );
    });

    it('keeps an unknown reason as git said it', () => {
        expect(mergeFailureLine('patch failed')).toBe('The template update could not be applied: patch failed.');
    });
});
