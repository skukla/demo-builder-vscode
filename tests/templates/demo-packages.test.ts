/**
 * Demo Packages Configuration Tests
 *
 * TDD: Tests written FIRST to define behavior before implementation.
 *
 * This test suite validates the demo-packages.json configuration file
 * which unifies brands and templates into self-contained package definitions.
 *
 * Structure: Option A (Nested Storefronts)
 * - packages[] contain nested storefronts keyed by stack ID
 * - Each package has configDefaults (brand data)
 * - contentSources removed (EDS URLs derivable from source.url)
 *
 * Key validations:
 * - Structure validation (2 packages, 5 storefronts total)
 * - Embedded brand data (configDefaults)
 * - Nested storefronts structure
 * - Git source validation (valid URLs, type enum)
 * - Schema validation (rejects invalid packages)
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
    addons?: Record<string, 'required' | 'optional'>;
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
        it('should have packages array with exactly 2 packages', () => {
            expect(Array.isArray(packagesConfig.packages)).toBe(true);
            expect(packagesConfig.packages.length).toBe(2);
        });

        it('should have unique package IDs', () => {
            const ids = packagesConfig.packages.map(p => p.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('should have citisignal and buildright packages', () => {
            const ids = packagesConfig.packages.map(p => p.id);
            expect(ids).toContain('citisignal');
            expect(ids).toContain('buildright');
        });
    });

    describe('structure validation - storefronts', () => {
        it('should have 3 storefronts total across all packages', () => {
            // Note: buildright is a placeholder package with no storefronts yet
            let totalStorefronts = 0;
            packagesConfig.packages.forEach(pkg => {
                totalStorefronts += Object.keys(pkg.storefronts).length;
            });
            expect(totalStorefronts).toBe(3);
        });

        it('should have citisignal with 3 storefronts', () => {
            const citisignal = packagesConfig.packages.find(p => p.id === 'citisignal');
            expect(citisignal).toBeDefined();
            expect(Object.keys(citisignal!.storefronts).length).toBe(3);
        });

        it('should have buildright as placeholder with 0 storefronts', () => {
            // buildright is a placeholder package - storefronts will be added later
            const buildright = packagesConfig.packages.find(p => p.id === 'buildright');
            expect(buildright).toBeDefined();
            expect(Object.keys(buildright!.storefronts).length).toBe(0);
        });

        it('should have storefronts keyed by stack ID', () => {
            // Only citisignal has storefronts; buildright is a placeholder
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

        it('should NOT have contentSources (derivable from source URL)', () => {
            packagesConfig.packages.forEach(pkg => {
                expect((pkg as Record<string, unknown>).contentSources).toBeUndefined();
            });
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
            expect(headless.submodules!['demo-inspector'].path).toBe('src/demo-inspector');
            expect(headless.submodules!['demo-inspector'].repository).toBe('skukla/demo-inspector');
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

        it('should be a placeholder with no storefronts yet', () => {
            // buildright is awaiting storefront configuration
            const pkg = packagesConfig.packages.find(p => p.id === 'buildright');
            expect(Object.keys(pkg!.storefronts).length).toBe(0);
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

describe('demo-packages.schema.json - validation rules', () => {
    let schema: Record<string, unknown>;

    beforeAll(() => {
        const schemaPath = path.join(__dirname, '../../src/features/project-creation/config/demo-packages.schema.json');
        schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    });

    describe('package validation', () => {
        it('should reject packages missing required id field', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const invalidConfig = {
                version: '1.0.0',
                packages: [
                    {
                        // id is missing
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
                                    gitOptions: { shallow: true, recursive: false }
                                }
                            }
                        }
                    }
                ]
            };

            const valid = validate(invalidConfig);
            expect(valid).toBe(false);
        });

        it('should reject packages missing required storefronts field', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const invalidConfig = {
                version: '1.0.0',
                packages: [
                    {
                        id: 'test-package',
                        name: 'Test Package',
                        description: 'Test description',
                        configDefaults: {}
                        // storefronts is missing
                    }
                ]
            };

            const valid = validate(invalidConfig);
            expect(valid).toBe(false);
        });

        it('should reject packages missing required configDefaults field', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const invalidConfig = {
                version: '1.0.0',
                packages: [
                    {
                        id: 'test-package',
                        name: 'Test Package',
                        description: 'Test description',
                        // configDefaults is missing
                        storefronts: {
                            'eds-paas': {
                                name: 'Test Storefront',
                                description: 'Test storefront description',
                                source: {
                                    type: 'git',
                                    url: 'https://github.com/test/repo',
                                    branch: 'main',
                                    gitOptions: { shallow: true, recursive: false }
                                }
                            }
                        }
                    }
                ]
            };

            const valid = validate(invalidConfig);
            expect(valid).toBe(false);
        });
    });

    describe('storefront validation', () => {
        it('should reject storefronts missing required source field', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const invalidConfig = {
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
                                description: 'Test storefront description'
                                // source is missing
                            }
                        }
                    }
                ]
            };

            const valid = validate(invalidConfig);
            expect(valid).toBe(false);
        });

        it('should reject invalid source.type values', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const invalidConfig = {
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
                                    type: 'svn', // Invalid: only 'git' is allowed
                                    url: 'https://github.com/test/repo',
                                    branch: 'main',
                                    gitOptions: { shallow: true, recursive: false }
                                }
                            }
                        }
                    }
                ]
            };

            const valid = validate(invalidConfig);
            expect(valid).toBe(false);
        });
    });

    describe('valid configurations', () => {
        it('should accept valid source.type "git"', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const validConfig = {
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
                                    gitOptions: { shallow: true, recursive: false }
                                }
                            }
                        }
                    }
                ]
            };

            const valid = validate(validConfig);
            expect(valid).toBe(true);
        });

        it('should accept packages with multiple storefronts', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const validConfig = {
                version: '1.0.0',
                packages: [
                    {
                        id: 'test-package',
                        name: 'Test Package',
                        description: 'Test description',
                        configDefaults: {},
                        storefronts: {
                            'eds-paas': {
                                name: 'EDS PaaS',
                                description: 'EDS with PaaS backend',
                                source: {
                                    type: 'git',
                                    url: 'https://github.com/test/repo',
                                    branch: 'main',
                                    gitOptions: { shallow: true, recursive: false }
                                }
                            },
                            'headless-paas': {
                                name: 'Headless PaaS',
                                description: 'Next.js with PaaS backend',
                                source: {
                                    type: 'git',
                                    url: 'https://github.com/test/nextjs-repo',
                                    branch: 'master',
                                    gitOptions: { shallow: false, recursive: false }
                                }
                            }
                        }
                    }
                ]
            };

            const valid = validate(validConfig);
            expect(valid).toBe(true);
        });

        it('should accept packages with optional fields', () => {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);

            const validConfig = {
                version: '1.0.0',
                packages: [
                    {
                        id: 'test-package',
                        name: 'Test Package',
                        description: 'Test description',
                        icon: 'test-icon',
                        featured: true,
                        addons: {
                            'some-addon': 'required'
                        },
                        configDefaults: {
                            SOME_VAR: 'some_value'
                        },
                        storefronts: {
                            'eds-paas': {
                                name: 'Test Storefront',
                                description: 'Test storefront description',
                                icon: 'eds',
                                featured: true,
                                tags: ['eds', 'paas', 'test'],
                                source: {
                                    type: 'git',
                                    url: 'https://github.com/test/repo',
                                    branch: 'main',
                                    gitOptions: { shallow: true, recursive: false }
                                },
                                submodules: {
                                    'my-submodule': {
                                        path: 'src/submodule',
                                        repository: 'owner/repo'
                                    }
                                }
                            }
                        }
                    }
                ]
            };

            const valid = validate(validConfig);
            expect(valid).toBe(true);
        });
    });
});
