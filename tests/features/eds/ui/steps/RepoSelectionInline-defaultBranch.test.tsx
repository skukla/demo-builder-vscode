/**
 * A repo whose default branch is not `main` cannot be used, and must say so.
 *
 * Reported 2026-08-19. `skukla/kukla-bodea` was selected and the Code Sync step
 * failed forever with "Adobe did not answer... a new repository can take a few
 * minutes to register". Measured against the live endpoint:
 *
 *     GET admin.hlx.page/status/skukla/kukla-bodea/main
 *         -> 404  x-error: [admin] no such site
 *     GET admin.hlx.page/status/skukla/team-bodea-demo/main   (a real storefront)
 *         -> 401  x-error: [admin] not authenticated
 *
 * The 404 arrives BEFORE authentication, so it is about the ref, not the
 * credential. GitHub says the same thing plainly:
 *
 *     GET /repos/skukla/kukla-bodea/commits/main/check-runs
 *         -> 422  No commit found for SHA: main
 *     default_branch: master   (only branch: master)
 *
 * There is no `main`. Every EDS path assumes one — the Helix status URL
 * (`githubAppService`), `DEFAULT_BRANCH` in `helixService`, and the reset
 * itself, which runs `git clone --depth 1 --branch main` and would have failed
 * at Phase 1 even if the user had got that far.
 *
 * So this is caught where the repo is CHOSEN, with the real reason.
 */

import { computeRepoValid } from '@/features/eds/ui/steps/repoSelectionInline.helpers';

const created = { isCreated: true, isCreating: false };
const notCreated = { isCreated: false, isCreating: false };

/** A selected repo, on whichever branch. */
function repo(defaultBranch?: string) {
    return {
        id: 'skukla/kukla-bodea',
        name: 'kukla-bodea',
        fullName: 'skukla/kukla-bodea',
        defaultBranch,
    } as Parameters<typeof computeRepoValid>[2];
}

describe('computeRepoValid — default branch', () => {
    it('rejects a repo whose default branch is master', () => {
        expect(
            computeRepoValid('existing', notCreated, repo('master'), false, { kind: 'storefront' })
        ).toBe(false);
    });

    it('rejects it even when a reset is ticked', () => {
        // The reset would not save it: resetToTemplate clones --branch main,
        // which does not exist on this repo.
        expect(
            computeRepoValid(
                'existing',
                notCreated,
                repo('master'),
                false,
                { kind: 'not-a-storefront', missing: ['head.html'] },
                true
            )
        ).toBe(false);
    });

    it('accepts a repo on main', () => {
        expect(
            computeRepoValid('existing', notCreated, repo('main'), false, { kind: 'storefront' })
        ).toBe(true);
    });

    it('does not block when the branch is unknown', () => {
        // An older cached repo list carries no defaultBranch. Absence is not
        // evidence of a wrong branch, and blocking on it would strand every
        // user whose cache predates this field.
        expect(
            computeRepoValid('existing', notCreated, repo(undefined), false, { kind: 'storefront' })
        ).toBe(true);
    });

    it('does not apply to the new-repo path', () => {
        // A repo created from the template is always on main; there is no
        // selection to police.
        expect(computeRepoValid('new', created, undefined, false)).toBe(true);
    });
});
