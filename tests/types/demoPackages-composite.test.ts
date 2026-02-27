/**
 * DemoPackage Composite Type Tests
 *
 * Tests for composite types: DemoPackage, DemoPackagesConfig, and module exports.
 * Split from demoPackages.test.ts (primitive types remain there).
 */

import type {
    DemoPackage,
    DemoPackagesConfig,
} from '@/types/demoPackages';

describe('DemoPackage type (nested storefronts structure)', () => {
    it('should accept minimal required fields', () => {
        const pkg: DemoPackage = {
            id: 'test-package',
            name: 'Test Package',
            description: 'Test description',
            configDefaults: {},
            storefronts: {
                'eds-paas': {
                    name: 'Test Storefront',
                    description: 'Test storefront description',
                    source: {
                        type: 'git',
                        url: 'https://github.com/test/repo',
                        branch: 'main',
                        gitOptions: { shallow: true },
                    },
                },
            },
        };

        expect(pkg.id).toBe('test-package');
        expect(pkg.name).toBe('Test Package');
        expect(pkg.storefronts['eds-paas']).toBeDefined();
    });

    it('should NOT have package-level contentSources (content source is per-storefront)', () => {
        const pkg: DemoPackage = {
            id: 'test-package',
            name: 'Test Package',
            description: 'Test description',
            configDefaults: {},
            storefronts: {
                'eds-paas': {
                    name: 'Test Storefront',
                    description: 'Test storefront description',
                    source: {
                        type: 'git',
                        url: 'https://github.com/test/repo',
                        branch: 'main',
                        gitOptions: { shallow: true },
                    },
                    contentSource: {
                        org: 'test-org',
                        site: 'test-site',
                    },
                },
            },
        };

        expect((pkg as Record<string, unknown>).contentSources).toBeUndefined();
        expect(pkg.storefronts['eds-paas'].contentSource).toBeDefined();
    });

    it('should have storefronts keyed by stack ID', () => {
        const pkg: DemoPackage = {
            id: 'citisignal',
            name: 'CitiSignal',
            description: 'Telecommunications demo',
            configDefaults: {},
            storefronts: {
                'headless-paas': {
                    name: 'CitiSignal Headless',
                    description: 'Next.js storefront',
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/citisignal-nextjs',
                        branch: 'master',
                        gitOptions: { shallow: false },
                    },
                },
                'eds-paas': {
                    name: 'CitiSignal EDS + PaaS',
                    description: 'EDS storefront',
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/citisignal-one',
                        branch: 'main',
                        gitOptions: { shallow: true },
                    },
                },
            },
        };

        expect(pkg.storefronts['headless-paas']).toBeDefined();
        expect(pkg.storefronts['eds-paas']).toBeDefined();
        expect(pkg.storefronts['headless-paas'].name).toBe('CitiSignal Headless');
    });

    it('should accept all optional fields', () => {
        const pkg: DemoPackage = {
            id: 'citisignal',
            name: 'CitiSignal',
            description: 'Telecommunications demo',
            icon: 'citisignal',
            featured: true,
            addons: {
                'adobe-commerce-aco': 'optional',
            },
            configDefaults: {
                ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
                ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
            },
            storefronts: {
                'headless-paas': {
                    name: 'CitiSignal Headless',
                    description: 'Next.js storefront',
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/citisignal-nextjs',
                        branch: 'master',
                        gitOptions: { shallow: false },
                    },
                },
            },
        };

        expect(pkg.icon).toBe('citisignal');
        expect(pkg.featured).toBe(true);
        expect(pkg.addons?.['adobe-commerce-aco']).toBe('optional');
        expect(pkg.configDefaults.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
    });

    it('should accept structure matching citisignal package pattern', () => {
        const pkg: DemoPackage = {
            id: 'citisignal',
            name: 'CitiSignal',
            description: 'Telecommunications demo with CitiSignal branding',
            icon: 'citisignal',
            featured: true,
            addons: {
                'custom-addon': 'optional',
                'commerce-block-collection': 'optional',
            },
            configDefaults: {
                ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
                ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
            },
            storefronts: {
                'headless-paas': {
                    name: 'CitiSignal Headless',
                    description: 'Next.js headless storefront with Adobe Commerce API Mesh integration',
                    icon: 'nextjs',
                    featured: true,
                    tags: ['headless', 'nextjs', 'citisignal'],
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/citisignal-nextjs',
                        branch: 'master',
                        gitOptions: { shallow: false },
                    },
                },
                'eds-paas': {
                    name: 'CitiSignal EDS + PaaS',
                    description: 'Edge Delivery Services storefront with Commerce PaaS backend',
                    icon: 'eds',
                    featured: true,
                    tags: ['eds', 'citisignal', 'paas'],
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/citisignal-one',
                        branch: 'main',
                        gitOptions: { shallow: true },
                    },
                },
                'eds-accs': {
                    name: 'CitiSignal EDS + ACCS',
                    description: 'Edge Delivery Services storefront with Commerce Cloud Service backend',
                    icon: 'eds',
                    featured: false,
                    tags: ['eds', 'citisignal', 'accs'],
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/citisignal-one',
                        branch: 'main',
                        gitOptions: { shallow: true },
                    },
                },
            },
        };

        expect(pkg.id).toBe('citisignal');
        expect(pkg.name).toBe('CitiSignal');
        expect(Object.keys(pkg.storefronts)).toHaveLength(3);
        expect(pkg.storefronts['headless-paas'].source.branch).toBe('master');
        expect(pkg.storefronts['eds-paas'].source.branch).toBe('main');
    });

    it('should match actual buildright package with addons', () => {
        const pkg: DemoPackage = {
            id: 'buildright',
            name: 'BuildRight',
            description: 'Construction/hardware demo with BuildRight branding',
            icon: 'buildright',
            featured: false,
            addons: {
                'adobe-commerce-aco': 'required',
            },
            configDefaults: {
                ADOBE_COMMERCE_WEBSITE_CODE: 'buildright',
                ADOBE_COMMERCE_STORE_CODE: 'buildright_store',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'buildright_us',
            },
            storefronts: {
                'eds-paas': {
                    name: 'BuildRight EDS + PaaS',
                    description: 'Edge Delivery Services storefront with Commerce PaaS backend',
                    icon: 'eds',
                    featured: false,
                    tags: ['eds', 'buildright', 'paas'],
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/buildright-one',
                        branch: 'main',
                        gitOptions: { shallow: true },
                    },
                },
                'eds-accs': {
                    name: 'BuildRight EDS + ACCS',
                    description: 'Edge Delivery Services storefront with Commerce Cloud Service backend',
                    icon: 'eds',
                    featured: false,
                    tags: ['eds', 'buildright', 'accs'],
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/buildright-one',
                        branch: 'main',
                        gitOptions: { shallow: true },
                    },
                },
            },
        };

        expect(pkg.addons).toBeDefined();
        expect(pkg.addons?.['adobe-commerce-aco']).toBe('required');
        expect(Object.keys(pkg.storefronts)).toHaveLength(2);
    });
});

describe('DemoPackagesConfig type', () => {
    it('should require version string', () => {
        const config: DemoPackagesConfig = {
            version: '1.0.0',
            packages: [],
        };

        expect(config.version).toBe('1.0.0');
    });

    it('should require packages array', () => {
        const config: DemoPackagesConfig = {
            version: '1.0.0',
            packages: [
                {
                    id: 'test-package',
                    name: 'Test Package',
                    description: 'Test description',
                    configDefaults: {},
                    storefronts: {
                        'eds-paas': {
                            name: 'Test Storefront',
                            description: 'Test storefront description',
                            source: {
                                type: 'git',
                                url: 'https://github.com/test/repo',
                                branch: 'main',
                                gitOptions: { shallow: true },
                            },
                        },
                    },
                },
            ],
        };

        expect(config.packages).toHaveLength(1);
        expect(config.packages[0].id).toBe('test-package');
    });

    it('should match actual demo-packages.json root structure', () => {
        const config: DemoPackagesConfig = {
            version: '1.0.0',
            packages: [
                {
                    id: 'citisignal',
                    name: 'CitiSignal',
                    description: 'Telecommunications demo',
                    icon: 'citisignal',
                    featured: true,
                    configDefaults: {
                        ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
                    },
                    storefronts: {
                        'headless-paas': {
                            name: 'CitiSignal Headless',
                            description: 'Next.js storefront',
                            source: {
                                type: 'git',
                                url: 'https://github.com/skukla/citisignal-nextjs',
                                branch: 'master',
                                gitOptions: { shallow: false },
                            },
                        },
                    },
                },
            ],
        };

        expect(config.version).toBe('1.0.0');
        expect(config.packages[0].id).toBe('citisignal');
        expect(config.packages[0].storefronts['headless-paas']).toBeDefined();
    });
});

describe('type exports from @/types/demoPackages', () => {
    it('should export all DemoPackage types from module', async () => {
        const types = await import('@/types/demoPackages');

        expect(types).toBeDefined();
    });

    it('should NOT export removed helper functions', async () => {
        const types = await import('@/types/demoPackages');

        expect((types as Record<string, unknown>).getAddonAvailability).toBeUndefined();
        expect((types as Record<string, unknown>).isAddonWithSource).toBeUndefined();
    });
});
