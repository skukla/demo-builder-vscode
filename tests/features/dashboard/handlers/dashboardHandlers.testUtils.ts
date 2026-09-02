/**
 * Shared test utilities for dashboardHandlers tests
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types/base';
import { createMockProject as createMockProjectBase } from '../../../helpers/projectFake';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
// Mock dependencies
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/core/di/serviceLocator', () => ({
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
jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));
jest.mock(
    'vscode',
    () => ({
        window: {
            activeColorTheme: { kind: 1 }, // Light theme
            showWarningMessage: jest.fn().mockResolvedValue('Cancel'), // Default: user cancels
            // Slow per-integration ops (add/remove/deploy) run inside a progress
            // notification — the mock must INVOKE the task or the handler's result
            // never materializes and every one of them reads as a failure.
            withProgress: jest.fn(async (_options: unknown, task: (p: unknown) => unknown) =>
                task({ report: jest.fn() })
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
    }),
    { virtual: true }
);

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
            headless: {
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
    });
}

/**
 * Setup function to create minimal mock context
 */
export function setupMocks(projectOverrides?: Partial<Project>): TestMocks {
    const mockProject = createDashboardProject(projectOverrides);

    // Setup auth service mock (used by handleRequestStatus)
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService.mockReturnValue({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getTokenStatus: jest
            .fn()
            .mockResolvedValue({ isAuthenticated: true, expiresInMinutes: 60 }),
        getCachedOrganization: jest.fn().mockReturnValue(undefined),
        // On-open org-context check uses the SDK-only read (never the CLI fallback).
        // Default to [] → the check resolves to 'unknown' without a browser/stall.
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
    });

    /**
     * FOUR erasures lived in this one object — `panel`, `context`, `stateManager`
     * and the whole thing — so a handler could read anything off any of them and
     * nothing said so. Every one of the four has a canonical builder.
     */
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(mockProject),
        saveProject: jest.fn().mockResolvedValue(undefined),
        saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
        markDirty: jest.fn(),
    });
    const base = createMockHandlerContext({
        panel: createMockWebviewPanel(),
        // The VS Code ExtensionContext seam (secrets used by the appBuilderComponent runner deps).
        context: createMockExtensionContext(
            { secrets: createMockSecretStorage().secrets },
            '/ext'
        ),
        stateManager,
        logger: createMockLogger(),
        sendMessage: jest.fn(),
    });
    // Re-attached so its MOCK type survives the read back through HandlerContext.
    const mockContext = { ...base, stateManager };

    return {
        mockContext,
        mockProject,
    };
}
