/**
 * One lookup for "what storefront is this project on": the project's own row
 * first, the shipped catalog second (shareable-demo step 01, decision D2).
 */

import {
    resolveStorefrontForProject,
} from '@/features/components/services/storefrontResolver';
import { ADDED_DEMO_ID_PREFIX } from '@/types/projectFile';
import { makeAddedDemo, makeDemoPackage, makeStorefront } from '../../../helpers/demoPackageFixtures';

const catalog = [
    makeDemoPackage({
        id: 'citisignal',
        name: 'CitiSignal',
        configFlags: { 'commerce-b2b-enabled': false },
        storefronts: {
            'eds-paas': makeStorefront({ name: 'CitiSignal EDS', templateOwner: 'hlxsites' }),
        },
    }),
];

describe('resolveStorefrontForProject', () => {
    it('reads the catalog when the project has no row of its own', () => {
        const result = resolveStorefrontForProject(
            { selectedPackage: 'citisignal', selectedStack: 'eds-paas' },
            catalog,
        );
        expect(result).toEqual({
            package: catalog[0],
            storefront: catalog[0].storefronts['eds-paas'],
            source: 'catalog',
        });
    });

    it('answers with the package and no storefront when the stack has none', () => {
        const result = resolveStorefrontForProject(
            { selectedPackage: 'citisignal', selectedStack: 'headless-paas' },
            catalog,
        );
        expect(result).toEqual({ package: catalog[0], storefront: undefined, source: 'catalog' });
    });

    it('is undefined for an id the catalog does not know, and for no id at all', () => {
        expect(resolveStorefrontForProject({ selectedPackage: 'retired' }, catalog)).toBeUndefined();
        expect(resolveStorefrontForProject({}, catalog)).toBeUndefined();
    });

    it('prefers the project row over the catalog, whatever selectedPackage says', () => {
        const demo = makeAddedDemo({
            name: 'Isle5 by Jen',
            icon: 'isle5',
            configFlags: { 'commerce-b2b-enabled': true },
            configDefaults: { ACCS_WEBSITE_CODE: 'isle5' },
            requiresMesh: 'optional',
            datapack: { name: 'isle5' },
            contentSource: { org: 'jen', site: 'isle5-demo' },
            source: { owner: 'jen', repo: 'isle5-demo', branch: 'demo' },
        });
        const result = resolveStorefrontForProject(
            { selectedPackage: 'citisignal', selectedStack: 'eds-accs', demo },
            catalog,
        );
        expect(result?.source).toBe('project');
        expect(result?.package).toEqual({
            id: `${ADDED_DEMO_ID_PREFIX}jen/isle5-demo`,
            name: 'Isle5 by Jen',
            description: '',
            icon: 'isle5',
            configDefaults: { ACCS_WEBSITE_CODE: 'isle5' },
            configFlags: { 'commerce-b2b-enabled': true },
            requiresMesh: 'optional',
            datapack: { name: 'isle5' },
            integrations: undefined,
            storefronts: { 'eds-accs': result?.storefront },
        });
        expect(result?.storefront).toEqual({
            name: 'Isle5 by Jen',
            description: '',
            source: {
                type: 'git',
                url: 'https://github.com/jen/isle5-demo',
                branch: 'demo',
                gitOptions: { shallow: true },
            },
            contentSource: { org: 'jen', site: 'isle5-demo' },
            templateOwner: 'jen',
            templateRepo: 'isle5-demo',
        });
    });

    it('derives a storefront for the row with no stack and no branch: main, and no patches', () => {
        const result = resolveStorefrontForProject({ demo: makeAddedDemo() }, catalog);
        expect(result?.package.storefronts).toStrictEqual({});
        expect(result?.storefront?.source.branch).toBe('main');
        // D4: a colleague's code is never patched, pinned or vendored into.
        expect(result?.storefront).not.toHaveProperty('codePatches');
        expect(result?.storefront).not.toHaveProperty('codePatchSource');
        expect(result?.storefront).not.toHaveProperty('brandAssets');
        expect(result?.storefront).not.toHaveProperty('byomOverlayUrl');
    });
});
