/**
 * Demo Packages Tests - Bodea package details (thin-layer B2B shape)
 *
 * Structural pins for the bodea package in demo-packages.json:
 * - Hidden rollout state, mesh/addon posture, B2B configFlags pair
 * - Thin-layer shape: boilerplate-b2b-template + b2b codePatchSource/codePatches
 * - Content sources (skukla/accs-bodea + account-chrome overlay)
 * - brandAssets vendor point (theme CSS + customer-group module + head snippet)
 *
 * Split out of demo-packages-data.test.ts (max-lines); the generic
 * cross-package validations live there.
 */

import * as fs from 'fs';
import * as path from 'path';

interface DemoPackage {
    id: string;
    hidden?: boolean;
    requiresMesh?: boolean;
    addons?: Record<string, 'required' | 'optional' | 'excluded'>;
    configFlags?: Record<string, boolean>;
    storefronts: Record<string, Record<string, unknown>>;
}

interface DemoPackagesConfig {
    packages: DemoPackage[];
}

const CUSTOM_B2B_CODE_PATCHES = [
    'header-nav-tools-defensive',
    'product-link-sku-encoding',
    'product-link-sku-slash-encoding',
    'aem-assets-sku-sanitization',
    'commerce-account-sidebar-selector-race',
    'account-page-column-layout',
];

describe('demo-packages.json — bodea package details (thin-layer B2B shape)', () => {
    let packagesConfig: DemoPackagesConfig;
    let schema: Record<string, unknown>;

    beforeAll(() => {
        const packagesPath = path.join(
            __dirname,
            '../../src/features/project-creation/config/demo-packages.json'
        );
        const schemaPath = path.join(
            __dirname,
            '../../src/features/project-creation/config/demo-packages.schema.json'
        );
        packagesConfig = JSON.parse(fs.readFileSync(packagesPath, 'utf-8'));
        schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    });

    function getBodea(): DemoPackage {
        const pkg = packagesConfig.packages.find(p => p.id === 'bodea');
        expect(pkg).toBeDefined();
        return pkg!;
    }

    it('should exist and be hidden', () => {
        const pkg = getBodea();
        expect(pkg.hidden).toBe(true);
    });

    it('should not require mesh', () => {
        const pkg = getBodea();
        expect(pkg.requiresMesh).toBe(false);
    });

    it('should exclude the adobe-commerce-aco addon', () => {
        const pkg = getBodea();
        expect(pkg.addons).toBeDefined();
        expect(pkg.addons!['adobe-commerce-aco']).toBe('excluded');
    });

    it('should have exactly the B2B configFlags pair (booleans only)', () => {
        const pkg = getBodea();
        expect(pkg.configFlags).toEqual({
            'commerce-b2b-enabled': true,
            'commerce-companies-enabled': true,
        });
    });

    it('should have eds-paas and eds-accs storefronts', () => {
        const pkg = getBodea();
        expect(Object.keys(pkg.storefronts).sort()).toEqual(['eds-accs', 'eds-paas']);
    });

    it('should use the boilerplate-b2b-template as template repo for both storefronts', () => {
        const pkg = getBodea();
        Object.values(pkg.storefronts).forEach(sf => {
            expect(sf.templateOwner).toBe('adobe-commerce');
            expect(sf.templateRepo).toBe('boilerplate-b2b-template');
        });
    });

    it('should have codePatchSource pinning the b2b patch family for both storefronts', () => {
        const pkg = getBodea();
        Object.values(pkg.storefronts).forEach(sf => {
            expect(sf.codePatchSource).toEqual({
                owner: 'skukla',
                repo: 'eds-demo-patches',
                path: 'b2b',
                lkgFile: 'b2b/last-known-good',
            });
        });
    });

    it('should carry the same six b2b codePatches as the custom package', () => {
        const pkg = getBodea();
        Object.values(pkg.storefronts).forEach(sf => {
            expect(sf.codePatches).toEqual(CUSTOM_B2B_CODE_PATCHES);
        });
    });

    it('should source content from skukla/accs-bodea for both storefronts', () => {
        const pkg = getBodea();
        Object.values(pkg.storefronts).forEach(sf => {
            expect(sf.contentSource).toEqual({
                org: 'skukla',
                site: 'accs-bodea',
            });
        });
    });

    it('should overlay the account chrome from adobe-commerce/boilerplate-b2b', () => {
        const pkg = getBodea();
        Object.values(pkg.storefronts).forEach(sf => {
            expect(sf.accountContentSource).toEqual({
                org: 'adobe-commerce',
                site: 'boilerplate-b2b',
            });
        });
    });

    it('should carry brandAssets sourcing theme + customer-group files from skukla/accs-bodea@main', () => {
        const pkg = getBodea();
        Object.values(pkg.storefronts).forEach(sf => {
            const brandAssets = sf.brandAssets as {
                source: Record<string, unknown>;
                files: unknown;
            } | undefined;
            expect(brandAssets).toBeDefined();
            expect(brandAssets!.source).toEqual({
                owner: 'skukla',
                repo: 'accs-bodea',
                branch: 'main',
            });
            expect(brandAssets!.files).toEqual([
                { from: 'styles/bodea-theme.css', to: 'styles/bodea-theme.css' },
                { from: 'scripts/bodea-customer-group.js', to: 'scripts/bodea-customer-group.js' },
            ]);
        });
    });

    it('should vendor a head snippet linking the theme and the customer-group module', () => {
        const pkg = getBodea();
        Object.values(pkg.storefronts).forEach(sf => {
            const headSnippet = (sf.brandAssets as { headSnippet?: string } | undefined)
                ?.headSnippet;
            expect(headSnippet).toContain(
                '<link rel="stylesheet" href="/styles/bodea-theme.css">'
            );
            expect(headSnippet).toContain(
                '<script type="module" src="/scripts/bodea-customer-group.js"></script>'
            );
        });
    });

    it('schema declares brandAssets on storefronts (data-driven vendor point)', () => {
        const defs = schema.definitions as Record<
            string,
            { properties?: Record<string, unknown> }
        >;
        expect(defs.storefront.properties).toHaveProperty('brandAssets');
        expect(defs).toHaveProperty('brandAssets');
    });
});
