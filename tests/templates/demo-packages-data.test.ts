/**
 * Demo Packages Tests - Data Validation
 *
 * Tests for demo-packages.json configuration file:
 * - Schema validation
 * - Structure validation (packages and storefronts)
 * - Required fields
 * - EDS contentSource and contentPatches
 * - Embedded brand data (configDefaults)
 * - Git source validation
 * - Cross-reference validation
 * - Featured packages/storefronts
 * - Package details (citisignal, buildright)
 * - Submodules and tags validation
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';

interface GitOptions {
    shallow: boolean;
    recursive: boolean;
}

interface GitSource {
    type: 'git';
    url: string;
    branch: string;
    gitOptions: GitOptions;
}

interface Submodule {
    path: string;
    repository: string;
}

interface Storefront {
    name: string;
    description: string;
    icon?: string;
    featured?: boolean;
    tags?: string[];
    source: GitSource;
    submodules?: Record<string, Submodule>;
}

interface DemoPackage {
    id: string;
    name: string;
    description: string;
    icon?: string;
    featured?: boolean;
    addons?: Record<string, 'required' | 'optional' | { availability: 'required' | 'optional'; source: { owner: string; repo: string; branch: string } }>;
    configDefaults: Record<string, string>;
    storefronts: Record<string, Storefront>;
}

interface DemoPackagesConfig {
    $schema: string;
    version: string;
    packages: DemoPackage[];
}

describe('demo-packages.json', () => {
    let packagesConfig: DemoPackagesConfig;
    let schema: Record<string, unknown>;
    let stacksConfig: { stacks: Array<{ id: string }> };

    beforeAll(() => {
        const packagesPath = path.join(__dirname, '../../src/features/project-creation/config/demo-packages.json');
        const schemaPath = path.join(__dirname, '../../src/features/project-creation/config/demo-packages.schema.json');
        const stacksPath = path.join(__dirname, '../../src/features/project-creation/config/stacks.json');

        packagesConfig = JSON.parse(fs.readFileSync(packagesPath, 'utf-8'));
        schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
    });

    describe('schema validation', () => {
        it('should validate demo-packages.json against schema', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);
            const valid = validate(packagesConfig);

            if (!valid) {
                console.error('Schema validation errors:', validate.errors);
            }
            expect(valid).toBe(true);
        });

        it('should have $schema reference', () => {
            expect(packagesConfig.$schema).toBe('./demo-packages.schema.json');
        });

        it('should have required version field', () => {
            expect(packagesConfig.version).toBeDefined();
            expect(typeof packagesConfig.version).toBe('string');
        });
    });

    describe('structure validation - packages', () => {
        it('should have packages array with exactly 3 packages', () => {
            expect(Array.isArray(packagesConfig.packages)).toBe(true);
            expect(packagesConfig.packages.length).toBe(3);
        });

        it('should have unique package IDs', () => {
            const ids = packagesConfig.packages.map(p => p.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('should have citisignal, buildright, and custom packages', () => {
            const ids = packagesConfig.packages.map(p => p.id);
            expect(ids).toContain('citisignal');
            expect(ids).toContain('buildright');
            expect(ids).toContain('custom');
        });
    });

    describe('structure validation - storefronts', () => {
        it('should have 6 storefronts total across all packages', () => {
            let totalStorefronts = 0;
            packagesConfig.packages.forEach(pkg => {
                totalStorefronts += Object.keys(pkg.storefronts).length;
            });
            expect(totalStorefronts).toBe(6);
        });

        it('should have citisignal with 3 storefronts', () => {
            const citisignal = packagesConfig.packages.find(p => p.id === 'citisignal');
            expect(citisignal).toBeDefined();
            expect(Object.keys(citisignal!.storefronts).length).toBe(3);
        });

        it('should have buildright with 1 storefront and coming-soon status', () => {
            const buildright = packagesConfig.packages.find(p => p.id === 'buildright');
            expect(buildright).toBeDefined();
            expect(Object.keys(buildright!.storefronts).length).toBe(1);
            expect((buildright as Record<string, unknown>).status).toBe('coming-soon');
        });

        it('should have storefronts keyed by stack ID', () => {
            const citisignal = packagesConfig.packages.find(p => p.id === 'citisignal');
            expect(citisignal!.storefronts['headless-paas']).toBeDefined();
            expect(citisignal!.storefronts['eds-paas']).toBeDefined();
            expect(citisignal!.storefronts['eds-accs']).toBeDefined();
        });
    });

    describe('all packages - required fields', () => {
        it('should have required fields (id, name, description, configDefaults, storefronts)', () => {
            packagesConfig.packages.forEach(pkg => {
                expect(pkg.id).toBeDefined();
                expect(typeof pkg.id).toBe('string');
                expect(pkg.name).toBeDefined();
                expect(typeof pkg.name).toBe('string');
                expect(pkg.description).toBeDefined();
                expect(typeof pkg.description).toBe('string');
                expect(pkg.configDefaults).toBeDefined();
                expect(typeof pkg.configDefaults).toBe('object');
                expect(pkg.storefronts).toBeDefined();
                expect(typeof pkg.storefronts).toBe('object');
            });
        });

        it('should NOT have package-level contentSources (content source is per-storefront)', () => {
            packagesConfig.packages.forEach(pkg => {
                expect((pkg as Record<string, unknown>).contentSources).toBeUndefined();
            });
        });
    });

    describe('EDS storefronts - contentSource', () => {
        it('should have contentSource for branded EDS storefronts', () => {
            packagesConfig.packages.forEach(pkg => {
                if ((pkg as Record<string, unknown>).status === 'coming-soon') return;
                if (pkg.id === 'custom') return;
                Object.entries(pkg.storefronts).forEach(([stackId, storefront]) => {
                    if (stackId.startsWith('eds-')) {
                        expect((storefront as Record<string, unknown>).contentSource).toBeDefined();
                        const contentSource = (storefront as Record<string, unknown>).contentSource as { org: string; site: string };
                        expect(contentSource.org).toBeDefined();
                        expect(contentSource.site).toBeDefined();
                    }
                });
            });
        });

        it('should have contentSource for Custom package storefronts (boilerplate content)', () => {
            const custom = packagesConfig.packages.find(p => p.id === 'custom');
            expect(custom).toBeDefined();
            Object.values(custom!.storefronts).forEach(storefront => {
                const sf = storefront as Record<string, unknown>;
                expect(sf.contentSource).toBeDefined();
                const contentSource = sf.contentSource as { org: string; site: string };
                expect(contentSource.org).toBe('hlxsites');
                expect(contentSource.site).toBe('aem-boilerplate-commerce');
            });
        });
    });

    describe('EDS storefronts - contentPatches', () => {
        it('should have ACCS-specific content patches for eds-accs storefront', () => {
            const citisignal = packagesConfig.packages.find(p => p.id === 'citisignal');
            expect(citisignal).toBeDefined();

            const edsAccs = citisignal!.storefronts['eds-accs'] as Record<string, unknown>;
            expect(edsAccs).toBeDefined();

            const patches = edsAccs.contentPatches as string[];
            expect(patches).toBeDefined();
            expect(patches).toContain('phones-heading-reorder');
            expect(patches).toContain('smart-watches-category-id-accs');

            expect(patches).not.toContain('index-product-teaser-sku');
            expect(patches).not.toContain('phones-product-teaser-sku');
            expect(patches).not.toContain('smart-watches-category-id');
            expect(patches).not.toContain('smart-watches-url-path');
        });

        it('should have contentPatchSource for eds-accs storefront', () => {
            const citisignal = packagesConfig.packages.find(p => p.id === 'citisignal');
            const edsAccs = citisignal!.storefronts['eds-accs'] as Record<string, unknown>;

            const patchSource = edsAccs.contentPatchSource as { owner: string; repo: string; path: string };
            expect(patchSource).toBeDefined();
            expect(patchSource.owner).toBe('skukla');
            expect(patchSource.repo).toBe('eds-demo-content-patches');
            expect(patchSource.path).toBe('citisignal');
        });

        it('should have all 5 content patches for eds-paas storefront', () => {
            const citisignal = packagesConfig.packages.find(p => p.id === 'citisignal');
            const edsPaas = citisignal!.storefronts['eds-paas'] as Record<string, unknown>;

            const patches = edsPaas.contentPatches as string[];
            expect(patches).toBeDefined();
            expect(patches).toHaveLength(5);
            expect(patches).toContain('index-product-teaser-sku');
            expect(patches).toContain('phones-product-teaser-sku');
            expect(patches).toContain('phones-heading-reorder');
            expect(patches).toContain('smart-watches-category-id');
            expect(patches).toContain('smart-watches-url-path');
        });
    });

    describe('all storefronts - required fields', () => {
        it('should have required fields (name, description, source)', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    expect(storefront.name).toBeDefined();
                    expect(typeof storefront.name).toBe('string');
                    expect(storefront.description).toBeDefined();
                    expect(typeof storefront.description).toBe('string');
                    expect(storefront.source).toBeDefined();
                    expect(typeof storefront.source).toBe('object');
                });
            });
        });

        it('should have source object with required fields', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    expect(storefront.source.type).toBeDefined();
                    expect(storefront.source.url).toBeDefined();
                    expect(storefront.source.branch).toBeDefined();
                    expect(storefront.source.gitOptions).toBeDefined();
                });
            });
        });
    });

    describe('embedded brand data - configDefaults', () => {
        it('should have configDefaults object in each package', () => {
            packagesConfig.packages.forEach(pkg => {
                expect(pkg.configDefaults).toBeDefined();
                expect(typeof pkg.configDefaults).toBe('object');
            });
        });

        it('should have citisignal store codes in citisignal package', () => {
            const citisignal = packagesConfig.packages.find(p => p.id === 'citisignal');
            expect(citisignal).toBeDefined();

            expect(citisignal!.configDefaults.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
            expect(citisignal!.configDefaults.ADOBE_COMMERCE_STORE_CODE).toBe('citisignal_store');
            expect(citisignal!.configDefaults.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('citisignal_us');
        });

        it('should have buildright store codes in buildright package', () => {
            const buildright = packagesConfig.packages.find(p => p.id === 'buildright');
            expect(buildright).toBeDefined();

            expect(buildright!.configDefaults.ADOBE_COMMERCE_WEBSITE_CODE).toBe('buildright');
            expect(buildright!.configDefaults.ADOBE_COMMERCE_STORE_CODE).toBe('buildright_store');
            expect(buildright!.configDefaults.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('buildright_us');
        });
    });

    describe('git source validation', () => {
        it('should have source.type equal to "git" in all storefronts', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    expect(storefront.source.type).toBe('git');
                });
            });
        });

        it('should have valid GitHub URL in source.url', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    expect(storefront.source.url).toMatch(/^https:\/\/github\.com\//);
                });
            });
        });

        it('should have source.branch defined', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    expect(storefront.source.branch).toBeDefined();
                    expect(typeof storefront.source.branch).toBe('string');
                    expect(storefront.source.branch.length).toBeGreaterThan(0);
                });
            });
        });

        it('should have gitOptions with shallow and recursive booleans', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    expect(storefront.source.gitOptions).toBeDefined();
                    expect(typeof storefront.source.gitOptions.shallow).toBe('boolean');
                    expect(typeof storefront.source.gitOptions.recursive).toBe('boolean');
                });
            });
        });
    });

    describe('cross-reference validation', () => {
        it('should reference valid stacks from stacks.json', () => {
            const validStackIds = new Set(stacksConfig.stacks.map(s => s.id));

            packagesConfig.packages.forEach(pkg => {
                Object.keys(pkg.storefronts).forEach(stackId => {
                    expect(validStackIds.has(stackId)).toBe(true);
                });
            });
        });
    });

    describe('featured packages and storefronts', () => {
        it('should have at least one featured package', () => {
            const featuredPackages = packagesConfig.packages.filter(p => p.featured === true);
            expect(featuredPackages.length).toBeGreaterThanOrEqual(1);
        });

        it('should have at least one featured storefront', () => {
            let featuredStorefronts = 0;
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    if (storefront.featured === true) {
                        featuredStorefronts++;
                    }
                });
            });
            expect(featuredStorefronts).toBeGreaterThanOrEqual(1);
        });

        it('should have boolean featured field when present', () => {
            packagesConfig.packages.forEach(pkg => {
                if (pkg.featured !== undefined) {
                    expect(typeof pkg.featured).toBe('boolean');
                }
                Object.values(pkg.storefronts).forEach(storefront => {
                    if (storefront.featured !== undefined) {
                        expect(typeof storefront.featured).toBe('boolean');
                    }
                });
            });
        });
    });

    describe('citisignal package details', () => {
        it('should exist and be featured', () => {
            const pkg = packagesConfig.packages.find(p => p.id === 'citisignal');
            expect(pkg).toBeDefined();
            expect(pkg!.featured).toBe(true);
        });

        it('should have headless-paas storefront with submodules', () => {
            const pkg = packagesConfig.packages.find(p => p.id === 'citisignal');
            const headless = pkg!.storefronts['headless-paas'];

            expect(headless).toBeDefined();
            expect(headless.submodules).toBeDefined();
            expect(headless.submodules!['demo-inspector']).toBeDefined();
            expect(headless.submodules!['demo-inspector'].path).toBe('src/demo-inspector-universal');
            expect(headless.submodules!['demo-inspector'].repository).toBe('skukla/demo-inspector-universal');
        });

        it('should have eds-paas and eds-accs storefronts', () => {
            const pkg = packagesConfig.packages.find(p => p.id === 'citisignal');
            expect(pkg!.storefronts['eds-paas']).toBeDefined();
            expect(pkg!.storefronts['eds-accs']).toBeDefined();
        });
    });

    describe('buildright package details', () => {
        it('should exist and not be featured', () => {
            const pkg = packagesConfig.packages.find(p => p.id === 'buildright');
            expect(pkg).toBeDefined();
            expect(pkg!.featured).toBe(false);
        });

        it('should have addons defined', () => {
            const pkg = packagesConfig.packages.find(p => p.id === 'buildright');
            expect(pkg!.addons).toBeDefined();
            expect(pkg!.addons!['adobe-commerce-aco']).toBe('required');
        });

        it('should have eds-paas storefront', () => {
            const pkg = packagesConfig.packages.find(p => p.id === 'buildright');
            expect(pkg!.storefronts['eds-paas']).toBeDefined();
        });
    });

    describe('submodules validation', () => {
        it('should have valid path and repository for all submodules', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    if (storefront.submodules) {
                        Object.entries(storefront.submodules).forEach(([_name, config]) => {
                            expect(config.path).toBeDefined();
                            expect(typeof config.path).toBe('string');
                            expect(config.repository).toBeDefined();
                            expect(typeof config.repository).toBe('string');
                        });
                    }
                });
            });
        });
    });

    describe('tags validation', () => {
        it('should have array of strings for tags when present', () => {
            packagesConfig.packages.forEach(pkg => {
                Object.values(pkg.storefronts).forEach(storefront => {
                    if (storefront.tags) {
                        expect(Array.isArray(storefront.tags)).toBe(true);
                        storefront.tags.forEach(tag => {
                            expect(typeof tag).toBe('string');
                        });
                    }
                });
            });
        });
    });
});
