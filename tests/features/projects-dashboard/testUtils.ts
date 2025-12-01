/**
 * Test utilities for Projects Dashboard feature
 */

import * as os from 'os';
import * as path from 'path';
import type { Project, ComponentInstance, ProjectStatus } from '@/types/base';

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
export function createMockProject(overrides?: Partial<Project>): Project {
    const now = new Date();
    // Use valid demo-builder path for security validation compliance
    const basePath = getProjectsBasePath();
    return {
        name: 'Test Project',
        created: now,
        lastModified: now,
        path: path.join(basePath, 'test-project'),
        status: 'stopped' as ProjectStatus,
        organization: 'Test Org',
        componentInstances: {
            'citisignal-nextjs': createMockComponentInstance({
                id: 'citisignal-nextjs',
                name: 'CitiSignal',
                status: 'ready',
            }),
            'api-mesh': createMockComponentInstance({
                id: 'api-mesh',
                name: 'API Mesh',
                status: 'deployed',
            }),
        },
        ...overrides,
    };
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
        status: 'ready',
        ...overrides,
    };
}

/**
 * Creates a running project for testing
 */
export function createRunningProject(overrides?: Partial<Project>): Project {
    return createMockProject({
        status: 'running',
        componentInstances: {
            'citisignal-nextjs': createMockComponentInstance({
                id: 'citisignal-nextjs',
                name: 'CitiSignal',
                status: 'running',
                port: 3000,
            }),
            'api-mesh': createMockComponentInstance({
                id: 'api-mesh',
                name: 'API Mesh',
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
        createMockProject({
            name: `Project ${i + 1}`,
            path: path.join(basePath, `project-${i + 1}`),
            status: i % 2 === 0 ? 'stopped' : 'running',
        })
    );
}

/**
 * Mock handler context for testing dashboard handlers
 */
export interface MockHandlerContext {
    stateManager: {
        getAllProjects: jest.Mock;
        getCurrentProject: jest.Mock;
        loadProjectFromPath: jest.Mock;
        saveProject: jest.Mock;
    };
    logger: {
        info: jest.Mock;
        debug: jest.Mock;
        error: jest.Mock;
    };
    sendMessage: jest.Mock;
}

/**
 * Creates a mock handler context for testing
 *
 * Matches the actual StateManager API:
 * - getAllProjects() returns { name, path, lastModified }[]
 * - loadProjectFromPath(path) returns full Project
 */
export function createMockHandlerContext(
    projects: Project[] = []
): MockHandlerContext {
    // Create simplified project list (what getAllProjects returns)
    const projectList = projects.map((p) => ({
        name: p.name,
        path: p.path,
        lastModified: p.lastModified,
    }));

    return {
        stateManager: {
            getAllProjects: jest.fn().mockResolvedValue(projectList),
            getCurrentProject: jest.fn().mockResolvedValue(projects[0] || null),
            loadProjectFromPath: jest.fn().mockImplementation((path: string) => {
                const project = projects.find((p) => p.path === path);
                return Promise.resolve(project || null);
            }),
            saveProject: jest.fn().mockResolvedValue(undefined),
        },
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
        },
        sendMessage: jest.fn(),
    };
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
