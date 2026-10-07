/**
 * brokenLinksRecord: the content copy's broken links, kept on the project.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readBrokenLinks, writeBrokenLinks } from '@/features/eds/services/storefront/brokenLinksRecord';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

function storefrontProject(metadata: Record<string, unknown> = {}): Project {
    return createMockProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata,
            },
        },
    });
}

describe('brokenLinksRecord', () => {
    it('keeps what the copy found and reads it back', () => {
        const project = storefrontProject({ githubRepo: 'o/r' });

        writeBrokenLinks(project, [{ link: '/fr', pages: ['/footer'] }]);

        expect(readBrokenLinks(project)).toStrictEqual([{ link: '/fr', pages: ['/footer'] }]);
        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata?.githubRepo).toBe('o/r');
    });

    it('clears the record when the copy found none', () => {
        const project = storefrontProject({ brokenLinks: [{ link: '/fr', pages: [] }] });

        writeBrokenLinks(project, []);

        expect(readBrokenLinks(project)).toStrictEqual([]);
        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).not.toHaveProperty('brokenLinks');
    });

    it('reads nothing from a project made before the record, or a malformed one', () => {
        expect(readBrokenLinks(storefrontProject())).toStrictEqual([]);
        expect(readBrokenLinks(storefrontProject({ brokenLinks: [{ link: 3 }, 'x'] }))).toStrictEqual([]);
    });

    it('leaves a project with no storefront alone', () => {
        const project = createMockProject({ componentInstances: {} });

        writeBrokenLinks(project, [{ link: '/fr', pages: [] }]);

        expect(project.componentInstances).toStrictEqual({});
    });
});
