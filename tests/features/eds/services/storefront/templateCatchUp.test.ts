/**
 * When the storefront report may offer "Bring the code up to date with the template"
 * (EDS-13f step 05, owner 2026-10-04: fork sync only for forks). Only a repository
 * GitHub records as a FORK of one of Demo Builder's patched templates, and only when
 * it is behind: a generated repository shares no history with the template, so the
 * only way to modernise it would overwrite the SC's work, and it is never offered.
 */

import { templateCatchUpOf } from '@/features/eds/services/storefront/templateCatchUp';
import { makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';

const B2B_TEMPLATE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const OWN = { owner: 'steve', repo: 'my-storefront' };

const CATALOG = [
    makeDemoPackage({
        id: 'bodea',
        storefronts: {
            'eds-paas': makeStorefront({
                templateOwner: B2B_TEMPLATE.owner,
                templateRepo: B2B_TEMPLATE.repo,
                codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' },
                codePatches: ['header-nav-tools-defensive'],
            }),
        },
    }),
    makeDemoPackage({
        id: 'isle5',
        storefronts: { 'eds-paas': makeStorefront({ templateOwner: 'stephen-garner-adobe', templateRepo: 'isle5' }) },
    }),
];

describe('templateCatchUpOf', () => {
    it('offers a fork of one of our templates that is behind, on its own default branch', () => {
        const status = {
            isFork: true,
            behindBy: 3,
            parentFullName: 'Adobe-Commerce/Boilerplate-B2B-Template',
            defaultBranch: 'main',
        };

        expect(templateCatchUpOf(OWN, status, CATALOG)).toEqual({
            repository: OWN,
            branch: 'main',
            template: B2B_TEMPLATE,
            behindBy: 3,
        });
    });

    it.each([
        ['GitHub could not be read', null],
        ['a generated repository (not a fork)', { isFork: false, behindBy: 0 }],
        ['a fork already up to date', { isFork: true, behindBy: 0, parentFullName: 'adobe-commerce/boilerplate-b2b-template', defaultBranch: 'main' }],
        ['a fork of a template we do not patch', { isFork: true, behindBy: 4, parentFullName: 'stephen-garner-adobe/isle5', defaultBranch: 'main' }],
        ["a fork of a colleague's repository", { isFork: true, behindBy: 4, parentFullName: 'someone/aistore', defaultBranch: 'main' }],
        ['a fork whose parent GitHub did not name', { isFork: true, behindBy: 4, defaultBranch: 'main' }],
        ['a fork whose branch GitHub did not name', { isFork: true, behindBy: 4, parentFullName: 'adobe-commerce/boilerplate-b2b-template' }],
    ])('offers nothing for %s', (_label, status) => {
        expect(templateCatchUpOf(OWN, status, CATALOG)).toBeUndefined();
    });
});
