/**
 * `projectTargetsStorefront` — the guard that keeps prewarm off the wrong catalog.
 *
 * `storefront-setup-start` is registered by BOTH the wizard
 * (`ProjectCreationHandlerRegistry`) and the dashboard (`edsHandlers`). In the
 * wizard the project being created does not exist yet, so the
 * `getCurrentProject()` the setup path used to read returned WHATEVER WAS LAST
 * OPEN — and prewarm then enumerated that other project's Commerce scope.
 *
 * Measured 2026-08-18. A colleague with one existing project created a second
 * storefront; prewarm ran against the FIRST project's store view and reported
 * `No index was found for this request`. Her new storefront's products were
 * never asked for. A second run on a machine with zero projects skipped prewarm
 * entirely and looked clean, which is why it read as a per-person problem.
 *
 * `configureHandlers.ts:91-95` already documents this exact hazard for the same
 * call, one file over: "where there is no project yet — `getCurrentProject()`
 * there would return whatever was last open and write another project's
 * structure onto it."
 */

import { projectTargetsStorefront } from '@/features/eds/services/catalogPrewarmService';
import type { Project } from '@/types';

function projectFor(githubRepo: string | undefined): Project {
    return {
        name: 'demo',
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', metadata: { githubRepo } },
        },
    } as unknown as Project;
}

describe('projectTargetsStorefront', () => {
    it('accepts the project whose storefront IS the repo being set up', () => {
        expect(projectTargetsStorefront(projectFor('skukla/jay-bodea-test'), 'skukla', 'jay-bodea-test'))
            .toBe(true);
    });

    /** The exact 2026-08-18 shape: a different project of the same user's. */
    it('rejects a different project belonging to the same user', () => {
        expect(projectTargetsStorefront(projectFor('fieldorg/field-b2b-demo'), 'fieldorg', 'field-bodea'))
            .toBe(false);
    });

    it('rejects the same repo name under a different owner', () => {
        expect(projectTargetsStorefront(projectFor('someone-else/field-bodea'), 'fieldorg', 'field-bodea'))
            .toBe(false);
    });

    it('matches case-insensitively, as GitHub treats owner and repo', () => {
        expect(projectTargetsStorefront(projectFor('SKukla/Jay-Bodea-Test'), 'skukla', 'jay-bodea-test'))
            .toBe(true);
    });

    /**
     * Fail CLOSED. No recorded repo means we cannot prove the project is this
     * storefront, and prewarming the wrong catalog is worse than not prewarming:
     * it publishes another project's product paths onto this site.
     */
    it('rejects a project with no recorded storefront repo', () => {
        expect(projectTargetsStorefront(projectFor(undefined), 'skukla', 'jay-bodea-test')).toBe(false);
    });

    it('rejects when there is no project at all', () => {
        expect(projectTargetsStorefront(undefined, 'skukla', 'jay-bodea-test')).toBe(false);
    });

    it('rejects a malformed repo string rather than guessing', () => {
        expect(projectTargetsStorefront(projectFor('no-slash-here'), 'skukla', 'jay-bodea-test')).toBe(false);
    });
});
