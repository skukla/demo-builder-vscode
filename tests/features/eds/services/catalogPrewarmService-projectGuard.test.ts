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
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

function projectFor(githubRepo: string | undefined): Project {
    return createMockProject({
        name: 'demo',
        componentInstances: {
            'eds-storefront': { name: 'eds-storefront', status: 'ready', id: 'eds-storefront', metadata: { githubRepo } },
        },
    });
}

describe('projectTargetsStorefront', () => {
    it('accepts the project whose storefront IS the repo being set up', () => {
        expect(projectTargetsStorefront(projectFor('skukla/jay-bodea-test'), 'skukla', 'jay-bodea-test'))
            .toBe(true);
    });

    /** The exact 2026-08-18 shape: a different project of the same user's. */
    it('rejects a different project belonging to the same user', () => {
        expect(projectTargetsStorefront(projectFor('leahrayard/leah-b2b-demo'), 'leahrayard', 'leah-bodea'))
            .toBe(false);
    });

    it('rejects the same repo name under a different owner', () => {
        expect(projectTargetsStorefront(projectFor('someone-else/leah-bodea'), 'leahrayard', 'leah-bodea'))
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

    /**
     * Each of these reaches a DIFFERENT optional link in the chain that reads
     * the recorded repo. A project can be missing its instance map, missing the
     * storefront instance, or holding one that carries no metadata — and the
     * guard has to answer false for all three rather than throw into the setup
     * path it gates.
     */
    it('rejects a project with no component instances at all', () => {
        const bare = createMockProject({ name: 'demo', componentInstances: undefined });

        expect(projectTargetsStorefront(bare, 'skukla', 'jay-bodea-test')).toBe(false);
    });

    it('rejects a project whose instances hold no storefront', () => {
        const noStorefront = createMockProject({ name: 'demo', componentInstances: {} });

        expect(projectTargetsStorefront(noStorefront, 'skukla', 'jay-bodea-test')).toBe(false);
    });

    it('rejects a storefront instance carrying no metadata', () => {
        const noMetadata = createMockProject({
            name: 'demo',
            componentInstances: {
                'eds-storefront': { name: 'eds-storefront', status: 'ready', id: 'eds-storefront' },
            },
        });

        expect(projectTargetsStorefront(noMetadata, 'skukla', 'jay-bodea-test')).toBe(false);
    });

    /**
     * A bare owner with no repo half. The owner MATCHES here on purpose: with a
     * non-matching owner the comparison short-circuits before it would read the
     * absent repo name, so the guard looks fine either way.
     */
    it('rejects a bare owner even when that owner is the right one', () => {
        expect(projectTargetsStorefront(projectFor('skukla'), 'skukla', 'jay-bodea-test'))
            .toBe(false);
    });

    /** Three segments is not a repo name — matching the first two would be a guess. */
    it('rejects a repo string carrying an extra path segment', () => {
        expect(
            projectTargetsStorefront(
                projectFor('skukla/jay-bodea-test/extra'),
                'skukla',
                'jay-bodea-test',
            ),
        ).toBe(false);
    });

});
