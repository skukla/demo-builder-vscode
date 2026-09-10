/**
 * Test utilities for Projects Dashboard feature
 */

import * as os from 'os';
import * as path from 'path';
import type { Project, ComponentInstance, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { StateManager } from '@/types/state';
import { createMockHandlerContext as createMockHandlerContextBase } from '../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockProject as createMockProjectBase } from '../../helpers/projectFake';
import { createMockStateManager } from '../../helpers/stateManagerFake';

/**
 * Get valid demo-builder projects base path
 * Uses the actual path structure expected by validateProjectPath
 */
function getProjectsBasePath(): string {
    return path.join(os.homedir(), '.demo-builder', 'projects');
}

/**
 * Creates a mock Project for testing
 */
export function createProjectsDashboardProject(overrides?: Partial<Project>): Project {
    const now = new Date();
    // Use valid demo-builder path for security validation compliance
    const basePath = getProjectsBasePath();
    return createMockProjectBase({
        name: 'Test Project',
        created: now,
        lastModified: now,
        path: path.join(basePath, 'test-project'),
        status: 'stopped' as ProjectStatus,
        organization: 'Test Org',
        componentInstances: {
            'headless': createMockComponentInstance({
                id: 'headless',
                name: 'CitiSignal',
                type: 'frontend',
                status: 'ready',
            }),
            'api-mesh': createMockComponentInstance({
                id: 'api-mesh',
                name: 'API Mesh',
                type: 'backend',
                subType: 'mesh',
                status: 'deployed',
            }),
        },
        ...overrides,
    });
}

/**
 * Creates a mock ComponentInstance for testing
 */
export function createMockComponentInstance(
    overrides?: Partial<ComponentInstance>
): ComponentInstance {
    return {
        id: 'test-component',
        name: 'Test Component',
        type: 'frontend',
        status: 'ready',
        ...overrides,
    };
}

/**
 * Creates a running project for testing
 */
export function createRunningProject(overrides?: Partial<Project>): Project {
    return createProjectsDashboardProject({
        status: 'running',
        componentInstances: {
            'headless': createMockComponentInstance({
                id: 'headless',
                name: 'CitiSignal',
                type: 'frontend',
                status: 'running',
                port: 3000,
            }),
            'api-mesh': createMockComponentInstance({
                id: 'api-mesh',
                name: 'API Mesh',
                type: 'backend',
                subType: 'mesh',
                status: 'deployed',
            }),
        },
        ...overrides,
    });
}

/**
 * Creates multiple mock projects for testing grid layouts
 */
export function createMockProjects(count: number): Project[] {
    const basePath = getProjectsBasePath();
    return Array.from({ length: count }, (_, i) =>
        createProjectsDashboardProject({
            name: `Project ${i + 1}`,
            path: path.join(basePath, `project-${i + 1}`),
            status: i % 2 === 0 ? 'stopped' : 'running',
        })
    );
}

/**
 * Mock handler context for testing dashboard handlers
 */
/**
 * `MockHandlerContext` was DELETED here on 2026-09-01.
 *
 * It was a hand-written interface naming three of `HandlerContext`'s members, and
 * the builder below reached it by way of `as never` and then `as unknown as
 * MockHandlerContext` — the real type thrown away twice. Every caller then had to
 * write `handleGetProjects(context as any)` to hand it back, so a context that was
 * missing a member the handler reads was indistinguishable from a correct one, in
 * both directions.
 *
 * The builder returns `jest.Mocked<HandlerContext>` now, which is what it was
 * building all along.
 */

/**
 * Creates a mock handler context for testing
 *
 * Matches the actual StateManager API:
 * - getAllProjects() returns { name, path, lastModified }[]
 * - loadProjectFromPath(path) returns full Project
 */
export function createProjectsDashboardContext(
    projects: Project[] = []
): jest.Mocked<HandlerContext> & { stateManager: jest.Mocked<StateManager> } {
    // Create simplified project list (what getAllProjects returns)
    const projectList = projects.map((p) => ({
        name: p.name,
        path: p.path,
        lastModified: p.lastModified,
    }));

    const stateManager = createMockStateManager({
        getAllProjects: jest.fn().mockResolvedValue(projectList),
        getCurrentProject: jest.fn().mockResolvedValue(projects[0] || null),
        loadProjectFromPath: jest.fn().mockImplementation((path: string) => {
            const project = projects.find((p) => p.path === path);
            return Promise.resolve(project || null);
        }),
    });

    const base = createMockHandlerContextBase({
        stateManager,
        logger: createMockLogger(),
        sendMessage: jest.fn(),
    });

    /**
     * `stateManager` is re-attached so its MOCK type survives.
     *
     * Read back through `HandlerContext`, its members are plain function types, so
     * a suite writing `context.stateManager.saveProject.mock.calls` gets "Property
     * 'mock' does not exist". Spreading it back with its concrete mocked type says
     * so without a cast — which is the point, since a cast here is what hid the
     * previous 34 errors.
     */
    return { ...base, stateManager };
}

/**
 * Gets component names from a project
 */
export function getComponentNames(project: Project): string[] {
    if (!project.componentInstances) return [];
    return Object.values(project.componentInstances).map((c) => c.name);
}

/**
 * Gets frontend port from a project (if running)
 */
export function getFrontendPort(project: Project): number | undefined {
    if (!project.componentInstances) return undefined;
    const frontend = Object.values(project.componentInstances).find(
        (c) => c.port !== undefined
    );
    return frontend?.port;
}
