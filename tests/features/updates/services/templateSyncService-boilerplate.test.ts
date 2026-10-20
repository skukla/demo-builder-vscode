/**
 * Syncing a colleague's storefront with Adobe's tested boilerplate (EDS-56).
 *
 * The same 3-way apply as a template update, with every coordinate named rather than read
 * from the storefront's template fields, which belong to the colleague's track: Adobe's
 * template is the source, the recorded Adobe base the start, the tested version the end.
 * What is pinned is the git conversation (CLAUDE.md: assert the ARGUMENTS), that a conflict
 * stops with the files named, and that nothing about the colleague's track is touched.
 */

import {
    answer,
    applyStops,
    edsProject,
    gitCalls,
    pushed,
    resetFakes,
    service,
} from './templateSyncService.testUtils';
import type { BoilerplateBase } from '@/features/updates/services/boilerplateBase';

const BASE_SHA = '71a67e027b4b288a67f5cda1fc106d2df9a34805';
const TESTED_SHA = '48bed04d072fff094b49a46709b351bd719b287a';
const BASE: BoilerplateBase = {
    template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
    commit: BASE_SHA,
    lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
    found: 'first-commit',
};

/** A storefront built from kmanns/justrite: its template fields name the colleague. */
const colleagueStorefront = () =>
    edsProject({ templateOwner: 'kmanns', templateRepo: 'justrite', lastSyncedCommit: '5ac7b52a52a5af2fa71137a591c8a6e5e3826a9b' });

beforeEach(() => {
    resetFakes();
});

describe("syncBoilerplate: a colleague's storefront to Adobe's tested boilerplate", () => {
    it("applies Adobe's change from the recorded base to the tested version, .github left out, and pushes it", async () => {
        const project = colleagueStorefront();
        // The apply changed a file, so there is something to commit.
        answer(/^git status --porcelain$/, ' M scripts/commerce.js\n');

        const result = await service().syncBoilerplate(project, { base: BASE, tested: TESTED_SHA });

        const calls = gitCalls();
        // Adobe's template is the source, never the colleague's repository.
        expect(calls).toContainEqual(expect.stringContaining('https://github.com/adobe-commerce/boilerplate-b2b-template.git'));
        expect(calls.join('\n')).not.toContain('github.com/kmanns/justrite');
        expect(calls).toContainEqual(
            expect.stringMatching(new RegExp(`^git diff-tree -r --name-only ${BASE_SHA} ${TESTED_SHA} -- \\. ":\\(exclude\\)\\.github" `)),
        );
        expect(calls).toContainEqual(expect.stringMatching(/^git commit -m "chore: update the Adobe boilerplate to the tested version"/));
        expect(pushed()).toBe(true);
        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: TESTED_SHA });
        // The colleague's track is not this update's to move.
        expect(project.componentInstances?.['eds-storefront']?.metadata).toMatchObject({
            templateOwner: 'kmanns',
            lastSyncedCommit: '5ac7b52a52a5af2fa71137a591c8a6e5e3826a9b',
        });
    });

    it('stops on a conflict with the files named, pushing nothing', async () => {
        applyStops('scripts/commerce.js\n');

        const result = await service().syncBoilerplate(colleagueStorefront(), { base: BASE, tested: TESTED_SHA });

        expect(result).toMatchObject({ success: false, conflicts: ['scripts/commerce.js'] });
        expect(pushed()).toBe(false);
        expect(gitCalls()).toContainEqual('git reset --hard HEAD');
    });

    it('refuses a storefront with no repository of its own, before cloning anything', async () => {
        const result = await service().syncBoilerplate(edsProject({ githubRepo: undefined }), {
            base: BASE,
            tested: TESTED_SHA,
        });

        expect(result.success).toBe(false);
        expect(gitCalls()).toStrictEqual([]);
    });
});
