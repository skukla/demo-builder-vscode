/**
 * exportProjectSettingsToFile — the headless settings export behind the
 * export_project_settings MCP tool. Writes the credential-free project file to a
 * path-validated file inside the project directory and returns { path, verify }.
 * There is no include-secrets option and no stamp (D24, PL-56c).
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
jest.mock('@/core/validation/PathSafetyValidator', () => ({
    assertPathInsideSync: (target: string, base: string) => mockAssertInside(target, base),
}));

import * as path from 'path';
import { exportProjectSettingsToFile } from '@/features/projects-dashboard/services/settingsTransferService';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';
import { createMockProject } from '../../../helpers/projectFake';

const writeMock = writeFileAtomic as jest.Mock;

// The REAL serializer runs: a stubbed one answers the same whatever it is handed,
// so it could not see this service asking for (or dropping) the credential strip.
const PROJECT = createMockProject({
    name: 'My Demo',
    path: '/projects/my-demo',
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_URL: 'https://shop.example.com',
            ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
        },
    },
});

describe('exportProjectSettingsToFile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAssertInside.mockImplementation((p: string) => p);
    });

    it('writes to <project>/<name>.project.demo-builder.json by default and returns the path', async () => {
        const result = await exportProjectSettingsToFile(PROJECT);

        const expected = path.join('/projects/my-demo', 'my-demo.project.demo-builder.json');
        expect(writeMock).toHaveBeenCalledTimes(1);
        expect(writeMock.mock.calls[0][0]).toBe(expected);
        expect(result).toEqual({ path: expected, verify: expect.stringContaining('the file exists at') });
    });

    it('writes a file with no credential and no includesSecrets stamp', async () => {
        await exportProjectSettingsToFile(PROJECT);

        const written = JSON.parse(writeMock.mock.calls[0][1]);
        // Control: the project's non-secret config did reach the file.
        expect(written.configs['adobe-commerce-paas'].ADOBE_COMMERCE_URL).toBe('https://shop.example.com');
        expect(written.source.extension).toBe('9.9.9');
        expect(writeMock.mock.calls[0][1]).not.toContain('fake-test-pw-not-a-secret');
        expect(written).not.toHaveProperty('includesSecrets');
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
