/**
 * Shared test factories for the appComponentManager suites
 * (appComponentManager.test.ts — add; appComponentManager-remove.test.ts — remove).
 *
 * NOTE: `jest.mock` calls are per-file and stay in each test file; only the
 * mock-free factories live here (same pattern as appDeployment.testUtils.ts).
 */

import type { Project } from '@/types/base';

export interface ComponentManagerLike {
    installComponent: jest.Mock;
    removeComponent: jest.Mock;
}

export interface CommandManagerLike {
    execute: jest.Mock;
}

export function createComponentManager(): ComponentManagerLike {
    return {
        // installComponent ADDS exactly one instance to project.componentInstances,
        // mirroring the real ComponentManager git path. It must NOT wipe siblings.
        installComponent: jest.fn(async (project: Project, def: { id: string; name?: string }) => {
            const instance = {
                id: def.id,
                name: def.name ?? def.id,
                type: 'app-builder',
                subType: 'app',
                status: 'ready',
                path: `/proj/components/${def.id}`,
                lastUpdated: new Date(),
            };
            project.componentInstances = project.componentInstances ?? {};
            project.componentInstances[def.id] = instance as never;
            return { success: true, component: instance };
        }),
        removeComponent: jest.fn(async (project: Project, id: string) => {
            if (project.componentInstances) {
                delete project.componentInstances[id];
            }
        }),
    };
}

export function createCommandManager(): CommandManagerLike {
    return {
        execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    };
}

export function createLogger() {
    return { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

export function createDeps(
    overrides: Partial<{
        componentManager: ComponentManagerLike;
        commandManager: CommandManagerLike;
        saveProject: jest.Mock;
        getCachedOrganization: jest.Mock;
    }> = {}
) {
    return {
        componentManager: overrides.componentManager ?? createComponentManager(),
        commandManager: overrides.commandManager ?? createCommandManager(),
        logger: createLogger(),
        saveProject: overrides.saveProject ?? jest.fn().mockResolvedValue(undefined),
        getCachedOrganization:
            overrides.getCachedOrganization ?? jest.fn().mockReturnValue(undefined),
    };
}

export function createProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/proj',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
        // Pre-seed a sibling mesh + frontend instance: add/remove MUST leave these alone.
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'Mesh',
                type: 'dependency',
                subType: 'mesh',
                status: 'ready',
                path: '/proj/components/commerce-mesh',
            } as never,
            citisignal: {
                id: 'citisignal',
                name: 'Frontend',
                type: 'frontend',
                status: 'ready',
                path: '/proj/components/citisignal',
            } as never,
        },
        ...overrides,
    } as unknown as Project;
}
