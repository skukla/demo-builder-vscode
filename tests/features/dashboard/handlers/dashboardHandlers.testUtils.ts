/**
 * Shared test utilities for dashboardHandlers tests
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';
import { createMockProject as createMockProjectBase } from '../../../helpers/projectFake';

// Mock dependencies
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        // ADR-015 (2026-08-28): handlers resolve these when assembling runner
        // deps, so the default answer has to be usable rather than undefined.
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: jest.fn(async () => ({ valid: false })) }),
            getCachedOrganization: jest.fn(),
            getS2SDeployCredentials: jest.fn(),
        })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
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
        showWarningMessage: jest.fn().mockResolvedValue('Cancel'), // Default: user cancels
        // Slow per-integration ops (add/remove/deploy) run inside a progress
        // notification — the mock must INVOKE the task or the handler's result
        // never materializes and every one of them reads as a failure.
        withProgress: jest.fn(async (_options: unknown, task: (p: unknown) => unknown) =>
            task({ report: jest.fn() }),
        ),
    },
    ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
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
export function createDashboardProject(overrides?: Partial<Project>): Project {
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
        appBuilderComponents: {
            mesh: {
                kind: 'mesh',
                status: 'deployed',
                source: { owner: '', repo: '' },
                envVars: {
                    MESH_ID: 'mesh123',
                },
                sourceHash: 'hash123',
                lastDeployed: '2025-01-26T12:00:00.000Z',
                endpoint: 'https://mesh.example.com/graphql',
            },
        },
    } as unknown as Project;

    return createMockProjectBase({
        ...baseProject,
        ...overrides,
    } as never)
}

/**
 * Setup function to create minimal mock context
 */
export function setupMocks(projectOverrides?: Partial<Project>): TestMocks {
    const mockProject = createDashboardProject(projectOverrides);

    // Setup auth service mock (used by handleRequestStatus)
    const { ServiceLocator } = require('@/core/di');
    ServiceLocator.getAuthenticationService.mockReturnValue({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 60 }),
        getCachedOrganization: jest.fn().mockReturnValue(undefined),
        // On-open org-context check uses the SDK-only read (never the CLI fallback).
        // Default to [] → the check resolves to 'unknown' without a browser/stall.
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
    });

    const mockContext = {
        panel: {
            webview: {
                postMessage: jest.fn(),
            },
        } as any,
        // The VS Code ExtensionContext seam (secrets used by the appBuilderComponent runner deps).
        context: {
            extensionPath: '/ext',
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() },
        } as any,
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(mockProject),
            saveProject: jest.fn().mockResolvedValue(undefined),
            saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
            markDirty: jest.fn(),
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
