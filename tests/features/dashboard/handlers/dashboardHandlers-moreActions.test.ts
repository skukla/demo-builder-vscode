/**
 * Dashboard Handlers - More-Menu Action Tests
 *
 * Tests for the new dashboard "More" overflow handlers that resolve the current
 * project via getCurrentProject() (NOT a projectPath payload):
 * - handleCopyPath: copy current project path to clipboard
 * - handleExportProject: export current project settings (reuses exportProjectSettings)
 * - handleRepublishContent: republish EDS content (reuses republishStorefrontContent)
 * - handleRenameProject: rename current project (reuses shared rename core)
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';

jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================

jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    window: {
        activeColorTheme: { kind: 1 },
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn(),
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    ProgressLocation: { Notification: 15 },
    env: {
        clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
        openExternal: jest.fn(),
    },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/core/di', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
    validateProjectNameSecurity: jest.fn(),
}));

// Mock the shared services barrel (reused, not duplicated). Both the export and
// rename handlers dynamically import from this barrel.
const mockRenameProjectCore = jest.fn();
jest.mock('@/features/projects-dashboard/services', () => ({
    exportProjectSettings: jest.fn().mockResolvedValue({ success: true }),
    renameProjectCore: (...args: unknown[]) => mockRenameProjectCore(...args),
}));

// Mock deletion service (imported by dashboardHandlers module)
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProject: jest.fn().mockResolvedValue({ success: true }),
}));

// =============================================================================
// Imports under test
// =============================================================================

import * as vscode from 'vscode';
import {
    handleCopyPath,
    handleExportProject,
    handleRenameProject,
} from '@/features/dashboard/handlers/dashboardHandlers';
import { exportProjectSettings } from '@/features/projects-dashboard/services';

// =============================================================================
// Test Utilities
// =============================================================================

function createMockProject(overrides?: Partial<Project>): Project {
    return {
        name: 'test-project',
        path: '/path/to/test-project',
        status: 'ready',
        created: new Date('2025-01-26T10:00:00.000Z'),
        lastModified: new Date('2025-01-26T12:00:00.000Z'),
        componentInstances: {},
        ...overrides,
    } as unknown as Project;
}

function createMockContext(project: Project | undefined): HandlerContext {
    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
            removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
        context: { secrets: {} },
    } as unknown as HandlerContext;
}

// =============================================================================
// Tests
// =============================================================================

describe('handleCopyPath', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should write the current project path to the clipboard', async () => {
        const project = createMockProject({ path: '/my/project/path' });
        const context = createMockContext(project);

        const result = await handleCopyPath(context);

        expect(result.success).toBe(true);
        expect((vscode.env.clipboard.writeText as jest.Mock)).toHaveBeenCalledWith('/my/project/path');
    });

    it('should show an information toast on success', async () => {
        const project = createMockProject();
        const context = createMockContext(project);

        await handleCopyPath(context);

        expect((vscode.window.showInformationMessage as jest.Mock)).toHaveBeenCalled();
    });

    it('should return error when no current project', async () => {
        const context = createMockContext(undefined);

        const result = await handleCopyPath(context);

        expect(result.success).toBe(false);
        expect((vscode.env.clipboard.writeText as jest.Mock)).not.toHaveBeenCalled();
    });
});

describe('handleExportProject', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should delegate to exportProjectSettings with the current project', async () => {
        const project = createMockProject();
        const context = createMockContext(project);

        const result = await handleExportProject(context);

        expect(result.success).toBe(true);
        expect((exportProjectSettings as jest.Mock)).toHaveBeenCalledWith(context, project);
    });

    it('should return error when no current project', async () => {
        const context = createMockContext(undefined);

        const result = await handleExportProject(context);

        expect(result.success).toBe(false);
        expect((exportProjectSettings as jest.Mock)).not.toHaveBeenCalled();
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
        const project = createMockProject();
        const context = createMockContext(project);

        const result = await handleRenameProject(context, { newName: '' });

        expect(result.success).toBe(false);
        expect(mockRenameProjectCore).not.toHaveBeenCalled();
    });

    it('should delegate to renameProjectCore with the current project and new name', async () => {
        const project = createMockProject();
        const context = createMockContext(project);

        await handleRenameProject(context, { newName: 'renamed' });

        expect(mockRenameProjectCore).toHaveBeenCalledWith(context, project, 'renamed');
    });

    it('should return the result from renameProjectCore', async () => {
        const project = createMockProject();
        const context = createMockContext(project);
        mockRenameProjectCore.mockResolvedValue({
            success: true,
            data: { success: true, newName: 'renamed', newPath: '/path/to/renamed' },
        });

        const result = await handleRenameProject(context, { newName: 'renamed' });

        expect(result.success).toBe(true);
    });

    it('should refresh dashboard status after a successful rename', async () => {
        const project = createMockProject();
        const context = createMockContext(project);

        await handleRenameProject(context, { newName: 'renamed' });

        // Re-runs status so the dashboard title refreshes (title is driven by the
        // status payload's name, not a separate init).
        expect((context.panel!.webview.postMessage as jest.Mock)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'statusUpdate' }),
        );
    });

    it('should not refresh when rename fails', async () => {
        const project = createMockProject();
        const context = createMockContext(project);
        mockRenameProjectCore.mockResolvedValue({ success: false, error: 'boom' });

        await handleRenameProject(context, { newName: 'renamed' });

        expect((context.panel!.webview.postMessage as jest.Mock)).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'statusUpdate' }),
        );
    });
});
