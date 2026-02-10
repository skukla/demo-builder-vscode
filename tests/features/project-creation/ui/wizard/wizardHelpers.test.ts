import {
    getNavigationDirection,
    filterCompletedStepsForBackwardNav,
    getAdobeStepIndices,
    computeStateUpdatesForBackwardNav,
    getNextButtonText,
    hasMeshComponentSelected,
    getCompletedStepIndices,
    getEnabledWizardSteps,
    initializeComponentsFromImport,
    initializeAdobeContextFromImport,
    generateUniqueProjectName,
    initializeProjectName,
    getFirstEnabledStep,
    shouldShowWizardFooter,
    buildProjectConfig,
    WizardStepConfig,
    ImportedSettings,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardStep, WizardState, ComponentSelection } from '@/types/webview';

describe('wizardHelpers', () => {
    describe('getNavigationDirection', () => {
        it('should return "forward" when target is after current', () => {
            expect(getNavigationDirection(3, 1)).toBe('forward');
            expect(getNavigationDirection(5, 0)).toBe('forward');
        });

        it('should return "backward" when target is before current', () => {
            expect(getNavigationDirection(1, 3)).toBe('backward');
            expect(getNavigationDirection(0, 5)).toBe('backward');
        });

        it('should return "backward" when target equals current', () => {
            expect(getNavigationDirection(2, 2)).toBe('backward');
        });
    });

    describe('filterCompletedStepsForBackwardNav', () => {
        const wizardSteps: WizardStepConfig[] = [
            { id: 'adobe-auth', name: 'Auth' },
            { id: 'adobe-project', name: 'Project' },
            { id: 'adobe-workspace', name: 'Workspace' },
            { id: 'component-selection', name: 'Components' },
            { id: 'review', name: 'Review' },
        ];

        it('should return empty array when going to first step', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace'];

            const result = filterCompletedStepsForBackwardNav(
                completed,
                'adobe-auth',
                0,
                wizardSteps
            );

            expect(result).toEqual([]);
        });

        it('should remove target step and all steps after it', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace', 'component-selection'];

            const result = filterCompletedStepsForBackwardNav(
                completed,
                'adobe-project',
                1,
                wizardSteps
            );

            // Should only keep adobe-auth (index 0, which is before target index 1)
            expect(result).toEqual(['adobe-auth']);
        });

        it('should keep steps before target', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-project', 'adobe-workspace'];

            const result = filterCompletedStepsForBackwardNav(
                completed,
                'adobe-workspace',
                2,
                wizardSteps
            );

            expect(result).toEqual(['adobe-auth', 'adobe-project']);
        });

        it('should handle empty completed steps', () => {
            const result = filterCompletedStepsForBackwardNav(
                [],
                'adobe-project',
                1,
                wizardSteps
            );

            expect(result).toEqual([]);
        });
    });

    describe('getAdobeStepIndices', () => {
        it('should return correct indices when steps exist', () => {
            const wizardSteps: WizardStepConfig[] = [
                { id: 'adobe-auth', name: 'Auth' },
                { id: 'adobe-project', name: 'Project' },
                { id: 'adobe-workspace', name: 'Workspace' },
            ];

            const result = getAdobeStepIndices(wizardSteps);

            expect(result).toEqual({
                projectIndex: 1,
                workspaceIndex: 2,
            });
        });

        it('should return -1 for missing steps', () => {
            const wizardSteps: WizardStepConfig[] = [
                { id: 'adobe-auth', name: 'Auth' },
            ];

            const result = getAdobeStepIndices(wizardSteps);

            expect(result).toEqual({
                projectIndex: -1,
                workspaceIndex: -1,
            });
        });
    });

    describe('computeStateUpdatesForBackwardNav', () => {
        const indices = { projectIndex: 1, workspaceIndex: 2 };

        const createState = (): WizardState => ({
            currentStep: 'review',
            projectName: 'test',
            projectTemplate: 'citisignal',
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeProject: { id: 'proj-1', name: 'Project 1' },
            adobeWorkspace: { id: 'ws-1', name: 'Workspace 1' },
            projectsCache: [{ id: 'proj-1', name: 'Project 1' }],
            workspacesCache: [{ id: 'ws-1', name: 'Workspace 1' }],
        });

        it('should set currentStep to target step', () => {
            const state = createState();

            const result = computeStateUpdatesForBackwardNav(
                state,
                'adobe-project',
                1,
                indices
            );

            expect(result.currentStep).toBe('adobe-project');
        });

        it('should clear workspace when going before workspace step', () => {
            const state = createState();

            const result = computeStateUpdatesForBackwardNav(
                state,
                'adobe-project',
                1, // Before workspace (index 2)
                indices
            );

            expect(result.adobeWorkspace).toBeUndefined();
            expect(result.workspacesCache).toBeUndefined();
        });

        it('should clear project and workspace when going before project step', () => {
            const state = createState();

            const result = computeStateUpdatesForBackwardNav(
                state,
                'adobe-auth',
                0, // Before project (index 1)
                indices
            );

            expect(result.adobeProject).toBeUndefined();
            expect(result.projectsCache).toBeUndefined();
            expect(result.adobeWorkspace).toBeUndefined();
            expect(result.workspacesCache).toBeUndefined();
        });

        it('should not clear anything when going to workspace step itself', () => {
            const state = createState();

            const result = computeStateUpdatesForBackwardNav(
                state,
                'adobe-workspace',
                2, // To workspace step itself
                indices
            );

            expect(result.adobeProject).toBeUndefined(); // Not in updates
            expect(result.adobeWorkspace).toBeUndefined(); // Not in updates
            expect(Object.keys(result)).toEqual(['currentStep']);
        });

        it('should handle missing step indices', () => {
            const state = createState();
            const noIndices = { projectIndex: -1, workspaceIndex: -1 };

            const result = computeStateUpdatesForBackwardNav(
                state,
                'adobe-auth',
                0,
                noIndices
            );

            // Should only set currentStep, no cache clearing
            expect(Object.keys(result)).toEqual(['currentStep']);
        });
    });

    describe('getNextButtonText', () => {
        it('should return "Continue" when confirming selection', () => {
            expect(getNextButtonText(true, 1, 5)).toBe('Continue');
        });

        it('should return "Create" on review step (second-to-last)', () => {
            expect(getNextButtonText(false, 3, 5, undefined, 'review')).toBe('Create');
        });

        it('should return "Continue" on second-to-last step if not review (e.g., storefront-setup)', () => {
            expect(getNextButtonText(false, 3, 5, undefined, 'storefront-setup')).toBe('Continue');
        });

        it('should return "Continue" on other steps', () => {
            expect(getNextButtonText(false, 0, 5)).toBe('Continue');
            expect(getNextButtonText(false, 1, 5)).toBe('Continue');
            expect(getNextButtonText(false, 2, 5)).toBe('Continue');
        });

        it('should return "Save Changes" on review step in edit mode', () => {
            expect(getNextButtonText(false, 3, 5, 'edit', 'review')).toBe('Save Changes');
        });

        it('should return "Create" on review step when not in edit mode', () => {
            expect(getNextButtonText(false, 3, 5, 'create', 'review')).toBe('Create');
        });

        it('should return "Create" on review step in import mode', () => {
            expect(getNextButtonText(false, 3, 5, 'import', 'review')).toBe('Create');
        });
    });

    describe('hasMeshComponentSelected', () => {
        it('should return true when eds-commerce-mesh is in dependencies', () => {
            expect(hasMeshComponentSelected({
                frontend: 'citisignal',
                dependencies: ['eds-commerce-mesh'],
            })).toBe(true);
        });

        it('should return true when headless-commerce-mesh is in dependencies', () => {
            expect(hasMeshComponentSelected({
                frontend: 'citisignal',
                dependencies: ['headless-commerce-mesh'],
            })).toBe(true);
        });

        it('should return false when no mesh component is in dependencies', () => {
            expect(hasMeshComponentSelected({
                frontend: 'citisignal',
                dependencies: ['other-dep'],
            })).toBe(false);
        });

        it('should return false for undefined components', () => {
            expect(hasMeshComponentSelected(undefined)).toBe(false);
        });

        it('should return false for empty dependencies', () => {
            expect(hasMeshComponentSelected({
                frontend: 'citisignal',
                dependencies: [],
            })).toBe(false);
        });
    });

    describe('getCompletedStepIndices', () => {
        const wizardSteps: WizardStepConfig[] = [
            { id: 'adobe-auth', name: 'Auth' },
            { id: 'adobe-project', name: 'Project' },
            { id: 'adobe-workspace', name: 'Workspace' },
        ];

        it('should return indices of completed steps', () => {
            const completed: WizardStep[] = ['adobe-auth', 'adobe-workspace'];

            const result = getCompletedStepIndices(completed, wizardSteps);

            expect(result).toEqual([0, 2]);
        });

        it('should return empty array for no completed steps', () => {
            expect(getCompletedStepIndices([], wizardSteps)).toEqual([]);
        });

        it('should return -1 for steps not in wizard steps', () => {
            const completed: WizardStep[] = ['review'];

            const result = getCompletedStepIndices(completed, wizardSteps);

            expect(result).toEqual([-1]);
        });
    });

    describe('getEnabledWizardSteps', () => {
        it('should filter out disabled steps', () => {
            const steps = [
                { id: 'adobe-auth', name: 'Auth', enabled: true },
                { id: 'adobe-project', name: 'Project', enabled: false },
                { id: 'adobe-workspace', name: 'Workspace', enabled: true },
            ];

            const result = getEnabledWizardSteps(steps);

            expect(result).toEqual([
                { id: 'adobe-auth', name: 'Auth' },
                { id: 'adobe-workspace', name: 'Workspace' },
            ]);
        });

        it('should return empty array for undefined input', () => {
            expect(getEnabledWizardSteps(undefined)).toEqual([]);
        });

        it('should return empty array for empty input', () => {
            expect(getEnabledWizardSteps([])).toEqual([]);
        });

        it('should preserve order of enabled steps', () => {
            const steps = [
                { id: 'step1', name: 'Step 1', enabled: true },
                { id: 'step2', name: 'Step 2', enabled: true },
                { id: 'step3', name: 'Step 3', enabled: true },
            ];

            const result = getEnabledWizardSteps(steps);

            expect(result.map(s => s.id)).toEqual(['step1', 'step2', 'step3']);
        });
    });

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

    describe('getFirstEnabledStep', () => {
        it('should return first enabled step', () => {
            const steps = [
                { id: 'adobe-auth', enabled: true },
                { id: 'adobe-project', enabled: true },
            ];

            expect(getFirstEnabledStep(steps)).toBe('adobe-auth');
        });

        it('should skip disabled first step', () => {
            const steps = [
                { id: 'welcome', enabled: false },
                { id: 'adobe-auth', enabled: true },
            ];

            expect(getFirstEnabledStep(steps)).toBe('adobe-auth');
        });

        it('should return adobe-auth as fallback for empty array', () => {
            expect(getFirstEnabledStep([])).toBe('adobe-auth');
        });

        it('should return adobe-auth as fallback for undefined', () => {
            expect(getFirstEnabledStep(undefined)).toBe('adobe-auth');
        });

        it('should return adobe-auth when all steps disabled', () => {
            const steps = [
                { id: 'welcome', enabled: false },
                { id: 'prerequisites', enabled: false },
            ];

            expect(getFirstEnabledStep(steps)).toBe('adobe-auth');
        });
    });

    describe('shouldShowWizardFooter', () => {
        it('should return true for normal step (not last, not mesh-deployment)', () => {
            expect(shouldShowWizardFooter(false, 'adobe-auth')).toBe(true);
            expect(shouldShowWizardFooter(false, 'component-selection')).toBe(true);
            expect(shouldShowWizardFooter(false, 'prerequisites')).toBe(true);
        });

        it('should return false when on last step', () => {
            expect(shouldShowWizardFooter(true, 'review')).toBe(false);
            expect(shouldShowWizardFooter(true, 'deploy-mesh')).toBe(false);
        });

        it('should return false when on mesh-deployment step', () => {
            expect(shouldShowWizardFooter(false, 'mesh-deployment')).toBe(false);
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
            expect(config.edsConfig?.daLiveSite).toBe('my-repo');
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
