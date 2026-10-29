/**
 * handleExportProjectSettings — the headless settings export behind the
 * export_project_settings MCP tool. Resolves the current project, delegates to
 * the path-validated exportProjectSettingsToFile service, and returns only
 * what the service answers ({ path, verify }). The file carries no credential and
 * the handler takes no include-secrets option (D24, PL-56c).
 */


jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
jest.mock('@/core/state/projectStateSync');
const mockExportToFile = jest.fn();
jest.mock('@/features/projects-dashboard/services/settingsTransferService', () => ({
    exportProjectSettingsToFile: (...args: unknown[]) => mockExportToFile(...args),
}));

import './dashboardValidatorMocks';
import { handleExportProjectSettings } from '@/features/dashboard/handlers/dashboardHandlers';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

function makeContext(project: Project | undefined): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        logger: createMockLogger() as unknown as HandlerContext['logger'],
    });
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

    it('delegates to the file service with the path only and returns its answer', async () => {
        mockExportToFile.mockResolvedValue({
            path: '/projects/my-demo/my-demo.project.demo-builder.json',
            verify: 'Confirmed',
        });

        const result = await handleExportProjectSettings(makeContext(PROJECT), {
            path: 'backup.json',
        });

        expect(mockExportToFile).toHaveBeenCalledWith(PROJECT, { path: 'backup.json' });
        expect(result).toEqual({
            success: true,
            data: { path: '/projects/my-demo/my-demo.project.demo-builder.json', verify: 'Confirmed' },
        });
    });

    it('does not forward an includeSecrets a stale caller still sends', async () => {
        mockExportToFile.mockResolvedValue({ path: '/p', verify: 'Confirmed' });
        const stale: { path?: string } = JSON.parse('{"path":"backup.json","includeSecrets":true}');

        await handleExportProjectSettings(makeContext(PROJECT), stale);

        expect(mockExportToFile).toHaveBeenCalledWith(PROJECT, { path: 'backup.json' });
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
