/**
 * DemoPackage Primitive Type Tests
 *
 * Tests for primitive types: GitOptions, GitSource, Storefront,
 * Addons, AddonSource, AddonConfig.
 *
 * Composite types (DemoPackage, DemoPackagesConfig, exports) are in
 * demoPackages-composite.test.ts.
 */

import type {
    GitOptions,
    GitSource,
    Storefront,
    Addons,
    AddonSource,
    AddonConfig,
} from '@/types/demoPackages';

describe('GitOptions type', () => {
    it('should require shallow field', () => {
        // Given: Git options with shallow field
        const options: GitOptions = {
            shallow: true,
        };

        // Then: shallow should be accessible
        expect(options.shallow).toBe(true);
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
            },
        };

        // Then: all fields match expected values
        expect(source.type).toBe('git');
        expect(source.url).toBe('https://github.com/skukla/citisignal-nextjs');
        expect(source.branch).toBe('master');
        expect(source.gitOptions).toBeDefined();
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
                gitOptions: { shallow: true },
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
                gitOptions: { shallow: false },
            },
        };

        // Then: all fields should be accessible
        expect(storefront.icon).toBe('nextjs');
        expect(storefront.featured).toBe(true);
        expect(storefront.tags).toContain('headless');
    });

    it('should accept structure matching headless-paas storefront pattern', () => {
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
                },
            },
        };

        // Then: all fields should match expected values
        expect(storefront.name).toBe('CitiSignal Headless');
        expect(storefront.source.branch).toBe('master');
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

    it('should accept addon with excluded value', () => {
        // Given: Addon with excluded availability
        const addons: Addons = {
            'commerce-block-collection': 'excluded',
        };

        // Then: excluded addon should be accessible
        expect(addons['commerce-block-collection']).toBe('excluded');
    });

    it('should accept mixed required, optional, and excluded addons', () => {
        // Given: Mix of all addon config string values
        const addons: Addons = {
            'adobe-commerce-aco': 'required',
            'commerce-block-collection': 'optional',
            'some-addon': 'excluded',
        };

        // Then: all string forms should be accessible
        expect(addons['adobe-commerce-aco']).toBe('required');
        expect(addons['commerce-block-collection']).toBe('optional');
        expect(addons['some-addon']).toBe('excluded');
    });
});

describe('AddonSource type', () => {
    it('should require owner, repo, and branch fields', () => {
        const source: AddonSource = {
            owner: 'stephen-garner-adobe',
            repo: 'isle5',
            branch: 'main',
        };

        expect(source.owner).toBe('stephen-garner-adobe');
        expect(source.repo).toBe('isle5');
        expect(source.branch).toBe('main');
    });
});

describe('AddonConfig type (simplified string union)', () => {
    it('should accept required string value', () => {
        const config: AddonConfig = 'required';
        expect(config).toBe('required');
    });

    it('should accept optional string value', () => {
        const config: AddonConfig = 'optional';
        expect(config).toBe('optional');
    });

    it('should accept excluded string value', () => {
        const config: AddonConfig = 'excluded';
        expect(config).toBe('excluded');
    });

    it('should only accept string values (no object form)', () => {
        // All AddonConfig values should be strings
        const configs: AddonConfig[] = ['required', 'optional', 'excluded'];
        configs.forEach(config => {
            expect(typeof config).toBe('string');
        });
    });
});
