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
                selectedAddons: ['adobe-commerce-aco'],
                components: {
                    frontend: 'headless',
                    backend: 'adobe-commerce-paas',
                },
            };

            const config = buildProjectConfig(state);

            expect(config.selectedAddons).toEqual(['adobe-commerce-aco']);
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
            expect(config.adobe?.organizationName).toBe('Test Org');
            expect(config.adobe?.projectId).toBe('proj-456');
            expect(config.adobe?.workspace).toBe('ws-789');
        });

        it('should include editProjectPath for edit flows', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                wizardMode: 'edit',
                editProjectPath: '/path/to/project',
            };

            const config = buildProjectConfig(state);

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

        it('should include customBlockLibraries in the config', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                customBlockLibraries: [
                    {
                        name: 'my-blocks',
                        source: {
                            type: 'git',
                            url: 'https://github.com/user/blocks',
                            branch: 'main',
                        },
                    },
                ],
            };

            const config = buildProjectConfig(state);

            expect(config.customBlockLibraries).toEqual([
                {
                    name: 'my-blocks',
                    source: { type: 'git', url: 'https://github.com/user/blocks', branch: 'main' },
                },
            ]);
        });

        it('should carry selectedAppBuilderComponents and appBuilderComponentSources through', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                selectedAppBuilderComponents: ['erp-sync', 'owner-custom-app'],
                appBuilderComponentSources: {
                    'owner-custom-app': { owner: 'owner', repo: 'custom-app', branch: 'dev' },
                },
            };

            const config = buildProjectConfig(state);

            expect(config.selectedAppBuilderComponents).toEqual(['erp-sync', 'owner-custom-app']);
            expect(config.appBuilderComponentSources).toEqual({
                'owner-custom-app': { owner: 'owner', repo: 'custom-app', branch: 'dev' },
            });
        });

        it('should default selectedAppBuilderComponents and appBuilderComponentSources when absent', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
            };

            const config = buildProjectConfig(state);

            expect(config.selectedAppBuilderComponents).toEqual([]);
            expect(config.appBuilderComponentSources).toEqual({});
        });

        it('should default customBlockLibraries to empty array when not set', () => {
            const state: WizardState = {
                currentStep: 'review',
                projectName: 'test-project',
                // No customBlockLibraries
            };

            const config = buildProjectConfig(state);

            expect(config.customBlockLibraries).toEqual([]);
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

    describe('buildProjectConfig - additionalConsoleApis', () => {
        const baseState = (selectedConsoleApis?: Record<string, string[]>): WizardState => ({
            currentStep: 'review',
            projectName: 'test-project',
            selectedConsoleApis,
        });

        it('should union free API picks across integration ids', () => {
            const config = buildProjectConfig(
                baseState({
                    'erp-sync': ['AssetComputeSDK'],
                    'owner-custom-app': ['CCAPI'],
                })
            );

            expect(config.additionalConsoleApis).toEqual(['AssetComputeSDK', 'CCAPI']);
        });

        it('should dedupe codes picked under multiple integrations', () => {
            const config = buildProjectConfig(
                baseState({
                    'erp-sync': ['CCAPI', 'AssetComputeSDK'],
                    'owner-custom-app': ['CCAPI'],
                })
            );

            expect(config.additionalConsoleApis).toEqual(['AssetComputeSDK', 'CCAPI']);
        });

        it('should sort the union alphabetically', () => {
            const config = buildProjectConfig(
                baseState({
                    'erp-sync': ['ZTargetSDK', 'AssetComputeSDK'],
                    'owner-custom-app': ['McDataServicesSdk'],
                })
            );

            expect(config.additionalConsoleApis).toEqual([
                'AssetComputeSDK',
                'McDataServicesSdk',
                'ZTargetSDK',
            ]);
        });

        it('should include the reserved __existing__ key values in the union', () => {
            const config = buildProjectConfig(
                baseState({
                    __existing__: ['CCAPI', 'AdobeIOEventsSDK'],
                    'erp-sync': ['AssetComputeSDK', 'CCAPI'],
                })
            );

            expect(config.additionalConsoleApis).toEqual([
                'AdobeIOEventsSDK',
                'AssetComputeSDK',
                'CCAPI',
            ]);
        });

        it('should omit the field when selectedConsoleApis is absent', () => {
            const config = buildProjectConfig(baseState(undefined));

            expect(config.additionalConsoleApis).toBeUndefined();
        });

        it('should omit the field when selectedConsoleApis is an empty object', () => {
            const config = buildProjectConfig(baseState({}));

            expect(config.additionalConsoleApis).toBeUndefined();
        });

        // ---- attribution carried through (step 02) ----
        // The union above is now DERIVED for legacy readers; the keyed record is
        // what actually persists. Flattening at this boundary is what threw the
        // attribution away in the first place.

        it('carries the keyed picks through, not just their union', () => {
            const config = buildProjectConfig(
                baseState({
                    'erp-sync': ['AssetComputeSDK'],
                    'owner-custom-app': ['CCAPI'],
                })
            );

            expect(config.componentApiPicks).toEqual({
                'erp-sync': ['AssetComputeSDK'],
                'owner-custom-app': ['CCAPI'],
            });
        });

        it('keeps __existing__ as its own key (its owner is unrecoverable, not absent)', () => {
            const config = buildProjectConfig(
                baseState({ __existing__: ['CCAPI'], 'erp-sync': ['AssetComputeSDK'] })
            );

            expect(config.componentApiPicks).toEqual({
                __existing__: ['CCAPI'],
                'erp-sync': ['AssetComputeSDK'],
            });
        });

        it('applies the SDK charset filter per key and drops keys left empty', () => {
            const config = buildProjectConfig(
                baseState({
                    'erp-sync': ['CCAPI', 'not a code!'],
                    junk: ['also bad!'],
                })
            );

            expect(config.componentApiPicks).toEqual({ 'erp-sync': ['CCAPI'] });
        });

        it('omits the keyed field when nothing valid is picked', () => {
            expect(buildProjectConfig(baseState(undefined)).componentApiPicks).toBeUndefined();
            expect(buildProjectConfig(baseState({})).componentApiPicks).toBeUndefined();
            expect(
                buildProjectConfig(baseState({ 'erp-sync': [] })).componentApiPicks
            ).toBeUndefined();
        });

        // The legacy union must stay EXACTLY the union of the keyed record, or a
        // project written now and read by an older build would see a different set.
        it('the legacy union equals the union of the keyed record', () => {
            const config = buildProjectConfig(
                baseState({ __existing__: ['CCAPI'], 'erp-sync': ['AssetComputeSDK', 'CCAPI'] })
            );

            const fromKeyed = [...new Set(Object.values(config.componentApiPicks ?? {}).flat())];
            expect(fromKeyed.sort()).toEqual([...(config.additionalConsoleApis ?? [])].sort());
        });

        it('should omit the field when every integration has an empty picks array', () => {
            const config = buildProjectConfig(
                baseState({ 'erp-sync': [], 'owner-custom-app': [] })
            );

            expect(config.additionalConsoleApis).toBeUndefined();
        });

        it('should drop codes outside the SDK-code charset (boundary parity with addConsoleApis)', () => {
            const config = buildProjectConfig(
                baseState({
                    'erp-sync': ['AnalyticsSDK', 'bad code!', 'x$(id)'],
                    __existing__: ['CampaignSDK', 'nope;rm'],
                })
            );

            expect(config.additionalConsoleApis).toEqual(['AnalyticsSDK', 'CampaignSDK']);
        });

        it('should omit the field when all codes are invalid', () => {
            const config = buildProjectConfig(baseState({ 'erp-sync': ['$(evil)', ''] }));

            expect(config.additionalConsoleApis).toBeUndefined();
        });
    });
});
