/**
 * Demo Package Loader Tests
 *
 * Tests for the unified demo package loader that provides functions to load
 * demo packages from demo-packages.json and retrieve storefronts for specific stacks.
 *
 * Structure: Option A (Nested Storefronts)
 * - 3 packages (citisignal, buildright, custom)
 * - 6 storefronts total (citisignal 3, buildright 1, custom 2)
 * - EDS storefronts have explicit contentSource for DA.live content (except Custom)
 *
 * TDD: Tests written FIRST to define expected behavior.
 */

import {
    loadDemoPackages,
    getStorefrontForStack,
    getPackageById,
    getAvailableStacksForPackage,
    getAllStorefronts,
} from '@/features/project-creation/ui/helpers/demoPackageLoader';
import type { DemoPackage, Storefront } from '@/types/demoPackages';

describe('demoPackageLoader', () => {
    describe('loadDemoPackages', () => {
        it('should return array of DemoPackage objects', async () => {
            const packages = await loadDemoPackages();

            expect(Array.isArray(packages)).toBe(true);
            expect(packages.length).toBeGreaterThan(0);
        });

        it('should return exactly 3 packages (citisignal, buildright, and custom)', async () => {
            const packages = await loadDemoPackages();

            expect(packages.length).toBe(3);

            const ids = packages.map(p => p.id);
            expect(ids).toContain('citisignal');
            expect(ids).toContain('buildright');
            expect(ids).toContain('custom');
        });

        it('should return packages with required properties', async () => {
            const packages = await loadDemoPackages();

            packages.forEach(pkg => {
                expect(pkg.id).toBeDefined();
                expect(pkg.name).toBeDefined();
                expect(pkg.description).toBeDefined();
                expect(pkg.configDefaults).toBeDefined();
                expect(pkg.storefronts).toBeDefined();
                expect(typeof pkg.storefronts).toBe('object');
            });
        });

        it('should NOT include package-level contentSources (content source is per-storefront)', async () => {
            const packages = await loadDemoPackages();

            packages.forEach(pkg => {
                // Package-level contentSources should not exist
                expect((pkg as Record<string, unknown>).contentSources).toBeUndefined();
            });
        });

        it('should include contentSource for EDS storefronts', async () => {
            const packages = await loadDemoPackages();
            const citisignal = packages.find(p => p.id === 'citisignal');

            expect(citisignal).toBeDefined();

            // EDS storefronts should have contentSource
            const edsPaas = citisignal!.storefronts['eds-paas'];
            expect(edsPaas.contentSource).toBeDefined();
            expect(edsPaas.contentSource?.org).toBeDefined();
            expect(edsPaas.contentSource?.site).toBeDefined();
        });

        it('should have storefronts keyed by stack ID', async () => {
            const packages = await loadDemoPackages();
            const citisignal = packages.find(p => p.id === 'citisignal');

            expect(citisignal).toBeDefined();
            expect(citisignal!.storefronts['headless-paas']).toBeDefined();
            expect(citisignal!.storefronts['eds-paas']).toBeDefined();
            expect(citisignal!.storefronts['eds-accs']).toBeDefined();
        });
    });

    describe('getPackageById', () => {
        it('should return matching package for valid ID', async () => {
            const pkg = await getPackageById('citisignal');

            expect(pkg).toBeDefined();
            expect(pkg?.id).toBe('citisignal');
            expect(pkg?.name).toBe('CitiSignal');
        });

        it('should return buildright package with addons', async () => {
            const pkg = await getPackageById('buildright');

            expect(pkg).toBeDefined();
            expect(pkg?.id).toBe('buildright');
            expect(pkg?.addons).toBeDefined();
            expect(pkg?.addons?.['adobe-commerce-aco']).toBe('required');
        });

        it('should return undefined for unknown package ID', async () => {
            const pkg = await getPackageById('nonexistent');

            expect(pkg).toBeUndefined();
        });

        it('should return undefined for empty string', async () => {
            const pkg = await getPackageById('');

            expect(pkg).toBeUndefined();
        });
    });

    describe('getStorefrontForStack', () => {
        it('should return correct storefront for valid package and stack', async () => {
            const storefront = await getStorefrontForStack('citisignal', 'headless-paas');

            expect(storefront).toBeDefined();
            expect(storefront?.name).toBe('CitiSignal Headless');
            expect(storefront?.source).toBeDefined();
            expect(storefront?.source.type).toBe('git');
            expect(storefront?.source.url).toBe('https://github.com/skukla/citisignal-nextjs');
        });

        it('should return storefront with GitSource object (not string)', async () => {
            const storefront = await getStorefrontForStack('citisignal', 'headless-paas');

            expect(storefront).toBeDefined();
            expect(typeof storefront?.source).toBe('object');
            expect(storefront?.source.url).toBeDefined();
            expect(storefront?.source.branch).toBeDefined();
            expect(storefront?.source.gitOptions).toBeDefined();
        });

        it('should return storefront with submodules when defined', async () => {
            const storefront = await getStorefrontForStack('citisignal', 'headless-paas');

            expect(storefront).toBeDefined();
            expect(storefront?.submodules).toBeDefined();
            expect(storefront?.submodules?.['demo-inspector']).toBeDefined();
            expect(storefront?.submodules?.['demo-inspector'].path).toBe('src/demo-inspector-universal');
            expect(storefront?.submodules?.['demo-inspector'].repository).toBe('skukla/demo-inspector-universal');
        });

        it('should return EDS storefront without submodules (inspector bundled in template)', async () => {
            const storefront = await getStorefrontForStack('citisignal', 'eds-paas');

            expect(storefront).toBeDefined();
            expect(storefront?.submodules).toBeUndefined();
        });

        it('should return undefined for unknown stack', async () => {
            const storefront = await getStorefrontForStack('citisignal', 'nonexistent-stack');

            expect(storefront).toBeUndefined();
        });

        it('should return undefined for unknown package', async () => {
            const storefront = await getStorefrontForStack('nonexistent', 'headless-paas');

            expect(storefront).toBeUndefined();
        });

        it('should return undefined for both unknown package and stack', async () => {
            const storefront = await getStorefrontForStack('nonexistent', 'nonexistent-stack');

            expect(storefront).toBeUndefined();
        });
    });

    describe('getAvailableStacksForPackage', () => {
        it('should return all available stack IDs for citisignal', async () => {
            const stacks = await getAvailableStacksForPackage('citisignal');

            expect(stacks).toHaveLength(3);
            expect(stacks).toContain('headless-paas');
            expect(stacks).toContain('eds-paas');
            expect(stacks).toContain('eds-accs');
        });

        it('should return eds-paas for buildright', async () => {
            const stacks = await getAvailableStacksForPackage('buildright');

            expect(stacks).toHaveLength(1);
            expect(stacks).toContain('eds-paas');
        });

        it('should return empty array for unknown package', async () => {
            const stacks = await getAvailableStacksForPackage('nonexistent');

            expect(stacks).toEqual([]);
        });
    });

    describe('getAllStorefronts', () => {
        it('should return all 6 storefronts with package and stack info', async () => {
            const storefronts = await getAllStorefronts();

            expect(storefronts).toHaveLength(6);
        });

        it('should include package ID and stack ID with each storefront', async () => {
            const storefronts = await getAllStorefronts();

            storefronts.forEach(item => {
                expect(item.packageId).toBeDefined();
                expect(item.stackId).toBeDefined();
                expect(item.storefront).toBeDefined();
                expect(item.storefront.name).toBeDefined();
                expect(item.storefront.source).toBeDefined();
            });
        });

        it('should include citisignal storefronts', async () => {
            const storefronts = await getAllStorefronts();
            const citisignalStorefronts = storefronts.filter(s => s.packageId === 'citisignal');

            expect(citisignalStorefronts).toHaveLength(3);
        });

        it('should have 1 buildright storefront', async () => {
            const storefronts = await getAllStorefronts();
            const buildrightStorefronts = storefronts.filter(s => s.packageId === 'buildright');

            expect(buildrightStorefronts).toHaveLength(1);
            expect(buildrightStorefronts[0].stackId).toBe('eds-paas');
        });
    });
});
