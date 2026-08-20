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
 *
 * SOFTENED 2026-08-20 from a block to a warning. Two reasons. The justification
 * moved three times in one session (ours / Adobe's / unresolved — see
 * `.rptc/backlog/2026-08-20-storefront-branch-is-hardcoded-main.md`), and a
 * block needs a settled one where a warning does not. And a later probe showed
 * the branch was never why Helix 404'd here: `admin.hlx.page` returns 401 for a
 * KNOWN site on any ref, including a nonsense one, so the ref is not part of
 * site identity. The repo still cannot work — our seven
 * `main--{repo}--{owner}` builders and the reset's clone both assume `main` —
 * but that is the user's call to override, not our inference's to enforce.
 */

import '@testing-library/jest-dom';
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
    it('does NOT block a repo whose default branch is master', () => {
        // Warned about at the point of choice instead. The user may know
        // something we do not, and being stuck beats being wrong only when we
        // are certain — which, here, we are not.
        expect(
            computeRepoValid('existing', notCreated, repo('master'), false, { kind: 'storefront' })
        ).toBe(true);
    });

    it('still blocks a non-storefront until a reset is ticked, whatever the branch', () => {
        // The readiness gate is unchanged and is the one that still holds: it
        // rests on a measurement (files absent) rather than an inference.
        expect(
            computeRepoValid(
                'existing',
                notCreated,
                repo('master'),
                false,
                { kind: 'not-a-storefront', missing: ['head.html'] },
                false
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

describe('one message at a time', () => {
    // Reported 2026-08-20: the branch notice and the reset warning both showed,
    // both amber, competing. Worse, the reset one was WRONG in that state —
    // "Setup cannot complete without a reset" promises a fix the reset cannot
    // deliver, because `resetToTemplate` clones `--branch main` and this repo
    // has no `main`.
    //
    // So while the repo is unusable for a reason a reset would not fix, the
    // reset control goes quiet and the notice above it speaks alone. That also
    // gives the reset warning its purpose back: it now appears only when a
    // reset genuinely IS the remedy.
    it('silences the reset warning when a reset cannot help', async () => {
        const { ResetToTemplateOption } = await import(
            '@/features/eds/ui/steps/repoSelectionInline.helpers'
        );
        const { render, screen } = await import('@testing-library/react');
        const { TestWrapper } = await import(
            '../components/DaLiveServiceCard.testUtils'
        );

        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={jest.fn()}
                    readiness={{ kind: 'not-a-storefront', missing: ['head.html'] }}
                    unusable
                />
            </TestWrapper>
        );

        expect(screen.queryByText(/Setup cannot complete without a reset/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/head\.html/i)).not.toBeInTheDocument();
    });

    it('still shows it when a reset IS the remedy', async () => {
        const { ResetToTemplateOption } = await import(
            '@/features/eds/ui/steps/repoSelectionInline.helpers'
        );
        const { render, screen } = await import('@testing-library/react');
        const { TestWrapper } = await import(
            '../components/DaLiveServiceCard.testUtils'
        );

        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={jest.fn()}
                    readiness={{ kind: 'not-a-storefront', missing: ['head.html'] }}
                />
            </TestWrapper>
        );

        expect(screen.getByText(/Setup cannot complete without a reset/i)).toBeInTheDocument();
    });
});
