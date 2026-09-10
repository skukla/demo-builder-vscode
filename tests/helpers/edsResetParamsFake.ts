/**
 * The `extractResetParams` stand-in two dashboard suites share.
 *
 * WHAT IT IS. A 49-line implementation, byte-identical in
 * `dashboard/handlers/dashboardHandlers-eds` and
 * `projects-dashboard/handlers/dashboardHandlers-dalive-auth` — two different
 * features — that exists so the reset handler receives valid params. Neither
 * suite ever overrides it and neither asserts its error text.
 *
 * WHAT IT IS NOT: the real thing, and its own comment claiming it "mirrors real
 * implementation" is out of date. Measured 2026-09-02 against
 * `edsResetParams.ts`:
 *
 *   - the error strings differ ("Missing EDS metadata: GitHub repository not
 *     configured" against "EDS metadata missing - no GitHub repository
 *     configured"), so a suite asserting on production's wording would fail
 *     against this and vice versa;
 *   - it has no `daLiveSite` fallback to the repo name. The real function grew
 *     one on 2026-08-23 because its absence made reset refuse every migrated
 *     project; this copy still refuses them;
 *   - it does not validate the repo format or the GitHub slug characters, both
 *     of which reach a Helix URL in production;
 *   - it does not resolve the storefront config from brand and stack, so
 *     template and content-source values here are frozen literals.
 *
 * The divergence is recorded rather than fixed because these suites do not
 * exercise any of it — the branches are dead in both. The real improvement is
 * for them to drive `jest.requireActual` with an injected packages fixture,
 * which is a change to what they cover rather than a de-duplication, and is
 * filed rather than smuggled in here.
 */

import type { Project } from '@/types/base';

/** What the stand-in answers with — the fields the reset handler reads. */
export interface FakeResetParamsResult {
    success: boolean;
    error?: string;
    params?: Record<string, unknown>;
}

/**
 * The implementation both suites install on their `extractResetParams` mock.
 *
 * @param project - the project whose EDS metadata is read
 */
export function fakeExtractResetParams(project: Project): FakeResetParamsResult {
    const edsInstance = project?.componentInstances?.['eds-storefront'];
    const metadata = edsInstance?.metadata || {};

    if (!metadata.githubRepo) {
        return {
            success: false,
            error: 'Missing EDS metadata: GitHub repository not configured',
        };
    }
    if (!metadata.daLiveOrg || !metadata.daLiveSite) {
        return {
            success: false,
            error: 'Missing DA.live configuration: org and site are required',
        };
    }

    const [repoOwner, repoName] = (metadata.githubRepo as string).split('/');
    return {
        success: true,
        params: {
            repoOwner,
            repoName,
            daLiveOrg: metadata.daLiveOrg,
            daLiveSite: metadata.daLiveSite,
            templateOwner: 'skukla',
            templateRepo: 'citisignal-eds-boilerplate',
            contentSource: {
                org: 'demo-system-stores',
                site: 'accs-citisignal',
                indexPath: 'full-index.json',
            },
            project,
        },
    };
}
