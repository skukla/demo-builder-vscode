/**
 * Demo Package Loader Tests
 *
 * Two concerns, kept separate:
 *  1. Loader LOGIC — tested against an injected fixture (the seam), so these
 *     stay stable when demo-packages.json changes. See tests/README.md
 *     ("Mocking dependencies: prefer injection seams over leaf-module mocks").
 *  2. Shipped config INTEGRITY — tested against the real bundled
 *     demo-packages.json, validating the data that actually ships.
 */

import {
    loadDemoPackages,
    getStorefrontForStack,
    getPackageById,
    getAvailableStacksForPackage,
    getAllStorefronts,
    getAddonSource,
} from '@/features/project-creation/ui/helpers/demoPackageLoader';
import type { DemoPackage, DemoPackagesConfig, GitSource } from '@/types/demoPackages';

// --- Fixture: a small, controlled package set injected into the loader -------
const gitSource = (url: string): GitSource => ({
    type: 'git',
    url,
    branch: 'main',
    gitOptions: { shallow: true },
});

function makeTestPackages(): DemoPackage[] {
    return [
        {
            id: 'alpha',
            name: 'Alpha',
            description: 'Alpha test package',
            configDefaults: {},
            storefronts: {
                'headless-paas': {
                    name: 'Alpha Headless',
                    description: 'Headless variant',
                    source: gitSource('https://example.com/alpha-headless'),
                },
                'eds-paas': {
                    name: 'Alpha EDS',
                    description: 'EDS variant',
                    source: gitSource('https://example.com/alpha-eds'),
                    contentSource: { org: 'alpha-org', site: 'alpha-site' },
                },
            },
        },
        {
            id: 'beta',
            name: 'Beta',
            description: 'Beta test package',
            configDefaults: {},
            storefronts: {
                'eds-accs': {
                    name: 'Beta EDS ACCS',
                    description: 'EDS ACCS variant',
                    source: gitSource('https://example.com/beta-eds-accs'),
                    contentSource: { org: 'beta-org', site: 'beta-site' },
                },
            },
        },
    ];
}

describe('demoPackageLoader (logic, injected fixture)', () => {
    let packages: DemoPackage[];

    beforeEach(() => {
        packages = makeTestPackages();
    });

    describe('loadDemoPackages', () => {
        it('returns the injected config packages', async () => {
            const config: DemoPackagesConfig = { version: '1.0.0', packages };
            const result = await loadDemoPackages(config);

            expect(result).toBe(config.packages);
            expect(result.map(p => p.id)).toEqual(['alpha', 'beta']);
        });
    });

    describe('getPackageById', () => {
        it('returns the matching package for a known id', async () => {
            const pkg = await getPackageById('alpha', packages);

            expect(pkg).toBeDefined();
            expect(pkg?.id).toBe('alpha');
            expect(pkg?.name).toBe('Alpha');
        });

        it('returns undefined for an unknown id', async () => {
            expect(await getPackageById('nonexistent', packages)).toBeUndefined();
        });

        it('returns undefined for an empty id', async () => {
            expect(await getPackageById('', packages)).toBeUndefined();
        });
    });

    describe('getStorefrontForStack', () => {
        it('resolves the storefront for a known package + stack', async () => {
            const storefront = await getStorefrontForStack('alpha', 'headless-paas', packages);

            expect(storefront).toBeDefined();
            expect(storefront?.name).toBe('Alpha Headless');
            expect(storefront?.source.type).toBe('git');
            expect(storefront?.source.url).toBe('https://example.com/alpha-headless');
        });

        it('returns the contentSource for EDS storefronts', async () => {
            const storefront = await getStorefrontForStack('alpha', 'eds-paas', packages);

            expect(storefront?.contentSource?.org).toBe('alpha-org');
            expect(storefront?.contentSource?.site).toBe('alpha-site');
        });

        it('returns undefined for an unknown stack', async () => {
            expect(await getStorefrontForStack('alpha', 'no-such-stack', packages)).toBeUndefined();
        });

        it('returns undefined for an unknown package', async () => {
            expect(await getStorefrontForStack('nope', 'headless-paas', packages)).toBeUndefined();
        });

        it('returns undefined for both unknown package and stack', async () => {
            expect(await getStorefrontForStack('nope', 'no-such-stack', packages)).toBeUndefined();
        });
    });

    describe('getAvailableStacksForPackage', () => {
        it('returns the storefront keys for a package', async () => {
            const stacks = await getAvailableStacksForPackage('alpha', packages);

            expect(stacks).toHaveLength(2);
            expect(stacks).toContain('headless-paas');
            expect(stacks).toContain('eds-paas');
        });

        it('returns a single-element list for a one-storefront package', async () => {
            expect(await getAvailableStacksForPackage('beta', packages)).toEqual(['eds-accs']);
        });

        it('returns an empty array for an unknown package', async () => {
            expect(await getAvailableStacksForPackage('nope', packages)).toEqual([]);
        });
    });

    describe('getAllStorefronts', () => {
        it('flattens every storefront with package + stack context', async () => {
            const storefronts = await getAllStorefronts(packages);

            expect(storefronts).toHaveLength(3);
            storefronts.forEach(item => {
                expect(item.packageId).toBeDefined();
                expect(item.stackId).toBeDefined();
                expect(item.storefront.name).toBeDefined();
                expect(item.storefront.source).toBeDefined();
            });
        });

        it('groups storefronts under their owning package', async () => {
            const storefronts = await getAllStorefronts(packages);

            expect(storefronts.filter(s => s.packageId === 'alpha')).toHaveLength(2);
            const beta = storefronts.filter(s => s.packageId === 'beta');
            expect(beta).toHaveLength(1);
            expect(beta[0].stackId).toBe('eds-accs');
        });
    });
});

describe('shipped demo-packages.json (config integrity)', () => {
    it('ships exactly 5 packages (citisignal, isle5, buildright, custom, b2b)', async () => {
        const packages = await loadDemoPackages();

        expect(packages.length).toBe(5);
        const ids = packages.map(p => p.id);
        expect(ids).toEqual(
            expect.arrayContaining(['citisignal', 'isle5', 'buildright', 'custom', 'b2b'])
        );
        // citisignal-b2b retired — merged into the hybrid `citisignal` package.
        expect(ids).not.toContain('citisignal-b2b');
    });

    it('every package has the required structural properties', async () => {
        const packages = await loadDemoPackages();

        packages.forEach(pkg => {
            expect(pkg.id).toBeDefined();
            expect(pkg.name).toBeDefined();
            expect(pkg.description).toBeDefined();
            expect(pkg.configDefaults).toBeDefined();
            expect(typeof pkg.storefronts).toBe('object');
        });
    });

    it('does not carry package-level contentSources (content source is per-storefront)', async () => {
        const packages = await loadDemoPackages();

        packages.forEach(pkg => {
            expect((pkg as Record<string, unknown>).contentSources).toBeUndefined();
        });
    });

    it('citisignal exposes its three stacks and an EDS contentSource', async () => {
        const citisignal = await getPackageById('citisignal');

        expect(citisignal?.name).toBe('CitiSignal');
        expect(await getAvailableStacksForPackage('citisignal')).toEqual(
            expect.arrayContaining(['headless-paas', 'eds-paas', 'eds-accs']),
        );
        const edsPaas = citisignal!.storefronts['eds-paas'];
        expect(edsPaas.contentSource?.org).toBeDefined();
        expect(edsPaas.contentSource?.site).toBeDefined();
    });

    it('buildright declares its required adobe-commerce-aco addon', async () => {
        const pkg = await getPackageById('buildright');

        expect(pkg?.addons?.['adobe-commerce-aco']).toBe('required');
    });

    it('getAllStorefronts flattens the shipped storefronts', async () => {
        const storefronts = await getAllStorefronts();

        // One row per (package, stack) pair across all shipped packages.
        const expected = (await loadDemoPackages()).reduce(
            (sum, p) => sum + Object.keys(p.storefronts).length,
            0,
        );
        expect(storefronts).toHaveLength(expected);
    });

    describe('addon config form', () => {
        it('keeps commerce-block-collection out of package addons (moved to block-libraries.json)', async () => {
            const packages = await loadDemoPackages();

            packages.forEach(pkg => {
                expect(pkg.addons?.['commerce-block-collection']).toBeUndefined();
            });
        });

        it('uses the simplified string form for all addon configs', async () => {
            const packages = await loadDemoPackages();

            packages.forEach(pkg => {
                if (pkg.addons) {
                    Object.values(pkg.addons).forEach(config => {
                        expect(typeof config).toBe('string');
                    });
                }
            });
        });
    });
});

describe('getAddonSource (global, from stacks.json)', () => {
    it('returns undefined for a removed addon (demo-inspector)', () => {
        expect(getAddonSource('demo-inspector')).toBeUndefined();
    });

    it('returns undefined for a nonexistent addon', () => {
        expect(getAddonSource('nonexistent-addon')).toBeUndefined();
    });

    it('is synchronous (does not return a Promise)', () => {
        expect(getAddonSource('nonexistent-addon')).not.toBeInstanceOf(Promise);
    });

    it('takes at most one argument (no packageId)', () => {
        expect(getAddonSource.length).toBeLessThanOrEqual(1);
    });
});
