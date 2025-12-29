/**
 * DemoPackage Type Tests
 *
 * Tests for DemoPackage types that define the unified demo-packages.json structure
 * with nested storefronts (Option A).
 *
 * Structure:
 * - packages[] contain nested storefronts keyed by stack ID
 * - Each package has configDefaults (brand data)
 * - No contentSources (EDS URLs derivable from source.url)
 *
 * TDD: Tests written FIRST to define expected type structure.
 */

import type {
    GitOptions,
    GitSource,
    Submodule,
    Storefront,
    Addons,
    DemoPackage,
    DemoPackagesConfig,
} from '@/types/demoPackages';

describe('GitOptions type', () => {
    it('should require shallow and recursive fields', () => {
        // Given: Git options with both fields (now required)
        const options: GitOptions = {
            shallow: true,
            recursive: false,
        };

        // Then: both should be accessible
        expect(options.shallow).toBe(true);
        expect(options.recursive).toBe(false);
    });
});

describe('GitSource type', () => {
    it('should require type, url, branch, and gitOptions fields', () => {
        // Given: A source configuration with all required fields
        const source: GitSource = {
            type: 'git',
            url: 'https://github.com/example/repo',
            branch: 'main',
            gitOptions: {
                shallow: true,
                recursive: false,
            },
        };

        // Then: all required fields should be accessible
        expect(source.type).toBe('git');
        expect(source.url).toBe('https://github.com/example/repo');
        expect(source.branch).toBe('main');
        expect(source.gitOptions.shallow).toBe(true);
    });

    it('should match actual demo-packages.json source structure', () => {
        // Given: Source matching citisignal headless-paas storefront
        const source: GitSource = {
            type: 'git',
            url: 'https://github.com/skukla/citisignal-nextjs',
            branch: 'master',
            gitOptions: {
                shallow: false,
                recursive: false,
            },
        };

        // Then: all fields match expected values
        expect(source.type).toBe('git');
        expect(source.url).toBe('https://github.com/skukla/citisignal-nextjs');
        expect(source.branch).toBe('master');
        expect(source.gitOptions).toBeDefined();
    });
});

describe('Submodule type', () => {
    it('should require path and repository fields', () => {
        // Given: A submodule definition
        const submodule: Submodule = {
            path: 'src/demo-inspector',
            repository: 'skukla/demo-inspector',
        };

        // Then: all fields should be accessible
        expect(submodule.path).toBe('src/demo-inspector');
        expect(submodule.repository).toBe('skukla/demo-inspector');
    });

    it('should match actual demo-packages.json submodule structure', () => {
        // Given: Submodule matching demo-inspector from headless-paas storefront
        const submodule: Submodule = {
            path: 'src/demo-inspector',
            repository: 'skukla/demo-inspector',
        };

        // Then: fields match expected values
        expect(submodule.path).toBe('src/demo-inspector');
        expect(submodule.repository).toBe('skukla/demo-inspector');
    });
});

describe('Storefront type', () => {
    it('should require name, description, and source fields', () => {
        // Given: A storefront with required fields
        const storefront: Storefront = {
            name: 'Test Storefront',
            description: 'Test description',
            source: {
                type: 'git',
                url: 'https://github.com/test/repo',
                branch: 'main',
                gitOptions: { shallow: true, recursive: false },
            },
        };

        // Then: required fields should be accessible
        expect(storefront.name).toBe('Test Storefront');
        expect(storefront.description).toBe('Test description');
        expect(storefront.source.type).toBe('git');
    });

    it('should accept all optional fields', () => {
        // Given: Storefront with all fields
        const storefront: Storefront = {
            name: 'CitiSignal Headless',
            description: 'Next.js headless storefront',
            icon: 'nextjs',
            featured: true,
            tags: ['headless', 'nextjs', 'citisignal'],
            source: {
                type: 'git',
                url: 'https://github.com/skukla/citisignal-nextjs',
                branch: 'master',
                gitOptions: { shallow: false, recursive: false },
            },
            submodules: {
                'demo-inspector': {
                    path: 'src/demo-inspector',
                    repository: 'skukla/demo-inspector',
                },
            },
        };

        // Then: all fields should be accessible
        expect(storefront.icon).toBe('nextjs');
        expect(storefront.featured).toBe(true);
        expect(storefront.tags).toContain('headless');
        expect(storefront.submodules?.['demo-inspector']?.path).toBe('src/demo-inspector');
    });

    it('should match actual headless-paas storefront from demo-packages.json', () => {
        // Given: Storefront matching citisignal headless-paas
        const storefront: Storefront = {
            name: 'CitiSignal Headless',
            description: 'Next.js headless storefront with Adobe Commerce API Mesh integration',
            icon: 'nextjs',
            featured: true,
            tags: ['headless', 'nextjs', 'citisignal'],
            source: {
                type: 'git',
                url: 'https://github.com/skukla/citisignal-nextjs',
                branch: 'master',
                gitOptions: {
                    shallow: false,
                    recursive: false,
                },
            },
            submodules: {
                'demo-inspector': {
                    path: 'src/demo-inspector',
                    repository: 'skukla/demo-inspector',
                },
            },
        };

        // Then: all fields should match expected values
        expect(storefront.name).toBe('CitiSignal Headless');
        expect(storefront.source.branch).toBe('master');
        expect(storefront.submodules?.['demo-inspector']).toBeDefined();
    });
});

describe('Addons type', () => {
    it('should accept addon with required value', () => {
        // Given: Addons with required addon
        const addons: Addons = {
            'adobe-commerce-aco': 'required',
        };

        // Then: addon value should be accessible
        expect(addons['adobe-commerce-aco']).toBe('required');
    });

    it('should accept addon with optional value', () => {
        // Given: Addons with optional addon
        const addons: Addons = {
            'some-addon': 'optional',
        };

        // Then: addon value should be accessible
        expect(addons['some-addon']).toBe('optional');
    });

    it('should accept multiple addons', () => {
        // Given: Multiple addons
        const addons: Addons = {
            'adobe-commerce-aco': 'required',
            'another-addon': 'optional',
        };

        // Then: all addons should be accessible
        expect(addons['adobe-commerce-aco']).toBe('required');
        expect(addons['another-addon']).toBe('optional');
    });
});

describe('DemoPackage type (nested storefronts structure)', () => {
    it('should accept minimal required fields', () => {
        // Given: Package with minimal required fields
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
                        gitOptions: { shallow: true, recursive: false },
                    },
                },
            },
        };

        // Then: required fields should be accessible
        expect(pkg.id).toBe('test-package');
        expect(pkg.name).toBe('Test Package');
        expect(pkg.storefronts['eds-paas']).toBeDefined();
    });

    it('should NOT have contentSources (derivable from source URL)', () => {
        // Given: Package structure
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
                        gitOptions: { shallow: true, recursive: false },
                    },
                },
            },
        };

        // Then: contentSources should not be in the type
        expect((pkg as Record<string, unknown>).contentSources).toBeUndefined();
    });

    it('should have storefronts keyed by stack ID', () => {
        // Given: Package with multiple storefronts
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
                        gitOptions: { shallow: false, recursive: false },
                    },
                },
                'eds-paas': {
                    name: 'CitiSignal EDS + PaaS',
                    description: 'EDS storefront',
                    source: {
                        type: 'git',
                        url: 'https://github.com/skukla/citisignal-one',
                        branch: 'main',
                        gitOptions: { shallow: true, recursive: false },
                    },
                },
            },
        };

        // Then: storefronts should be accessible by stack ID
        expect(pkg.storefronts['headless-paas']).toBeDefined();
        expect(pkg.storefronts['eds-paas']).toBeDefined();
        expect(pkg.storefronts['headless-paas'].name).toBe('CitiSignal Headless');
    });

    it('should accept all optional fields', () => {
        // Given: Package with all fields
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
                        gitOptions: { shallow: false, recursive: false },
                    },
                },
            },
        };

        // Then: all fields should be accessible
        expect(pkg.icon).toBe('citisignal');
        expect(pkg.featured).toBe(true);
        expect(pkg.addons?.['adobe-commerce-aco']).toBe('optional');
        expect(pkg.configDefaults.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
    });

    it('should match actual citisignal package from demo-packages.json', () => {
        // Given: Package matching citisignal from demo-packages.json
        const pkg: DemoPackage = {
            id: 'citisignal',
            name: 'CitiSignal',
            description: 'Telecommunications demo with CitiSignal branding',
            icon: 'citisignal',
            featured: true,
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
                        gitOptions: { shallow: false, recursive: false },
                    },
                    submodules: {
                        'demo-inspector': {
                            path: 'src/demo-inspector',
                            repository: 'skukla/demo-inspector',
                        },
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
                        gitOptions: { shallow: true, recursive: false },
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
                        gitOptions: { shallow: true, recursive: false },
                    },
                },
            },
        };

        // Then: all fields should match expected values
        expect(pkg.id).toBe('citisignal');
        expect(pkg.name).toBe('CitiSignal');
        expect(Object.keys(pkg.storefronts)).toHaveLength(3);
        expect(pkg.storefronts['headless-paas'].source.branch).toBe('master');
        expect(pkg.storefronts['eds-paas'].source.branch).toBe('main');
    });

    it('should match actual buildright package with addons', () => {
        // Given: Package matching buildright from demo-packages.json
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
                        gitOptions: { shallow: true, recursive: false },
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
                        gitOptions: { shallow: true, recursive: false },
                    },
                },
            },
        };

        // Then: addons should be present and correct
        expect(pkg.addons).toBeDefined();
        expect(pkg.addons?.['adobe-commerce-aco']).toBe('required');
        expect(Object.keys(pkg.storefronts)).toHaveLength(2);
    });
});

describe('DemoPackagesConfig type', () => {
    it('should require version string', () => {
        // Given: Config with version
        const config: DemoPackagesConfig = {
            version: '1.0.0',
            packages: [],
        };

        // Then: version should be accessible
        expect(config.version).toBe('1.0.0');
    });

    it('should require packages array', () => {
        // Given: Config with packages
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
                                gitOptions: { shallow: true, recursive: false },
                            },
                        },
                    },
                },
            ],
        };

        // Then: packages array should be accessible
        expect(config.packages).toHaveLength(1);
        expect(config.packages[0].id).toBe('test-package');
    });

    it('should match actual demo-packages.json root structure', () => {
        // Given: Config matching actual demo-packages.json structure
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
                                gitOptions: { shallow: false, recursive: false },
                            },
                        },
                    },
                },
            ],
        };

        // Then: structure should match
        expect(config.version).toBe('1.0.0');
        expect(config.packages[0].id).toBe('citisignal');
        expect(config.packages[0].storefronts['headless-paas']).toBeDefined();
    });
});

describe('type exports from @/types/demoPackages', () => {
    it('should export all DemoPackage types from module', async () => {
        // Given: Types imported from demoPackages module
        const types = await import('@/types/demoPackages');

        // Then: Module should be accessible (types are erased at runtime)
        // TypeScript validates type exports at compile time
        expect(types).toBeDefined();
    });
});
