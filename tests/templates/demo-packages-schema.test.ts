/**
 * Demo Packages Tests - Schema Validation
 *
 * Tests for demo-packages.schema.json validation rules:
 * - Package validation (missing required fields)
 * - Storefront validation (missing source, invalid type)
 * - Valid configurations (accepted by schema)
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';

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
