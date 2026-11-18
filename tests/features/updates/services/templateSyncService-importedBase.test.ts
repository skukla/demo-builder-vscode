/**
 * A storefront update on a project imported from a demo bundle (F252, EDS-72) counts from the
 * template commit the SENDER's code was built on. Creation records that commit as the
 * storefront's `lastSyncedCommit` (`executorEdsPhase-metadata.test.ts`); this pins the other
 * half: the merge diffs the template from exactly that commit, so every Adobe change made
 * between the sender's build and the import is offered. A reset stays refused (F249), leaving
 * the clash choices Fix with AI and Leave It as It Is.
 */

import {
    TEMPLATE_HEAD,
    allGitSucceeds,
    edsProject,
    gitCalls,
    pushed,
    resetFakes,
    service,
} from './templateSyncService.testUtils';
import { IMPORTED_RESET_REFUSED } from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';

/** The template commit the sender's storefront was pinned to (its `builtWith.lkg`). */
const SENDER_BASE = 'c'.repeat(40);

function importedProject(): Project {
    return {
        ...edsProject({ lastSyncedCommit: SENDER_BASE }),
        importedFrom: { bundleName: 'bodea-demo-bundle.zip', commit: 'd'.repeat(40) },
    };
}

beforeEach(() => {
    resetFakes();
    allGitSucceeds();
});

describe("an imported project's storefront update", () => {
    it("diffs the template from the sender's commit to the template's latest", async () => {
        const result = await service().syncWithTemplate(importedProject(), { strategy: 'merge' });

        expect(result).toMatchObject({ success: true, strategy: 'merge' });
        expect(gitCalls()).toContainEqual(
            expect.stringMatching(
                new RegExp(`^git diff-tree -r --name-only ${SENDER_BASE} ${TEMPLATE_HEAD} `)
            )
        );
    });

    it("refuses a reset to the template, so the sender's code is never thrown away", async () => {
        const result = await service().syncWithTemplate(importedProject(), { strategy: 'reset' });

        expect(result).toMatchObject({
            success: false,
            strategy: 'reset',
            error: IMPORTED_RESET_REFUSED,
        });
        expect(pushed()).toBe(false);
    });
});
