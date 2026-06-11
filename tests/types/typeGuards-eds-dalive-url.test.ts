/**
 * Type Guards Tests - getEdsDaLiveUrl experience branch
 *
 * getEdsDaLiveUrl builds the "Author" button target from the EDS storefront
 * component-instance metadata (daLiveOrg/daLiveSite). It branches on the
 * resolved authoring experience, passed in as a parameter (vscode stays OUT of
 * typeGuards.ts):
 *   - Universal Editor (default): https://da.live/#/<org>/<site>
 *   - Experience Workspace:       https://da.live/canvas#/<org>/<site>/
 *     (param-less, trailing slash = site root; no ?nx/?nxver)
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
        expect(getEdsDaLiveUrl(edsProject, 'universal-editor')).toBe(
            'https://da.live/#/leahrayard/leah-b2b-demo',
        );
    });

    it('returns the param-less Experience Workspace canvas URL for a valid EDS project', () => {
        expect(getEdsDaLiveUrl(edsProject, 'experience-workspace')).toBe(
            'https://da.live/canvas#/leahrayard/leah-b2b-demo/',
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

        expect(getEdsDaLiveUrl(noOrg, 'universal-editor')).toBeUndefined();
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
