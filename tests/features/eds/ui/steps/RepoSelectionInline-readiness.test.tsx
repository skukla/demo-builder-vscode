/**
 * Repo readiness gate at selection.
 *
 * "Reset to template?" was one checkbox defaulting to off, asked regardless of
 * what the repo contained. On 2026-07-29 an existing repo was selected with it
 * unticked and setup ran to `Complete` on a repo with no `scripts/scripts.js` —
 * Inspector Tagging, PDP404, and Quick Edit each skipped, and the run reported
 * success.
 *
 * Consent belongs where something can be destroyed. These tests pin the three
 * states to the three right answers:
 *
 *   empty            auto-reset, checkbox checked and disabled — nothing to lose
 *   not-a-storefront reset REQUIRED — setup cannot succeed without it
 *   storefront       ask, exactly as before — the only state with something to lose
 *
 * `undetermined` deliberately does not block. A GitHub blip must not stop setup;
 * the mid-pipeline checks still run. What it withholds is the *destructive*
 * default, never the user's ability to proceed.
 *
 * @jest-environment jsdom
 */

import { computeRepoValid } from '@/features/eds/ui/steps/repoSelectionInline.helpers';
import type {
    RepoCreationState,
    RepoReadinessState,
} from '@/features/eds/ui/steps/repoSelectionInline.helpers';
import type { GitHubRepoItem } from '@/types/webview';

// `id` is the fullName: GitHubRepoItem declares it a string, not GitHub's numeric id.
const SELECTED: GitHubRepoItem = {
    id: 'skukla/demo-builder-test',
    name: 'demo-builder-test',
    fullName: 'skukla/demo-builder-test',
    htmlUrl: 'https://github.com/skukla/demo-builder-test',
};
const CREATED: RepoCreationState = { isCreated: true, isCreating: false };

/** computeRepoValid(repoMode, repoCreationState, selectedRepo, isLoading, readiness, resetOn) */
function valid(readiness: RepoReadinessState | undefined, resetOn: boolean) {
    return computeRepoValid('existing', CREATED, SELECTED, false, readiness, resetOn);
}

describe('computeRepoValid — readiness gate', () => {
    it('blocks a populated non-storefront until reset is chosen', () => {
        // The defect this exists to prevent: proceeding here produced a
        // storefront that reported Complete and could not work.
        expect(valid({ kind: 'not-a-storefront', missing: ['scripts/scripts.js'] }, false)).toBe(
            false
        );
    });

    it('allows a populated non-storefront once reset is chosen', () => {
        expect(valid({ kind: 'not-a-storefront', missing: ['scripts/scripts.js'] }, true)).toBe(
            true
        );
    });

    it('allows a real storefront without reset — that is the normal case', () => {
        expect(valid({ kind: 'storefront' }, false)).toBe(true);
    });

    it('allows an empty repo without the user ticking anything', () => {
        // Empty repos are auto-reset: there is nothing to consent to.
        expect(valid({ kind: 'empty' }, false)).toBe(true);
    });

    it('does not block when readiness is undetermined', () => {
        // A GitHub blip must not stop setup. It withholds the destructive
        // default, not the user's ability to continue.
        expect(valid({ kind: 'undetermined', reason: 'network' }, false)).toBe(true);
    });

    it('does not block before readiness is known', () => {
        // The check is async; the step must not flicker to invalid while it runs.
        expect(valid(undefined, false)).toBe(true);
    });

    it('still requires a selected repo regardless of readiness', () => {
        expect(
            computeRepoValid('existing', CREATED, undefined, false, { kind: 'storefront' }, false)
        ).toBe(false);
    });

    it('leaves the new-repo path untouched', () => {
        // New repos are created from the template and pinned unconditionally;
        // readiness has no bearing on them.
        expect(
            computeRepoValid(
                'new',
                CREATED,
                undefined,
                false,
                { kind: 'not-a-storefront', missing: ['scripts/scripts.js'] },
                false
            )
        ).toBe(true);
    });
});

/**
 * Presentation. The control stays rendered in every state — including its notice
 * row — so the layout never reflows as readiness resolves.
 */
describe('describeResetOption', () => {
    it('shows an empty repo as already handled, not as a question', async () => {
        const { describeResetOption } = await import(
            '@/features/eds/ui/steps/repoSelectionInline.helpers'
        );
        const d = describeResetOption({ kind: 'empty' }, false, false);

        expect(d.checked).toBe(true);
        expect(d.locked).toBe(true);
        expect(d.tone).toBe('info');
        expect(d.message).toMatch(/empty/i);
    });

    it('names the missing files and says setup cannot complete', async () => {
        const { describeResetOption } = await import(
            '@/features/eds/ui/steps/repoSelectionInline.helpers'
        );
        const d = describeResetOption(
            { kind: 'not-a-storefront', missing: ['scripts/scripts.js', 'scripts/delayed.js'] },
            false,
            false,
        );

        expect(d.locked).toBe(false);
        expect(d.tone).toBe('warn');
        expect(d.message).toContain('scripts/scripts.js');
        expect(d.message).toMatch(/cannot complete/i);
    });

    it('keeps the original prompt for a real storefront', async () => {
        const { describeResetOption } = await import(
            '@/features/eds/ui/steps/repoSelectionInline.helpers'
        );
        expect(describeResetOption({ kind: 'storefront' }, false, false).tone).toBe('none');
        expect(describeResetOption({ kind: 'storefront' }, true, false).message).toMatch(
            /delete and recreate/i,
        );
    });

    it('says nothing before a repo is selected', async () => {
        const { describeResetOption } = await import(
            '@/features/eds/ui/steps/repoSelectionInline.helpers'
        );
        const d = describeResetOption({ kind: 'empty' }, true, true);

        expect(d.checked).toBe(false);
        expect(d.tone).toBe('none');
    });
});
