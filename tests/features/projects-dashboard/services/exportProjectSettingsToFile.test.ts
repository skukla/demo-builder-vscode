/**
 * exportProjectSettingsToFile — the headless settings export behind the
 * export_project_settings MCP tool. Writes the settings JSON (with secrets when
 * requested) to a path-validated file inside the project directory and returns
 * only { path, includesSecrets } — secrets never travel in the return value.
 */

jest.mock(
    'vscode',
    () => ({
        extensions: {
            getExtension: jest.fn(() => ({ packageJSON: { version: '9.9.9' } })),
        },
    }),
    { virtual: true }
);

jest.mock('@/core/utils/writeFileAtomic', () => ({ writeFileAtomic: jest.fn() }));

const mockAssertInside = jest.fn((p: string, _base: string) => p);
jest.mock('@/core/validation', () => ({
    assertPathInsideSync: (target: string, base: string) => mockAssertInside(target, base),
}));

// Keep getSuggestedFilename real; stub the serializer so the result's
// includesSecrets faithfully reflects the flag we pass in.
jest.mock('@/features/projects-dashboard/services/settingsSerializer', () => {
    const actual = jest.requireActual('@/features/projects-dashboard/services/settingsSerializer');
    return {
        ...actual,
        createExportSettings: jest.fn(
            (_project: unknown, version: string, includeSecrets: boolean) => ({
                version: '1.0.0',
                source: { extension: version },
                includesSecrets: includeSecrets,
                configs: includeSecrets ? { API_KEY: 'super-secret' } : {},
            })
        ),
    };
});

import * as path from 'path';
import { exportProjectSettingsToFile } from '@/features/projects-dashboard/services/settingsTransferService';
import { createExportSettings } from '@/features/projects-dashboard/services/settingsSerializer';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';
import { createMockProject } from '../../../helpers/projectFake';

const writeMock = writeFileAtomic as jest.Mock;
const createMock = createExportSettings as jest.Mock;

const PROJECT = createMockProject({ name: 'My Demo', path: '/projects/my-demo' });

describe('exportProjectSettingsToFile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAssertInside.mockImplementation((p: string) => p);
    });

    it('writes to <project>/<name>.demo-builder.json by default and returns the path', async () => {
        const result = await exportProjectSettingsToFile(PROJECT);

        const expected = path.join('/projects/my-demo', 'my-demo.demo-builder.json');
        expect(result.path).toBe(expected);
        expect(result.includesSecrets).toBe(true);
        // The file is written; secrets live in the FILE, not the return value.
        expect(writeMock).toHaveBeenCalledTimes(1);
        expect(writeMock.mock.calls[0][0]).toBe(expected);
        expect(writeMock.mock.calls[0][1]).toContain('super-secret');
        expect(result).toEqual({ path: expected, includesSecrets: true, verify: expect.stringContaining('the file exists at') });
    });

    it('honors includeSecrets=false (no secrets on disk, flag reflected)', async () => {
        const result = await exportProjectSettingsToFile(PROJECT, { includeSecrets: false });

        expect(createMock).toHaveBeenCalledWith(PROJECT, '9.9.9', false);
        expect(result.includesSecrets).toBe(false);
        expect(writeMock.mock.calls[0][1]).not.toContain('super-secret');
    });

    it('resolves a relative path against the project dir', async () => {
        const result = await exportProjectSettingsToFile(PROJECT, {
            path: 'backups/settings.json',
        });

        const expected = path.join('/projects/my-demo', 'backups/settings.json');
        expect(result.path).toBe(expected);
        expect(mockAssertInside).toHaveBeenCalledWith(expected, '/projects/my-demo');
    });

    it('containment-checks every target against the project directory', async () => {
        await exportProjectSettingsToFile(PROJECT);
        expect(mockAssertInside).toHaveBeenCalledWith(expect.any(String), '/projects/my-demo');
    });

    it('propagates a containment failure (traversal) and writes nothing', async () => {
        mockAssertInside.mockImplementation(() => {
            throw new Error('Path escapes allowed directory');
        });

        await expect(
            exportProjectSettingsToFile(PROJECT, { path: '../../etc/evil.json' })
        ).rejects.toThrow(/escapes/);
        expect(writeMock).not.toHaveBeenCalled();
    });
});
