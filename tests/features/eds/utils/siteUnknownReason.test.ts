/**
 * What a Helix 404 actually tells us — and what it does not.
 *
 * `admin.hlx.page/status/{owner}/{repo}/main` answers about the SITE, not
 * about the GitHub App. Measured 2026-08-19:
 *
 *     skukla/kukla-bodea      -> 404  x-error: [admin] no such site
 *     skukla/team-bodea-demo  -> 401  x-error: [admin] not authenticated
 *
 * The 404 arrives before authentication, and it is returned for at least three
 * different causes. `appInstallationResolver` maps it to `not-installed`, which
 * `storefrontSetupPhase3` turns into a hard halt reading "AEM Code Sync is not
 * installed on {owner}" — and, on a team org, "ask your team admin". Told to a
 * user whose App IS installed, that is a false errand for two people.
 *
 * Two of the three causes are checkable. This classifier separates them so the
 * remedy offered is the one that would actually work, and so the third is
 * stated as the inference it is rather than as a fact we measured.
 */

import { explainSiteUnknown } from '@/features/eds/utils/siteUnknownReason';

describe('explainSiteUnknown', () => {
    it('names a non-main default branch, because nothing downstream targets it', () => {
        expect(explainSiteUnknown({ defaultBranch: 'master' })).toEqual({
            kind: 'wrong-default-branch',
            branch: 'master',
        });
    });

    it('names the missing storefront files when the branch is fine', () => {
        expect(
            explainSiteUnknown({
                defaultBranch: 'main',
                missingFiles: ['scripts/scripts.js', 'head.html'],
            })
        ).toEqual({ kind: 'not-a-storefront', missing: ['scripts/scripts.js', 'head.html'] });
    });

    it('prefers the branch when BOTH are wrong', () => {
        // Fixing the files would not help while the branch is wrong -- the
        // reset itself clones --branch main. Lead with the blocker that comes
        // first in the causal chain.
        expect(
            explainSiteUnknown({ defaultBranch: 'master', missingFiles: ['head.html'] })
        ).toEqual({ kind: 'wrong-default-branch', branch: 'master' });
    });

    it('infers a missing app only when everything checkable passes', () => {
        expect(explainSiteUnknown({ defaultBranch: 'main', missingFiles: [] })).toEqual({
            kind: 'app-probably-missing',
        });
    });

    it('infers a missing app when the checks are unknown', () => {
        // An older cached repo list carries no branch, and readiness may still
        // be in flight. Unknown must not masquerade as a diagnosed cause --
        // this is the same inference, no better and no worse informed.
        expect(explainSiteUnknown({})).toEqual({ kind: 'app-probably-missing' });
    });

    it('treats main as the only acceptable branch', () => {
        expect(explainSiteUnknown({ defaultBranch: 'trunk' })).toEqual({
            kind: 'wrong-default-branch',
            branch: 'trunk',
        });
    });
});
