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
    isStepSatisfied,
    findFirstIncompleteStep,
    buildProjectConfig,
    REQUIRED_REVIEW_STEPS,
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

        it('should return "Create" on second-to-last step', () => {
            expect(getNextButtonText(false, 3, 5)).toBe('Create');
        });

        it('should return "Continue" on other steps', () => {
            expect(getNextButtonText(false, 0, 5)).toBe('Continue');
            expect(getNextButtonText(false, 1, 5)).toBe('Continue');
            expect(getNextButtonText(false, 2, 5)).toBe('Continue');
        });

        it('should return "Save Changes" on second-to-last step in edit mode', () => {
            expect(getNextButtonText(false, 3, 5, 'edit')).toBe('Save Changes');
        });

        it('should return "Create" on second-to-last step when not in edit mode', () => {
            expect(getNextButtonText(false, 3, 5, 'create')).toBe('Create');
        });

        it('should return "Create" on second-to-last step in import mode', () => {
            expect(getNextButtonText(false, 3, 5, 'import')).toBe('Create');
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
        it('should return true for normal step (not last, not mesh-deployment, not preparing review)', () => {
            expect(shouldShowWizardFooter(false, 'adobe-auth', false)).toBe(true);
            expect(shouldShowWizardFooter(false, 'component-selection', false)).toBe(true);
            expect(shouldShowWizardFooter(false, 'prerequisites', false)).toBe(true);
        });

        it('should return false when on last step', () => {
            expect(shouldShowWizardFooter(true, 'review', false)).toBe(false);
            expect(shouldShowWizardFooter(true, 'project-creation', false)).toBe(false);
        });

        it('should return false when on mesh-deployment step', () => {
            expect(shouldShowWizardFooter(false, 'mesh-deployment', false)).toBe(false);
        });

        it('should return false when preparing review', () => {
            expect(shouldShowWizardFooter(false, 'component-selection', true)).toBe(false);
            expect(shouldShowWizardFooter(false, 'review', true)).toBe(false);
        });

        it('should return false when multiple conditions are true', () => {
            // Last step + preparing review
            expect(shouldShowWizardFooter(true, 'review', true)).toBe(false);
            // Mesh-deployment + preparing review
            expect(shouldShowWizardFooter(false, 'mesh-deployment', true)).toBe(false);
            // All conditions true (edge case)
            expect(shouldShowWizardFooter(true, 'mesh-deployment', true)).toBe(false);
        });
    });

    describe('REQUIRED_REVIEW_STEPS', () => {
        it('should include welcome, prerequisites, adobe-auth, and settings', () => {
            expect(REQUIRED_REVIEW_STEPS).toContain('welcome');
            expect(REQUIRED_REVIEW_STEPS).toContain('prerequisites');
            expect(REQUIRED_REVIEW_STEPS).toContain('adobe-auth');
            expect(REQUIRED_REVIEW_STEPS).toContain('settings');
        });

        it('should have exactly 4 required steps', () => {
            expect(REQUIRED_REVIEW_STEPS).toHaveLength(4);
        });
    });

    describe('isStepSatisfied', () => {
        const createEmptyState = (): WizardState => ({
            currentStep: 'welcome',
            projectName: '',
        });

        describe('welcome step (required review step)', () => {
            it('should always return false (required review step)', () => {
                // Welcome is a required review step - user must always review name/stack
                const state = { ...createEmptyState(), projectName: 'abc' };
                expect(isStepSatisfied('welcome', state)).toBe(false);
            });

            it('should return false even with valid project name', () => {
                const state = { ...createEmptyState(), projectName: 'my-valid-project' };
                expect(isStepSatisfied('welcome', state)).toBe(false);
            });

            it('should return false when projectName is empty', () => {
                expect(isStepSatisfied('welcome', createEmptyState())).toBe(false);
            });
        });

        describe('component-selection step', () => {
            it('should return true when frontend is selected', () => {
                const state = {
                    ...createEmptyState(),
                    components: { frontend: 'headless' },
                };
                expect(isStepSatisfied('component-selection', state)).toBe(true);
            });

            it('should return true when backend is selected', () => {
                const state = {
                    ...createEmptyState(),
                    components: { backend: 'commerce-paas' },
                };
                expect(isStepSatisfied('component-selection', state)).toBe(true);
            });

            it('should return false when no components selected', () => {
                expect(isStepSatisfied('component-selection', createEmptyState())).toBe(false);
            });
        });

        describe('prerequisites step', () => {
            it('should always return false (requires runtime check)', () => {
                const state = { ...createEmptyState(), projectName: 'test' };
                expect(isStepSatisfied('prerequisites', state)).toBe(false);
            });
        });

        describe('adobe context steps', () => {
            it('should return false for adobe-auth (required review step)', () => {
                // adobe-auth is a required review step - always needs fresh authentication
                const state = {
                    ...createEmptyState(),
                    adobeOrg: { id: 'org123', code: 'ORG', name: 'Test Org' },
                };
                expect(isStepSatisfied('adobe-auth', state)).toBe(false);
            });

            it('should return true for adobe-org when adobeOrg is set', () => {
                const state = {
                    ...createEmptyState(),
                    adobeOrg: { id: 'org123', code: 'ORG', name: 'Test Org' },
                };
                expect(isStepSatisfied('adobe-org', state)).toBe(true);
            });

            it('should return true for adobe-project when adobeProject is set', () => {
                const state = {
                    ...createEmptyState(),
                    adobeProject: { id: 'proj123', name: 'TestProject', title: 'Test' },
                };
                expect(isStepSatisfied('adobe-project', state)).toBe(true);
            });

            it('should return true for adobe-workspace when adobeWorkspace is set', () => {
                const state = {
                    ...createEmptyState(),
                    adobeWorkspace: { id: 'ws123', name: 'Development', title: 'Dev' },
                };
                expect(isStepSatisfied('adobe-workspace', state)).toBe(true);
            });
        });

        describe('eds config steps', () => {
            it('should return true for eds-repository-config when repoName is set', () => {
                const state = {
                    ...createEmptyState(),
                    edsConfig: { repoName: 'my-repo' },
                };
                expect(isStepSatisfied('eds-repository-config', state)).toBe(true);
            });

            it('should return true for data-source-config when daLiveSite is set', () => {
                const state = {
                    ...createEmptyState(),
                    edsConfig: { daLiveSite: 'my-site' },
                };
                expect(isStepSatisfied('data-source-config', state)).toBe(true);
            });
        });

        describe('settings step (required review step)', () => {
            it('should always return false for settings (required review step)', () => {
                // Settings is a required review step - user must always verify config values
                const state = {
                    ...createEmptyState(),
                    componentConfigs: { 'headless': { port: 3000 } },
                };
                expect(isStepSatisfied('settings', state)).toBe(false);
            });

            it('should return true for component-config when componentConfigs has data', () => {
                // component-config is NOT a required review step (legacy ID)
                const state = {
                    ...createEmptyState(),
                    componentConfigs: { 'commerce-mesh': { endpoint: 'https://...' } },
                };
                expect(isStepSatisfied('component-config', state)).toBe(true);
            });

            it('should return false for component-config when componentConfigs is empty', () => {
                const state = {
                    ...createEmptyState(),
                    componentConfigs: {},
                };
                expect(isStepSatisfied('component-config', state)).toBe(false);
            });

            it('should return false for component-config when componentConfigs is undefined', () => {
                expect(isStepSatisfied('component-config', createEmptyState())).toBe(false);
            });
        });

        describe('terminal steps', () => {
            it('should return false for review step', () => {
                expect(isStepSatisfied('review', createEmptyState())).toBe(false);
            });

            it('should return false for project-creation step', () => {
                expect(isStepSatisfied('project-creation', createEmptyState())).toBe(false);
            });
        });
    });

    describe('findFirstIncompleteStep', () => {
        const createMockSteps = (): Array<{ id: WizardStep; name: string }> => [
            { id: 'welcome', name: 'Welcome' },
            { id: 'prerequisites', name: 'Prerequisites' },
            { id: 'adobe-auth', name: 'Adobe Auth' },
            { id: 'adobe-project', name: 'Adobe Project' },
            { id: 'adobe-workspace', name: 'Adobe Workspace' },
            { id: 'component-selection', name: 'Components' },
            { id: 'component-config', name: 'Settings' },
            { id: 'review', name: 'Review' },
        ];

        it('should return first incomplete step after given index', () => {
            const state: WizardState = {
                currentStep: 'adobe-auth',
                projectName: 'test-project',
                // Adobe project/workspace not set - should be incomplete
            };
            const steps = createMockSteps();
            // After adobe-auth (index 2), before review (index 7)
            const result = findFirstIncompleteStep(state, steps, 2, 7);
            expect(result).toBe(3); // adobe-project is first incomplete
        });

        it('should return -1 when all steps are complete and confirmed', () => {
            const state: WizardState = {
                currentStep: 'adobe-auth',
                projectName: 'test-project',
                adobeOrg: { id: 'org', code: 'ORG', name: 'Org' },
                adobeProject: { id: 'proj', name: 'Proj', title: 'Project' },
                adobeWorkspace: { id: 'ws', name: 'WS', title: 'Workspace' },
                components: { frontend: 'headless' },
                componentConfigs: { 'headless': { port: 3000 } },
            };
            const steps = createMockSteps();
            // All steps between afterIndex and beforeIndex are confirmed
            const completedSteps: WizardStep[] = [
                'adobe-project',
                'adobe-workspace',
                'component-selection',
                'component-config',
            ];
            const result = findFirstIncompleteStep(state, steps, 2, 7, completedSteps);
            expect(result).toBe(-1); // All complete and confirmed
        });

        it('should skip satisfied and confirmed steps to find first incomplete', () => {
            const state: WizardState = {
                currentStep: 'adobe-auth',
                projectName: 'test-project',
                adobeOrg: { id: 'org', code: 'ORG', name: 'Org' },
                adobeProject: { id: 'proj', name: 'Proj', title: 'Project' },
                adobeWorkspace: { id: 'ws', name: 'WS', title: 'Workspace' },
                // components not selected - this step should be incomplete
            };
            const steps = createMockSteps();
            // Project and workspace are confirmed, but component-selection is not
            const completedSteps: WizardStep[] = ['adobe-project', 'adobe-workspace'];
            const result = findFirstIncompleteStep(state, steps, 2, 7, completedSteps);
            expect(result).toBe(5); // component-selection is first incomplete (no data)
        });

        it('should return unconfirmed step even if it has data', () => {
            // This tests the new behavior: step must be BOTH satisfied AND confirmed
            const state: WizardState = {
                currentStep: 'adobe-auth',
                projectName: 'test-project',
                adobeOrg: { id: 'org', code: 'ORG', name: 'Org' },
                adobeProject: { id: 'proj', name: 'Proj', title: 'Project' },
                adobeWorkspace: { id: 'ws', name: 'WS', title: 'Workspace' },
            };
            const steps = createMockSteps();
            // Project is NOT in completedSteps (e.g., removed after stack change)
            const completedSteps: WizardStep[] = ['adobe-workspace']; // workspace confirmed, but not project
            const result = findFirstIncompleteStep(state, steps, 2, 7, completedSteps);
            expect(result).toBe(3); // adobe-project needs confirmation despite having data
        });

        it('should respect beforeIndex boundary', () => {
            const state: WizardState = {
                currentStep: 'adobe-auth',
                projectName: 'test-project',
                // Everything incomplete
            };
            const steps = createMockSteps();
            // Only check between indices 2 and 4
            const result = findFirstIncompleteStep(state, steps, 2, 4);
            expect(result).toBe(3); // adobe-project
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
    });
});
