/**
 * Syncing a storefront with its template — WHICH BRANCH of the template is fetched.
 *
 * The template is `main` unless the storefront records a `templateBranch` (an added
 * demo built from another branch). Whatever the branch, it is fetched INTO
 * `template/main`, the one ref every later step names — so the decision shows up in
 * exactly one place, the fetch command the shell is handed, and that is what is
 * asserted here.
 */

import {
    edsProject,
    gitCalls,
    resetFakes,
    service,
} from './templateSyncService.testUtils';

const fetchCommand = (): string | undefined => gitCalls().find((cmd) => cmd.startsWith('git fetch template '));

beforeEach(() => {
    resetFakes();
});

describe('the template branch a sync fetches', () => {
    it.each(['merge', 'reset'] as const)('%s: fetches main when the storefront records no branch', async (strategy) => {
        await service().syncWithTemplate(edsProject(), { strategy });

        expect(fetchCommand()).toBe('git fetch template main');
    });

    it.each(['merge', 'reset'] as const)('%s: fetches a recorded branch into template/main', async (strategy) => {
        await service().syncWithTemplate(edsProject({ templateBranch: 'release-2' }), { strategy });

        expect(fetchCommand()).toBe('git fetch template release-2:refs/remotes/template/main');
    });

    it('fetches main when the recorded branch is not text', async () => {
        await service().syncWithTemplate(edsProject({ templateBranch: 7 }), { strategy: 'reset' });

        expect(fetchCommand()).toBe('git fetch template main');
    });
});
