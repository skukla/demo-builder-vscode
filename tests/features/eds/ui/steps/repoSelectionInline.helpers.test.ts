/**
 * The repository picker's pure verdicts: is the choice valid, is the selection
 * the repo this step just created, and how the reset control presents itself.
 *
 * READINESS. "Reset to template?" was one checkbox defaulting to off, asked
 * regardless of what the repo contained. On 2026-07-29 an existing repo was
 * selected with it unticked and setup ran to `Complete` on a repo with no
 * `scripts/scripts.js` — Inspector Tagging, PDP404, and Quick Edit each skipped,
 * and the run reported success.
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
 * DEFAULT BRANCH. Reported 2026-08-19: `skukla/kukla-bodea` (default branch
 * `master`, no `main`) was selected and Code Sync failed forever. Every EDS path
 * assumes `main` — the Helix status URL, `DEFAULT_BRANCH`, and the reset's
 * `git clone --depth 1 --branch main`. SOFTENED 2026-08-20 from a block to a
 * warning: the justification moved three times in one session (see
 * `.rptc/backlog/2026-08-20-storefront-branch-is-hardcoded-main.md`), and a block
 * needs a settled one where a warning does not. The repo still cannot work, but
 * that is the user's call to override, not our inference's to enforce.
 */

import {
    computeRepoValid,
    describeResetOption,
    isJustCreatedSelection,
} from '@/features/eds/ui/steps/repoSelectionInline.helpers';
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
const NOT_CREATED: RepoCreationState = { isCreated: false, isCreating: false };

/** computeRepoValid(repoMode, repoCreationState, selectedRepo, isLoading, readiness, resetOn) */
function valid(readiness: RepoReadinessState | undefined, resetOn: boolean) {
    return computeRepoValid('existing', CREATED, SELECTED, false, readiness, resetOn);
}

/** A selected repo, on whichever branch. */
function onBranch(defaultBranch?: string): GitHubRepoItem {
    return {
        id: 'skukla/kukla-bodea',
        name: 'kukla-bodea',
        fullName: 'skukla/kukla-bodea',
        htmlUrl: 'https://github.com/skukla/kukla-bodea',
        defaultBranch,
    };
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

    it('treats an unanswered reset as not chosen for a non-storefront', () => {
        // The parameter is optional; leaving it out must not read as consent.
        expect(
            computeRepoValid('existing', CREATED, SELECTED, false, {
                kind: 'not-a-storefront',
                missing: ['head.html'],
            })
        ).toBe(false);
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

    it('is not valid while the repository list is still loading', () => {
        expect(
            computeRepoValid('existing', CREATED, SELECTED, true, { kind: 'storefront' }, false)
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

describe('computeRepoValid — the new-repo path', () => {
    it('is valid only once creation has finished', () => {
        expect(computeRepoValid('new', NOT_CREATED, undefined, false)).toBe(false);
        expect(computeRepoValid('new', { isCreated: true, isCreating: true }, undefined, false)).toBe(
            false
        );
        expect(computeRepoValid('new', CREATED, undefined, false)).toBe(true);
    });
});

describe('computeRepoValid — default branch', () => {
    it('does NOT block a repo whose default branch is master', () => {
        // Warned about at the point of choice instead. The user may know
        // something we do not, and being stuck beats being wrong only when we
        // are certain — which, here, we are not.
        expect(
            computeRepoValid('existing', NOT_CREATED, onBranch('master'), false, {
                kind: 'storefront',
            })
        ).toBe(true);
    });

    it('still blocks a non-storefront until a reset is ticked, whatever the branch', () => {
        // The readiness gate is unchanged and is the one that still holds: it
        // rests on a measurement (files absent) rather than an inference.
        expect(
            computeRepoValid(
                'existing',
                NOT_CREATED,
                onBranch('master'),
                false,
                { kind: 'not-a-storefront', missing: ['head.html'] },
                false
            )
        ).toBe(false);
    });

    it('accepts a repo on main', () => {
        expect(
            computeRepoValid('existing', NOT_CREATED, onBranch('main'), false, {
                kind: 'storefront',
            })
        ).toBe(true);
    });

    it('does not block when the branch is unknown', () => {
        // An older cached repo list carries no defaultBranch. Absence is not
        // evidence of a wrong branch, and blocking on it would strand every
        // user whose cache predates this field.
        expect(
            computeRepoValid('existing', NOT_CREATED, onBranch(undefined), false, {
                kind: 'storefront',
            })
        ).toBe(true);
    });
});

describe('isJustCreatedSelection', () => {
    it('is true when the selection is the repository creation recorded', () => {
        expect(isJustCreatedSelection({ fullName: SELECTED.fullName }, SELECTED)).toBe(true);
    });

    it('is false for a different repository', () => {
        expect(isJustCreatedSelection({ fullName: 'skukla/other' }, SELECTED)).toBe(false);
    });

    it('is false when nothing was created or nothing is selected', () => {
        expect(isJustCreatedSelection(undefined, SELECTED)).toBe(false);
        expect(isJustCreatedSelection({ fullName: SELECTED.fullName }, undefined)).toBe(false);
    });
});

/**
 * Presentation. The control stays rendered in every state — including its notice
 * row — so the layout never reflows as readiness resolves.
 */
describe('describeResetOption', () => {
    it('shows an empty repo as already handled, not as a question', () => {
        expect(describeResetOption({ kind: 'empty' }, false, false)).toStrictEqual({
            checked: true,
            locked: true,
            tone: 'info',
            message: 'This repository is empty — it will be set up from the template.',
        });
    });

    it('names the missing files and says setup cannot complete', () => {
        expect(
            describeResetOption(
                { kind: 'not-a-storefront', missing: ['scripts/scripts.js', 'scripts/delayed.js'] },
                false,
                false,
            )
        ).toStrictEqual({
            checked: false,
            locked: false,
            tone: 'warn',
            message:
                'Missing scripts/scripts.js, scripts/delayed.js. Setup cannot complete without a reset.',
        });
    });

    it('reflects the tick for a non-storefront the user has chosen to reset', () => {
        expect(
            describeResetOption({ kind: 'not-a-storefront', missing: ['head.html'] }, true, false)
                .checked
        ).toBe(true);
    });

    it('keeps the original prompt for a real storefront', () => {
        expect(describeResetOption({ kind: 'storefront' }, false, false)).toStrictEqual({
            checked: false,
            locked: false,
            tone: 'none',
            message: '',
        });
        expect(describeResetOption({ kind: 'storefront' }, true, false)).toStrictEqual({
            checked: true,
            locked: false,
            tone: 'warn',
            message:
                'This will delete and recreate the repository with the selected template content.',
        });
    });

    it('treats an unknown readiness like a storefront', () => {
        expect(describeResetOption(undefined, true, false).tone).toBe('warn');
        expect(describeResetOption({ kind: 'undetermined' }, false, false).tone).toBe('none');
    });

    it('says nothing before a repo is selected', () => {
        expect(describeResetOption({ kind: 'empty' }, true, true)).toStrictEqual({
            checked: false,
            locked: true,
            tone: 'none',
            message: '',
        });
    });

    it('says nothing while the repo is unusable for a reason a reset cannot fix', () => {
        expect(
            describeResetOption({ kind: 'not-a-storefront', missing: ['head.html'] }, true, false, true)
        ).toStrictEqual({ checked: false, locked: true, tone: 'none', message: '' });
    });
});
