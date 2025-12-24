/**
 * DemoTemplate Type Tests
 *
 * Tests for DemoTemplate interface to ensure it accurately reflects
 * the structure in templates.json.
 *
 * Step 2: Add missing fields (stack, brand, source, submodules)
 */

import type {
    DemoTemplate,
    TemplateSource,
    TemplateGitOptions,
    TemplateSubmodule,
} from '@/types/templates';

describe('DemoTemplate type', () => {
    describe('stack field', () => {
        it('should accept stack field as optional string', () => {
            // Given: A template with stack field
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                stack: 'headless-paas',
            };

            // Then: stack should be accessible
            expect(template.stack).toBe('headless-paas');
        });

        it('should accept template without stack field', () => {
            // Given: A template without stack
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
            };

            // Then: template should be valid
            expect(template.stack).toBeUndefined();
        });
    });

    describe('brand field', () => {
        it('should accept brand field as optional string', () => {
            // Given: A template with brand field
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                brand: 'citisignal',
            };

            // Then: brand should be accessible
            expect(template.brand).toBe('citisignal');
        });

        it('should accept template without brand field', () => {
            // Given: A template without brand
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
            };

            // Then: template should be valid
            expect(template.brand).toBeUndefined();
        });
    });

    describe('source field', () => {
        it('should accept source field with git configuration', () => {
            // Given: A template with git source configuration
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                source: {
                    type: 'git',
                    url: 'https://github.com/example/repo',
                    branch: 'main',
                },
            };

            // Then: source should be accessible
            expect(template.source).toBeDefined();
            expect(template.source?.type).toBe('git');
            expect(template.source?.url).toBe('https://github.com/example/repo');
            expect(template.source?.branch).toBe('main');
        });

        it('should accept source field with gitOptions', () => {
            // Given: A template with git source and options
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                source: {
                    type: 'git',
                    url: 'https://github.com/example/repo',
                    branch: 'main',
                    gitOptions: {
                        shallow: true,
                        recursive: false,
                    },
                },
            };

            // Then: gitOptions should be accessible
            expect(template.source?.gitOptions).toBeDefined();
            expect(template.source?.gitOptions?.shallow).toBe(true);
            expect(template.source?.gitOptions?.recursive).toBe(false);
        });

        it('should accept template without source field', () => {
            // Given: A template without source
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
            };

            // Then: template should be valid
            expect(template.source).toBeUndefined();
        });
    });

    describe('submodules field', () => {
        it('should accept submodules field with submodule definitions', () => {
            // Given: A template with submodules
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                submodules: {
                    'demo-inspector': {
                        path: 'src/demo-inspector',
                        repository: 'skukla/demo-inspector',
                    },
                },
            };

            // Then: submodules should be accessible
            expect(template.submodules).toBeDefined();
            expect(template.submodules?.['demo-inspector']).toBeDefined();
            expect(template.submodules?.['demo-inspector']?.path).toBe('src/demo-inspector');
            expect(template.submodules?.['demo-inspector']?.repository).toBe('skukla/demo-inspector');
        });

        it('should accept multiple submodules', () => {
            // Given: A template with multiple submodules
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                submodules: {
                    'module-a': {
                        path: 'src/module-a',
                        repository: 'org/module-a',
                    },
                    'module-b': {
                        path: 'lib/module-b',
                        repository: 'org/module-b',
                    },
                },
            };

            // Then: all submodules should be accessible
            expect(Object.keys(template.submodules!).length).toBe(2);
            expect(template.submodules?.['module-a']?.path).toBe('src/module-a');
            expect(template.submodules?.['module-b']?.path).toBe('lib/module-b');
        });

        it('should accept template without submodules field', () => {
            // Given: A template without submodules
            const template: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
            };

            // Then: template should be valid
            expect(template.submodules).toBeUndefined();
        });
    });

    describe('complete template with all new fields', () => {
        it('should accept a template matching actual templates.json structure', () => {
            // Given: A template matching the citisignal-headless structure from templates.json
            const template: DemoTemplate = {
                id: 'citisignal-headless',
                name: 'CitiSignal Headless',
                description: 'Next.js headless storefront with Adobe Commerce API Mesh integration',
                icon: 'nextjs',
                featured: true,
                tags: ['headless', 'nextjs', 'citisignal'],
                stack: 'headless-paas',
                brand: 'citisignal',
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

            // Then: all fields should be accessible
            expect(template.id).toBe('citisignal-headless');
            expect(template.stack).toBe('headless-paas');
            expect(template.brand).toBe('citisignal');
            expect(template.source?.type).toBe('git');
            expect(template.submodules?.['demo-inspector']).toBeDefined();
        });
    });
});

describe('TemplateSource type', () => {
    it('should have required type, url, and branch fields', () => {
        // Given: A source configuration
        const source: TemplateSource = {
            type: 'git',
            url: 'https://github.com/example/repo',
            branch: 'main',
        };

        // Then: all required fields should be accessible
        expect(source.type).toBe('git');
        expect(source.url).toBe('https://github.com/example/repo');
        expect(source.branch).toBe('main');
    });

    it('should accept optional gitOptions', () => {
        // Given: A source with gitOptions
        const source: TemplateSource = {
            type: 'git',
            url: 'https://github.com/example/repo',
            branch: 'main',
            gitOptions: {
                shallow: true,
                recursive: true,
            },
        };

        // Then: gitOptions should be accessible
        expect(source.gitOptions?.shallow).toBe(true);
        expect(source.gitOptions?.recursive).toBe(true);
    });
});

describe('TemplateGitOptions type', () => {
    it('should accept shallow option', () => {
        // Given: Git options with shallow
        const options: TemplateGitOptions = {
            shallow: true,
        };

        // Then: shallow should be accessible
        expect(options.shallow).toBe(true);
    });

    it('should accept recursive option', () => {
        // Given: Git options with recursive
        const options: TemplateGitOptions = {
            recursive: false,
        };

        // Then: recursive should be accessible
        expect(options.recursive).toBe(false);
    });

    it('should accept both options', () => {
        // Given: Git options with both fields
        const options: TemplateGitOptions = {
            shallow: true,
            recursive: false,
        };

        // Then: both should be accessible
        expect(options.shallow).toBe(true);
        expect(options.recursive).toBe(false);
    });
});

describe('TemplateSubmodule type', () => {
    it('should have required path and repository fields', () => {
        // Given: A submodule definition
        const submodule: TemplateSubmodule = {
            path: 'src/inspector',
            repository: 'org/demo-inspector',
        };

        // Then: all fields should be accessible
        expect(submodule.path).toBe('src/inspector');
        expect(submodule.repository).toBe('org/demo-inspector');
    });
});
