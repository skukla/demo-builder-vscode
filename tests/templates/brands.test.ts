/**
 * Brands Configuration Tests
 *
 * TDD: Tests written FIRST to define behavior before implementation.
 *
 * This test suite validates the brands.json configuration file
 * which defines content/vertical brands (CitiSignal, Default, BuildRight).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('brands.json', () => {
    let brandsConfig: Record<string, unknown>;

    beforeAll(() => {
        const brandsPath = path.join(__dirname, '../../templates/brands.json');
        brandsConfig = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
    });

    describe('structure validation', () => {
        it('should have required version field', () => {
            expect(brandsConfig.version).toBeDefined();
            expect(typeof brandsConfig.version).toBe('string');
        });

        it('should have brands array with at least 2 brands', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            expect(Array.isArray(brands)).toBe(true);
            expect(brands.length).toBeGreaterThanOrEqual(2);
        });

        it('should have $schema reference', () => {
            expect(brandsConfig.$schema).toBe('./brands.schema.json');
        });
    });

    describe('default brand', () => {
        it('should exist', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const defaultBrand = brands.find(b => b.id === 'default');
            expect(defaultBrand).toBeDefined();
        });

        it('should have required fields', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const defaultBrand = brands.find(b => b.id === 'default');
            expect(defaultBrand?.name).toBe('Default');
            expect(defaultBrand?.description).toBeDefined();
            expect(defaultBrand?.configDefaults).toBeDefined();
        });

        it('should have EDS content source', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const defaultBrand = brands.find(b => b.id === 'default');
            const contentSources = defaultBrand?.contentSources as Record<string, string>;
            expect(contentSources?.eds).toBeDefined();
        });
    });

    describe('citisignal brand', () => {
        it('should exist', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const citisignal = brands.find(b => b.id === 'citisignal');
            expect(citisignal).toBeDefined();
        });

        it('should have store codes in configDefaults', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const citisignal = brands.find(b => b.id === 'citisignal');

            const configDefaults = citisignal?.configDefaults as Record<string, string>;
            expect(configDefaults.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
            expect(configDefaults.ADOBE_COMMERCE_STORE_CODE).toBe('citisignal_store');
            expect(configDefaults.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('citisignal_us');
        });

        it('should have EDS content source', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const citisignal = brands.find(b => b.id === 'citisignal');
            const contentSources = citisignal?.contentSources as Record<string, string>;
            expect(contentSources?.eds).toContain('citisignal');
        });

        it('should be marked as featured', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const citisignal = brands.find(b => b.id === 'citisignal');
            expect(citisignal?.featured).toBe(true);
        });
    });

    describe('buildright brand', () => {
        it('should exist', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const buildright = brands.find(b => b.id === 'buildright');
            expect(buildright).toBeDefined();
        });

        it('should have store codes in configDefaults', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const buildright = brands.find(b => b.id === 'buildright');

            const configDefaults = buildright?.configDefaults as Record<string, string>;
            expect(configDefaults.ADOBE_COMMERCE_WEBSITE_CODE).toBe('buildright');
            expect(configDefaults.ADOBE_COMMERCE_STORE_CODE).toBe('buildright_store');
            expect(configDefaults.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('buildright_us');
        });

        it('should have EDS content source', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const buildright = brands.find(b => b.id === 'buildright');
            const contentSources = buildright?.contentSources as Record<string, string>;
            expect(contentSources?.eds).toContain('buildright');
        });
    });

    describe('all brands', () => {
        it('should have unique IDs', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const ids = brands.map(b => b.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('should all have required fields (id, name, description, configDefaults)', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            brands.forEach(brand => {
                expect(brand.id).toBeDefined();
                expect(brand.name).toBeDefined();
                expect(brand.description).toBeDefined();
                expect(brand.configDefaults).toBeDefined();
            });
        });

        it('should all have contentSources with eds field', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            brands.forEach(brand => {
                const contentSources = brand.contentSources as Record<string, string> | undefined;
                expect(contentSources).toBeDefined();
                expect(contentSources?.eds).toBeDefined();
            });
        });
    });
});
