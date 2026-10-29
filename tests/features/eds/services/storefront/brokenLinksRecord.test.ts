/**
 * brokenLinksRecord: the content copy's broken links, kept on the project.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { brokenLinksLine, brokenLinksSentence, readBrokenLinks, writeBrokenLinks } from '@/features/eds/services/storefront/brokenLinksRecord';
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

// What a reset's last view says about them (EDS-64): a note naming each link and its page.
describe('brokenLinksSentence', () => {
    it('says nothing when there are none', () => {
        expect(brokenLinksSentence(undefined)).toBeUndefined();
        expect(brokenLinksSentence([])).toBeUndefined();
    });

    it('names each link with the page it is on', () => {
        expect(
            brokenLinksSentence([
                { link: '/checkout/cart', pages: ['/footer'] },
                { link: '/fr', pages: ['/store-switcher'] },
            ]),
        ).toBe('2 links in the copied content go to missing pages: /checkout/cart (on /footer), /fr (on /store-switcher).');
    });

    it('says one link in the singular', () => {
        expect(brokenLinksSentence([{ link: '/fr', pages: ['/a', '/b'] }])).toBe(
            '1 link in the copied content goes to a missing page: /fr (on /a, /b).',
        );
    });

    it('names three and says how many more, pointing at Diagnostics for the rest', () => {
        const links = ['/a', '/b', '/c', '/d', '/e'].map((link) => ({ link, pages: ['/footer'] }));

        expect(brokenLinksSentence(links)).toContain('/c (on /footer) and 2 more (Diagnostics lists them all).');
        expect(brokenLinksSentence(links)).not.toContain('/d');
    });
});

// The "Project Created" screen's one line (EDS-64): a count, and where the list is.
describe('brokenLinksLine', () => {
    it('says nothing when there are none', () => {
        expect(brokenLinksLine([])).toBeUndefined();
    });

    it('counts them and points at Diagnostics', () => {
        expect(brokenLinksLine([{ link: '/fr', pages: ['/a'] }])).toBe(
            '1 link in the copied content goes to a missing page. Diagnostics lists them.',
        );
        expect(brokenLinksLine([{ link: '/a', pages: [] }, { link: '/b', pages: [] }])).toBe(
            '2 links in the copied content go to missing pages. Diagnostics lists them.',
        );
    });
});
