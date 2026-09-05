/**
 * `handleGetProjects` — the decisions it makes while assembling the list.
 *
 * The sibling `dashboardHandlers` suite covers the happy path and the mesh
 * statuses. This one covers what it decides ABOUT each project: which ones it
 * loads and how, which ones it enriches, the pinned-first ordering, and which
 * project it reports as running.
 */

import * as os from 'os';
import * as path from 'path';
import type { Project } from '@/types/base';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { handleGetProjects } from './dashboardHandlers.testUtils';
import { createProjectsDashboardContext, createProjectsDashboardProject } from '../testUtils';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

const PROJECTS_ROOT = path.join(os.homedir(), '.demo-builder', 'projects');

interface ProjectsResponse {
    projects: Project[];
    projectsViewMode?: string;
    runningProjectPath?: string;
}

const dataOf = (result: { data?: unknown }): ProjectsResponse => result.data as ProjectsResponse;

/** A project at a path derived from its name, so the fake loader can find it. */
function projectNamed(name: string, overrides?: Partial<Project>): Project {
    return createProjectsDashboardProject({
        name,
        path: path.join(PROJECTS_ROOT, name),
        ...overrides,
    });
}

/**
 * ADR-015: this boundary resolves its collaborators from the registry, which the
 * shared node setup empties after EVERY test.
 */
let commandExecutor: ReturnType<typeof createMockCommandExecutor>;
let authService: ReturnType<typeof createMockAuthenticationService>;

beforeEach(() => {
    jest.clearAllMocks();
    const vscode = require('vscode');
    vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('cards'),
    });
    // The registry refuses a second registration, so the fakes the assertions
    // below identify have to be the ones registered here.
    commandExecutor = createMockCommandExecutor();
    authService = createMockAuthenticationService();
    ServiceLocator.setCommandExecutor(commandExecutor);
    ServiceLocator.setAuthenticationService(authService);
});

describe('handleGetProjects — loading', () => {
    it('loads each listed project read-only, never persisting the current-project pointer', async () => {
        const project = projectNamed('alpha');
        const context = createProjectsDashboardContext([project]);

        await handleGetProjects(context);

        // persistAfterLoad: false — merely rendering the list must not move the
        // pointer to whichever project happened to be last in the scan.
        expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
            project.path,
            undefined,
            { persistAfterLoad: false },
        );
    });

    it('skips a listed project that will not load rather than emitting a hole', async () => {
        const present = projectNamed('alpha');
        const context = createProjectsDashboardContext([present]);
        // getAllProjects lists two; only one of them loads.
        context.stateManager.getAllProjects.mockResolvedValue([
            { name: 'alpha', path: present.path, lastModified: present.lastModified },
            { name: 'ghost', path: path.join(PROJECTS_ROOT, 'ghost'), lastModified: new Date() },
        ]);

        const result = await handleGetProjects(context);

        const names = dataOf(result).projects.map((p) => p.name);
        expect(names).toEqual(['alpha']);
    });
});

describe('handleGetProjects — mesh enrichment gate', () => {
    it('leaves a mesh project with no componentConfigs unenriched and unsaved', async () => {
        const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
        hasMeshDeploymentRecord.mockReturnValue(true);
        // The default fixture HAS an api-mesh instance; what it lacks is configs.
        const project = projectNamed('alpha', { componentConfigs: undefined });
        const context = createProjectsDashboardContext([project]);

        const result = await handleGetProjects(context);

        expect(dataOf(result).projects[0].meshStatusSummary).toBeUndefined();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('leaves a project with configs but NO mesh component unenriched and unsaved', async () => {
        const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
        hasMeshDeploymentRecord.mockReturnValue(true);
        const project = projectNamed('alpha', {
            componentInstances: {},
            componentConfigs: { 'api-mesh': { SOME_VAR: 'value' } },
        });
        const context = createProjectsDashboardContext([project]);

        const result = await handleGetProjects(context);

        expect(dataOf(result).projects[0].meshStatusSummary).toBeUndefined();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('hands the staleness detector the project, its configs and both located services', async () => {
        const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
        const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');
        const { determineMeshStatus } = require('@/features/mesh/services/meshStatusResolver');
        hasMeshDeploymentRecord.mockReturnValue(true);
        detectMeshChanges.mockResolvedValue({ hasChanges: false });
        determineMeshStatus.mockResolvedValue('deployed');
        const configs = { 'api-mesh': { SOME_VAR: 'value' } };
        const project = projectNamed('alpha', { componentConfigs: configs });
        const context = createProjectsDashboardContext([project]);

        await handleGetProjects(context);

        // The deps object is the decision here: a detector handed no executor
        // reaches the `aio` CLI through whatever the process last selected.
        expect(detectMeshChanges).toHaveBeenCalledWith(project, configs, {
            commandManager: commandExecutor,
            authManager: authService,
        });
    });
});

describe('handleGetProjects — ordering and running project', () => {
    it('puts pinned projects first, alphabetical within each group', async () => {
        const projects = [
            projectNamed('alpha'),
            projectNamed('zulu', { pinned: true }),
            projectNamed('bravo'),
            projectNamed('mike', { pinned: true }),
        ];
        const context = createProjectsDashboardContext(projects);

        const result = await handleGetProjects(context);

        expect(dataOf(result).projects.map((p) => p.name)).toEqual([
            'mike',
            'zulu',
            'alpha',
            'bravo',
        ]);
    });

    it('reports the path of the running project, not merely that one exists', async () => {
        const projects = [
            projectNamed('alpha', { status: 'stopped' }),
            projectNamed('bravo', { status: 'running' }),
            projectNamed('charlie', { status: 'stopped' }),
        ];
        const context = createProjectsDashboardContext(projects);

        const result = await handleGetProjects(context);

        expect(dataOf(result).runningProjectPath).toBe(path.join(PROJECTS_ROOT, 'bravo'));
    });

    it('omits runningProjectPath when every project is stopped', async () => {
        const projects = [
            projectNamed('alpha', { status: 'stopped' }),
            projectNamed('bravo', { status: 'stopped' }),
        ];
        const context = createProjectsDashboardContext(projects);

        const result = await handleGetProjects(context);

        expect(dataOf(result).runningProjectPath).toBeUndefined();
    });

    it('prefers the session view-mode override over the VS Code setting', async () => {
        const { sessionUIState } = require('@/core/state/sessionUIState');
        const vscode = require('vscode');
        vscode.workspace.getConfiguration.mockReturnValue({
            get: jest.fn().mockReturnValue('cards'),
        });
        sessionUIState.viewModeOverride = 'rows';
        const context = createProjectsDashboardContext([]);

        const result = await handleGetProjects(context);

        expect(dataOf(result).projectsViewMode).toBe('rows');
        sessionUIState.reset();
    });
});
