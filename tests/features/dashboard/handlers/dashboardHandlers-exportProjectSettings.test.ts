/**
 * handleExportProjectSettings — the headless settings export behind the
 * export_project_settings MCP tool. Resolves the current project, delegates to
 * the path-validated exportProjectSettingsToFile service, and returns only
 * { path, includesSecrets } (secrets stay on disk, never in the response).
 */

jest.mock(
    'vscode',
    () => ({
        window: { activeColorTheme: { kind: 1 } },
        ColorThemeKind: { Dark: 2, Light: 1 },
        commands: { executeCommand: jest.fn() },
        env: { openExternal: jest.fn() },
        Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
    }),
    { virtual: true }
);

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));

const mockExportToFile = jest.fn();
jest.mock('@/features/projects-dashboard/services/settingsTransferService', () => ({
    exportProjectSettingsToFile: (...args: unknown[]) => mockExportToFile(...args),
}));

import { handleExportProjectSettings } from '@/features/dashboard/handlers/dashboardHandlers';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

function makeContext(project: Project | undefined): HandlerContext {
    return {
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        logger: createMockLogger() as unknown as HandlerContext['logger'],
    } as unknown as HandlerContext;
}

const PROJECT = createMockProject({ name: 'My Demo', path: '/projects/my-demo' });

describe('handleExportProjectSettings', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns PROJECT_NOT_FOUND when no project is loaded', async () => {
        const result = await handleExportProjectSettings(makeContext(undefined));
        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(mockExportToFile).not.toHaveBeenCalled();
    });

    it('delegates to the file service and returns only { path, includesSecrets }', async () => {
        mockExportToFile.mockResolvedValue({
            path: '/projects/my-demo/my-demo.demo-builder.json',
            includesSecrets: true,
        });

        const result = await handleExportProjectSettings(makeContext(PROJECT), {
            path: 'backup.json',
            includeSecrets: true,
        });

        expect(mockExportToFile).toHaveBeenCalledWith(PROJECT, {
            path: 'backup.json',
            includeSecrets: true,
        });
        expect(result).toEqual({
            success: true,
            data: { path: '/projects/my-demo/my-demo.demo-builder.json', includesSecrets: true },
        });
        // The response carries ONLY path + includesSecrets — no configs/secret values.
        expect(Object.keys(result.data as object).sort()).toEqual(['includesSecrets', 'path']);
    });

    it('surfaces a containment/validation failure as an error', async () => {
        mockExportToFile.mockRejectedValue(new Error('Path escapes allowed directory'));

        const result = await handleExportProjectSettings(makeContext(PROJECT), {
            path: '../../etc/evil.json',
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/escapes/);
    });
});
