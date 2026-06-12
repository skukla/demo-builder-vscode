/**
 * Type Guards Tests - getEdsDaLiveUrl experience branch
 *
 * getEdsDaLiveUrl builds the "Author" button target from the EDS storefront
 * component-instance metadata (daLiveOrg/daLiveSite). It branches on the
 * resolved authoring experience, passed in as a parameter (vscode stays OUT of
 * typeGuards.ts), plus an optional ewCanvasBranch param (default '' — param-less):
 *   - Universal Editor (default): https://da.live/#/<org>/<site>
 *   - Experience Workspace (default — empty branch, param-less production canvas):
 *       https://da.live/canvas#/<org>/<site>/index.html
 *     The param-less production canvas now hosts the live EW alpha; only the
 *     concrete doc (`index.html`) is required (the bare root renders blank).
 *   - Experience Workspace (pinned branch — pre-release build):
 *       https://da.live/canvas?nx=<branch>#/<org>/<site>/index.html
 *     `?nx=<branch>` pins the canvas to a specific pre-release da-nx branch.
 *     The branch is sourced from the demoBuilder.daLive.ewCanvasBranch setting
 *     (read by edsHelpers.getEwCanvasBranch); empty (the default) drops the ?nx override.
 *
 * Non-EDS projects and projects missing org/site resolve to undefined.
 */

import { getEdsDaLiveUrl } from '@/types/typeGuards';
import { Project } from '@/types/base';

const edsProject = {
    selectedStack: 'eds-dalive',
    componentInstances: {
        'eds-storefront': {
            id: 'eds-storefront',
            name: 'Edge Delivery Services',
            status: 'deployed',
            metadata: {
                daLiveOrg: 'leahrayard',
                daLiveSite: 'leah-b2b-demo',
            },
        },
    },
} as unknown as Project;

describe('getEdsDaLiveUrl - experience branch', () => {
    it('returns the Universal Editor URL for a valid EDS project', () => {
        expect(getEdsDaLiveUrl(edsProject, 'da-live-classic')).toBe(
            'https://da.live/#/leahrayard/leah-b2b-demo',
        );
    });

    it('returns the param-less production EW canvas URL by default', () => {
        // Default ewCanvasBranch arg is '' → no ?nx override, doc still required.
        expect(getEdsDaLiveUrl(edsProject, 'experience-workspace')).toBe(
            'https://da.live/canvas#/leahrayard/leah-b2b-demo/index.html',
        );
    });

    it('returns the param-less production EW canvas URL when the branch is empty', () => {
        // An empty branch drops the ?nx override → the documented production form.
        expect(getEdsDaLiveUrl(edsProject, 'experience-workspace', '')).toBe(
            'https://da.live/canvas#/leahrayard/leah-b2b-demo/index.html',
        );
    });

    it('pins the canvas to a pre-release branch via the ?nx override', () => {
        expect(getEdsDaLiveUrl(edsProject, 'experience-workspace', 'exp-workspace')).toBe(
            'https://da.live/canvas?nx=exp-workspace#/leahrayard/leah-b2b-demo/index.html',
        );
    });

    it('honors a custom ewCanvasBranch in the ?nx override', () => {
        expect(getEdsDaLiveUrl(edsProject, 'experience-workspace', 'main')).toBe(
            'https://da.live/canvas?nx=main#/leahrayard/leah-b2b-demo/index.html',
        );
    });

    it('defaults to the Universal Editor form when no experience arg is passed (back-compat)', () => {
        expect(getEdsDaLiveUrl(edsProject)).toBe(
            'https://da.live/#/leahrayard/leah-b2b-demo',
        );
    });

    it('returns undefined for a non-EDS project', () => {
        const headless = {
            selectedStack: 'headless',
            componentInstances: {
                'eds-storefront': {
                    metadata: { daLiveOrg: 'org', daLiveSite: 'site' },
                },
            },
        } as unknown as Project;

        expect(getEdsDaLiveUrl(headless, 'experience-workspace')).toBeUndefined();
    });

    it('returns undefined when daLiveOrg is missing', () => {
        const noOrg = {
            selectedStack: 'eds-dalive',
            componentInstances: {
                'eds-storefront': { metadata: { daLiveSite: 'leah-b2b-demo' } },
            },
        } as unknown as Project;

        expect(getEdsDaLiveUrl(noOrg, 'da-live-classic')).toBeUndefined();
    });

    it('returns undefined when daLiveSite is missing', () => {
        const noSite = {
            selectedStack: 'eds-dalive',
            componentInstances: {
                'eds-storefront': { metadata: { daLiveOrg: 'leahrayard' } },
            },
        } as unknown as Project;

        expect(getEdsDaLiveUrl(noSite, 'experience-workspace')).toBeUndefined();
    });
});
