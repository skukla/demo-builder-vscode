/**
 * Dashboard Handlers - More-Menu Action Tests
 *
 * Tests for the dashboard "More" overflow handlers that resolve the current
 * project via getCurrentProject() (NOT a projectPath payload):
 * - handleExportProject: export current project settings (reuses exportProjectSettings)
 * - handleRepublishContent: republish EDS content (reuses republishStorefrontContent)
 * - handleRenameProject: rename current project (reuses shared rename core)
 */

import './dashboardValidatorMocks';

jest.mock('@/core/validation/validators/ProjectNameValidator', () => ({
    validateProjectNameSecurity: jest.fn(),
}));

// Imported by the dashboardHandlers module, so it has to answer even when unused.
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProject: jest.fn().mockResolvedValue({ success: true }),
}));

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================


jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
// The export and rename handlers each dynamically import the module that
// DECLARES what they need. These were one mock of a shared barrel until
// 2026-08-31 (PL-31) — which is why the two unrelated services were fused here.
const mockRenameProjectCore = jest.fn();
jest.mock('@/features/projects-dashboard/services/settingsTransferService', () => ({
    exportProjectSettings: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/projects-dashboard/services/projectRenameService', () => ({
    renameProjectCore: (...args: unknown[]) => mockRenameProjectCore(...args),
}));

// =============================================================================
// Imports under test
// =============================================================================

import {
    handleExportProject,
    handleRenameProject,
} from '@/features/dashboard/handlers/dashboardHandlers';
import { exportProjectSettings } from '@/features/projects-dashboard/services/settingsTransferService';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockProject } from '../../../helpers/projectFake';

// =============================================================================
// Test Utilities
// =============================================================================

function localProject(overrides?: Partial<Project>): Project {
    return createMockProject({
        name: 'test-project',
        path: '/path/to/test-project',
        status: 'ready',
        created: new Date('2025-01-26T10:00:00.000Z'),
        lastModified: new Date('2025-01-26T12:00:00.000Z'),
        componentInstances: {},
        ...overrides,
    });
}

function createMockContext(project: Project | undefined): HandlerContext {
    return createMockHandlerContext({
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
            removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
        }),
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
}

// =============================================================================
// Tests
// =============================================================================

describe('handleExportProject', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should delegate to exportProjectSettings with the current project', async () => {
        const project = localProject();
        const context = createMockContext(project);

        const result = await handleExportProject(context);

        expect(result.success).toBe(true);
        expect(exportProjectSettings as jest.Mock).toHaveBeenCalledWith(context, project);
    });

    it('should return error when no current project', async () => {
        const context = createMockContext(undefined);

        const result = await handleExportProject(context);

        expect(result.success).toBe(false);
        expect(exportProjectSettings as jest.Mock).not.toHaveBeenCalled();
    });
});

describe('handleRenameProject', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRenameProjectCore.mockResolvedValue({
            success: true,
            data: { success: true, newName: 'renamed', newPath: '/path/to/renamed' },
        });
    });

    it('should return error when no current project', async () => {
        const context = createMockContext(undefined);

        const result = await handleRenameProject(context, { newName: 'renamed' });

        expect(result.success).toBe(false);
        expect(mockRenameProjectCore).not.toHaveBeenCalled();
    });

    it('should return error when newName is missing', async () => {
        const project = localProject();
        const context = createMockContext(project);

        const result = await handleRenameProject(context, { newName: '' });

        expect(result.success).toBe(false);
        expect(mockRenameProjectCore).not.toHaveBeenCalled();
    });

    it('should delegate to renameProjectCore with the current project and new name', async () => {
        const project = localProject();
        const context = createMockContext(project);

        await handleRenameProject(context, { newName: 'renamed' });

        expect(mockRenameProjectCore).toHaveBeenCalledWith(context, project, 'renamed');
    });

    it('should return the result from renameProjectCore', async () => {
        const project = localProject();
        const context = createMockContext(project);
        mockRenameProjectCore.mockResolvedValue({
            success: true,
            data: { success: true, newName: 'renamed', newPath: '/path/to/renamed' },
        });

        const result = await handleRenameProject(context, { newName: 'renamed' });

        expect(result.success).toBe(true);
    });

    it('should refresh dashboard status after a successful rename', async () => {
        const project = localProject();
        const context = createMockContext(project);

        await handleRenameProject(context, { newName: 'renamed' });

        // Re-runs status so the dashboard title refreshes (title is driven by the
        // status payload's name, not a separate init).
        expect(context.panel!.webview.postMessage as jest.Mock).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'statusUpdate' })
        );
    });

    it('should not refresh when rename fails', async () => {
        const project = localProject();
        const context = createMockContext(project);
        mockRenameProjectCore.mockResolvedValue({ success: false, error: 'boom' });

        await handleRenameProject(context, { newName: 'renamed' });

        expect(context.panel!.webview.postMessage as jest.Mock).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'statusUpdate' })
        );
    });
});
