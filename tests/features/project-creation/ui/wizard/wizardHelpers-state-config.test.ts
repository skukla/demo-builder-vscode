/**
 * Wizard Helpers Tests - State & Config
 *
 * Tests for state initialization and config-building helpers:
 * - initializeComponentsFromImport
 * - initializeAdobeContextFromImport
 * - generateUniqueProjectName
 * - initializeProjectName
 * - buildProjectConfig
 */

import {
    initializeComponentsFromImport,
    initializeAdobeContextFromImport,
    generateUniqueProjectName,
    initializeProjectName,
    buildProjectConfig,
    ImportedSettings,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardState, ComponentSelection } from '@/types/webview';

describe('wizardHelpers - state & config', () => {
    // State Initialization Helpers
    describe('initializeComponentsFromImport', () => {
        const defaults: ComponentSelection = {
            frontend: 'default-frontend',
            dependencies: ['default-dep'],
        };

        it('should return component selection from imported settings', () => {
            const imported: ImportedSettings = {
                selections: {
                    frontend: 'citisignal',
                    backend: 'commerce',
                    dependencies: ['mesh'],
                    integrations: ['aem'],
                    appBuilder: ['app1'],
                },
            };

            const result = initializeComponentsFromImport(imported, defaults);

            expect(result).toEqual({
                frontend: 'citisignal',
                backend: 'commerce',
                dependencies: ['mesh'],
                integrations: ['aem'],
                appBuilder: ['app1'],
            });
        });

        it('should return defaults when no imported settings', () => {
            const result = initializeComponentsFromImport(null, defaults);

            expect(result).toEqual(defaults);
        });

        it('should return undefined when no defaults and no import', () => {
            const result = initializeComponentsFromImport(null, undefined);

            expect(result).toBeUndefined();
        });

        it('should handle partial selections with defaults for arrays', () => {
            const imported: ImportedSettings = {
                selections: {
                    frontend: 'citisignal',
                },
            };

            const result = initializeComponentsFromImport(imported, defaults);

            expect(result).toEqual({
                frontend: 'citisignal',
                backend: undefined,
                dependencies: [],
                integrations: [],
                appBuilder: [],
            });
        });
    });

    describe('initializeAdobeContextFromImport', () => {
        it('should return full Adobe context when all fields present', () => {
            const imported: ImportedSettings = {
                adobe: {
                    orgId: 'org-123',
                    orgName: 'My Org',
                    projectId: 'proj-456',
                    projectName: 'My Project',
                    workspaceId: 'ws-789',
                    workspaceName: 'Production',
                },
            };

            const result = initializeAdobeContextFromImport(imported);

            expect(result).toEqual({
                org: { id: 'org-123', code: '', name: 'My Org' },
                project: { id: 'proj-456', name: 'My Project' },
                workspace: { id: 'ws-789', name: 'Production' },
            });
        });

        it('should return empty object when no imported settings', () => {
            expect(initializeAdobeContextFromImport(null)).toEqual({});
            expect(initializeAdobeContextFromImport(undefined)).toEqual({});
        });

        it('should return partial context when some fields missing', () => {
            const imported: ImportedSettings = {
                adobe: {
                    orgId: 'org-123',
                    // Missing projectId and workspaceId
                },
            };

            const result = initializeAdobeContextFromImport(imported);

            expect(result).toEqual({
                org: { id: 'org-123', code: '', name: '' },
            });
        });

        it('should use empty string for missing names', () => {
            const imported: ImportedSettings = {
                adobe: {
                    orgId: 'org-123',
                    // orgName missing
                    projectId: 'proj-456',
                    // projectName missing
                },
            };

            const result = initializeAdobeContextFromImport(imported);

            expect(result.org?.name).toBe('');
            expect(result.project?.name).toBe('');
        });
    });

    describe('generateUniqueProjectName', () => {
        it('should return original name if not taken', () => {
            expect(generateUniqueProjectName('my-project', [])).toBe('my-project');
            expect(generateUniqueProjectName('my-project', ['other'])).toBe('my-project');
        });

        it('should append -copy when name is taken', () => {
            expect(generateUniqueProjectName('my-project', ['my-project'])).toBe('my-project-copy');
        });

        it('should append -copy-2 when -copy is also taken', () => {
            const existing = ['my-project', 'my-project-copy'];

            expect(generateUniqueProjectName('my-project', existing)).toBe('my-project-copy-2');
        });

        it('should find next available number', () => {
            const existing = [
                'my-project',
                'my-project-copy',
                'my-project-copy-2',
                'my-project-copy-3',
            ];

            expect(generateUniqueProjectName('my-project', existing)).toBe('my-project-copy-4');
        });
    });

    describe('initializeProjectName', () => {
        it('should return unique name from imported source', () => {
            const imported: ImportedSettings = {
                source: { project: 'my-demo' },
            };

            const result = initializeProjectName(imported, ['other-project']);

            expect(result).toBe('my-demo');
        });

        it('should generate unique name when source name is taken', () => {
            const imported: ImportedSettings = {
                source: { project: 'my-demo' },
            };

            const result = initializeProjectName(imported, ['my-demo']);

            expect(result).toBe('my-demo-copy');
        });

        it('should return empty string when no imported settings', () => {
            expect(initializeProjectName(null, [])).toBe('');
            expect(initializeProjectName(undefined, [])).toBe('');
        });

        it('should return empty string when no source project', () => {
            const imported: ImportedSettings = {};

            expect(initializeProjectName(imported, [])).toBe('');
        });
    });

    describe('buildProjectConfig', () => {
        it('should include selectedAddons in the config', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                selectedAddons: ['demo-inspector'],
                components: {
                    frontend: 'headless',
                    backend: 'adobe-commerce-paas',
                },
            };

            const config = buildProjectConfig(state);

            expect(config.selectedAddons).toEqual(['demo-inspector']);
        });

        it('should default to empty array when no addons selected', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                // No selectedAddons
            };

            const config = buildProjectConfig(state);

            expect(config.selectedAddons).toEqual([]);
        });

        it('should include package and stack selections', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                selectedPackage: 'citisignal',
                selectedStack: 'headless-paas',
            };

            const config = buildProjectConfig(state);

            expect(config.selectedPackage).toBe('citisignal');
            expect(config.selectedStack).toBe('headless-paas');
        });

        it('should include adobe org/project/workspace IDs', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                adobeOrg: { id: 'org-123', code: 'ORG', name: 'Test Org' },
                adobeProject: { id: 'proj-456', name: 'test-proj', title: 'Test Project' },
                adobeWorkspace: { id: 'ws-789', name: 'Stage' },
            };

            const config = buildProjectConfig(state);

            expect(config.adobe?.organization).toBe('org-123');
            expect(config.adobe?.projectId).toBe('proj-456');
            expect(config.adobe?.workspace).toBe('ws-789');
        });

        it('should include editMode and editProjectPath for edit flows', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                editMode: true,
                editProjectPath: '/path/to/project',
            };

            const config = buildProjectConfig(state);

            expect(config.editMode).toBe(true);
            expect(config.editProjectPath).toBe('/path/to/project');
        });

        it('should include edsConfig for EDS stacks', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                edsConfig: {
                    repoName: 'my-repo',
                    repoMode: 'new',
                    daLiveOrg: 'myorg',
                    daLiveSite: 'mysite',
                    githubAuth: {
                        isAuthenticated: true,
                        user: { login: 'testuser', name: 'Test User', avatarUrl: '' },
                    },
                },
            };

            const config = buildProjectConfig(state);

            expect(config.edsConfig).toBeDefined();
            expect(config.edsConfig?.repoName).toBe('my-repo');
            expect(config.edsConfig?.repoMode).toBe('new');
            expect(config.edsConfig?.daLiveOrg).toBe('myorg');
            expect(config.edsConfig?.daLiveSite).toBe('mysite');
            expect(config.edsConfig?.githubOwner).toBe('testuser');
        });

        it('should include StorefrontSetupStep results when set', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                edsConfig: {
                    repoName: 'my-repo',
                    repoMode: 'new',
                    daLiveOrg: 'myorg',
                    daLiveSite: 'mysite',
                    githubAuth: {
                        isAuthenticated: true,
                        user: { login: 'testuser', name: 'Test User', avatarUrl: '' },
                    },
                    // Results from StorefrontSetupStep
                    repoUrl: 'https://github.com/testuser/my-repo',
                },
            };

            const config = buildProjectConfig(state);

            expect(config.edsConfig).toBeDefined();
            // StorefrontSetupStep repoUrl should be passed through to executor
            // Note: previewUrl/liveUrl are derived from githubRepo by typeGuards, not passed here
            expect(config.edsConfig?.repoUrl).toBe('https://github.com/testuser/my-repo');
        });

        it('should use explicit templateOwner/templateRepo and contentSource from storefront config', () => {
            // Template config is derived in WelcomeStep and stored in edsConfig
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'my-repo',
                    repoMode: 'new',
                    daLiveOrg: 'myorg',
                    daLiveSite: 'mysite',
                    // These are derived from brand+stack in WelcomeStep
                    templateOwner: 'demo-system-stores',
                    templateRepo: 'accs-citisignal',
                    contentSource: {
                        org: 'content-org',
                        site: 'content-site',
                    },
                },
            };

            const packages = [
                {
                    id: 'citisignal',
                    name: 'CitiSignal',
                    storefronts: {
                        'eds-paas': {
                            name: 'CitiSignal EDS',
                            source: {
                                type: 'git' as const,
                                url: 'https://github.com/demo-system-stores/accs-citisignal',
                                branch: 'main',
                            },
                        },
                    },
                },
            ];

            const config = buildProjectConfig(state, null, packages);

            // Template config passes through from edsConfig (set by WelcomeStep)
            expect(config.edsConfig?.templateOwner).toBe('demo-system-stores');
            expect(config.edsConfig?.templateRepo).toBe('accs-citisignal');
            expect(config.edsConfig?.contentSource).toEqual({
                org: 'content-org',
                site: 'content-site',
            });
        });

        it('should handle missing frontendSource and contentSource gracefully', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'my-repo',
                    repoMode: 'new',
                    daLiveOrg: 'myorg',
                    daLiveSite: 'mysite',
                },
            };

            // No packages provided - no frontendSource or contentSource available
            const config = buildProjectConfig(state, null, []);

            // Should be undefined when no source config
            expect(config.edsConfig?.templateOwner).toBeUndefined();
            expect(config.edsConfig?.templateRepo).toBeUndefined();
            expect(config.edsConfig?.contentSource).toBeUndefined();
        });
    });
});
