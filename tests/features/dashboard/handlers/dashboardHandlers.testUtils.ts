/**
 * Shared test utilities for dashboardHandlers tests
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';

// Mock dependencies
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));
jest.mock('vscode', () => ({
    window: {
        activeColorTheme: { kind: 1 }, // Light theme
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    commands: {
        executeCommand: jest.fn(),
    },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

export interface TestMocks {
    mockContext: HandlerContext;
    mockProject: Project;
}

/**
 * Factory function to create a mock project with typical structure
 */
export function createMockProject(overrides?: Partial<Project>): Project {
    const baseProject = {
        name: 'test-project',
        path: '/path/to/project',
        status: 'running',
        created: new Date('2025-01-26T10:00:00.000Z'),
        lastModified: new Date('2025-01-26T12:00:00.000Z'),
        adobe: {
            organization: 'org123',
            projectName: 'Test Project',
            projectId: 'project123',
            workspace: 'workspace123',
            authenticated: true,
        },
        componentInstances: {
            'headless': {
                id: 'headless',
                name: 'CitiSignal Next.js',
                type: 'frontend',
                status: 'ready',
                path: '/path/to/frontend',
                port: 3000,
            },
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                type: 'backend',
                subType: 'mesh',
                status: 'deployed',
                path: '/path/to/mesh',
                endpoint: 'https://mesh.example.com/graphql',
            },
        },
        componentConfigs: {
            'commerce-mesh': {
                endpoint: 'https://commerce.example.com/graphql',
            },
        },
        meshState: {
            envVars: {
                MESH_ID: 'mesh123',
            },
            sourceHash: 'hash123',
            lastDeployed: '2025-01-26T12:00:00.000Z',
        },
    } as unknown as Project;

    return {
        ...baseProject,
        ...overrides,
    } as unknown as Project;
}

/**
 * Setup function to create minimal mock context
 */
export function setupMocks(projectOverrides?: Partial<Project>): TestMocks {
    const mockProject = createMockProject(projectOverrides);

    const mockContext = {
        panel: {
            webview: {
                postMessage: jest.fn(),
            },
        } as any,
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(mockProject),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as any,
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as any,
        sendMessage: jest.fn(),
    } as any;

    return {
        mockContext,
        mockProject,
    };
}
