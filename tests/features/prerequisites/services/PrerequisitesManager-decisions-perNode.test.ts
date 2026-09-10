/**
 * PrerequisitesManager — decision coverage (PL-22): the fnm-aware per-node-version path.
 *
 * `checkPerNodeVersionStatus` and `getInstalledNodeVersions` are mocked so the branch
 * under test is the manager's own: which majors it caches, under which key, and how it
 * turns a set of per-version verdicts into one status.
 */

jest.mock('@/core/config/ConfigurationLoader');

const mockCheckPerNodeVersionStatus = jest.fn();
jest.mock('@/features/prerequisites/handlers/shared', () => ({
    ...jest.requireActual('@/features/prerequisites/handlers/shared'),
    checkPerNodeVersionStatus: mockCheckPerNodeVersionStatus,
}));

// Declared INSIDE the factory: PrerequisitesManager imports this module statically, so
// the factory runs during that import — before a `const` above it has been initialised.
jest.mock('@/features/prerequisites/services/versioning/MultiVersionDetector', () => ({
    ...jest.requireActual('@/features/prerequisites/services/versioning/MultiVersionDetector'),
    getInstalledNodeVersions: jest.fn(),
}));

// The wall FIRST: this module installs jest.mock at its top level, and a mock
// registers only when the file's body runs — after a subject import, too late.
import { setupMocks, setupConfigLoader, type TestMocks } from './PrerequisitesManager.testUtils';

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import { createSuccessResult } from '../../../helpers/commandResultFake';
import { getInstalledNodeVersions } from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import { AIO } from './PrerequisitesManager-decisions.testUtils';

const mockGetInstalledNodeVersions = getInstalledNodeVersions as jest.Mock;

describe('PrerequisitesManager — the per-node-version path', () => {
    let manager: PrerequisitesManager;
    let cache: PrerequisitesCacheManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        mockCheckPerNodeVersionStatus.mockReset();
        mockGetInstalledNodeVersions.mockReset();
        setupConfigLoader();
        cache = new PrerequisitesCacheManager();
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger, mocks.executor, cache);
    });

    it('reports the tool missing, without asking about versions, when fnm has no Node at all', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue([]);

        const status = await manager.checkPrerequisite(AIO);

        expect(status).toEqual({
            id: 'aio-cli',
            name: 'Adobe I/O CLI',
            description: 'Adobe I/O CLI',
            installed: false,
            optional: false,
            canInstall: true,
        });
        expect(mockCheckPerNodeVersionStatus).not.toHaveBeenCalled();
    });

    it('asks about exactly the majors fnm reports, and hands over a context carrying the logger', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20', '22']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        await manager.checkPrerequisite(AIO);

        expect(mockGetInstalledNodeVersions).toHaveBeenCalledWith(mocks.executor, mocks.logger);
        expect(mockCheckPerNodeVersionStatus).toHaveBeenCalledWith(
            AIO,
            ['20', '22'],
            expect.objectContaining({ logger: mocks.logger }),
        );
    });

    it('caches one result PER MAJOR, keyed by that major, alongside the overall one', async () => {
        const setCached = jest.spyOn(cache, 'setCachedResult');
        mockGetInstalledNodeVersions.mockResolvedValue(['20', '22']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
                { version: 'Node 22', major: '22', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['22'],
        });

        await manager.checkPrerequisite(AIO);

        expect(setCached).toHaveBeenNthCalledWith(1, 'aio-cli', {
            id: 'aio-cli', name: 'Adobe I/O CLI', description: 'Adobe I/O CLI',
            installed: true, optional: false, canInstall: true,
        }, undefined, '20');
        expect(setCached).toHaveBeenNthCalledWith(2, 'aio-cli', {
            id: 'aio-cli', name: 'Adobe I/O CLI', description: 'Adobe I/O CLI',
            installed: false, optional: false, canInstall: true,
        }, undefined, '22');
    });

    it('carries the prerequisite’s optional flag into every per-major cache entry', async () => {
        const setCached = jest.spyOn(cache, 'setCachedResult');
        mockGetInstalledNodeVersions.mockResolvedValue(['20']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 20', major: '20', component: '10.0.0', installed: true }],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        await manager.checkPrerequisite({ ...AIO, optional: true });

        expect(setCached).toHaveBeenNthCalledWith(
            1, 'aio-cli', expect.objectContaining({ optional: true }), undefined, '20',
        );
    });

    it('counts the tool as installed when ANY major has it', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20', '22']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 20', major: '20', component: '', installed: false },
                { version: 'Node 22', major: '22', component: '10.1.0', installed: true },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });

        expect((await manager.checkPrerequisite(AIO)).installed).toBe(true);
    });

    it('counts the tool as missing when NO major has it', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20', '22']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 20', major: '20', component: '', installed: false },
                { version: 'Node 22', major: '22', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20', '22'],
        });

        const status = await manager.checkPrerequisite(AIO);

        expect(status.installed).toBe(false);
        expect(status.version).toBeUndefined();
    });

    it('reports the version of the FIRST major that has the tool', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20', '22']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 20', major: '20', component: '', installed: false },
                { version: 'Node 22', major: '22', component: '10.1.0', installed: true },
                { version: 'Node 24', major: '24', component: '10.2.0', installed: true },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });

        expect((await manager.checkPrerequisite(AIO)).version).toBe('10.1.0');
    });

    it('reports no version when the installed major carries an empty version string', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 20', major: '20', component: '', installed: true }],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        const status = await manager.checkPrerequisite(AIO);

        expect(status.installed).toBe(true);
        expect(status.version).toBeUndefined();
    });

    it('caches the overall result under the prerequisite id and the asked-for Node version', async () => {
        const setCached = jest.spyOn(cache, 'setCachedResult');
        mockGetInstalledNodeVersions.mockResolvedValue(['20']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 20', major: '20', component: '10.0.0', installed: true }],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        const status = await manager.checkPrerequisite(AIO, '20');

        expect(setCached).toHaveBeenLastCalledWith('aio-cli', status, undefined, '20');
    });

    it('checks the tool’s plugins once a major has it', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 20', major: '20', component: '10.0.0', installed: true }],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });
        mocks.executor.execute.mockResolvedValue(createSuccessResult('@adobe/aio-cli-plugin-api-mesh'));
        const withPlugin: PrerequisiteDefinition = {
            ...AIO,
            plugins: [{ id: 'api-mesh', name: 'API Mesh', description: 'Mesh', check: { command: 'aio plugins', contains: 'api-mesh' }, install: { steps: [] } }],
        };

        expect((await manager.checkPrerequisite(withPlugin)).plugins).toEqual([
            { id: 'api-mesh', name: 'API Mesh', installed: true },
        ]);
    });

    it('does not check plugins when no major has the tool', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue([]);
        const withPlugin: PrerequisiteDefinition = {
            ...AIO,
            plugins: [{ id: 'api-mesh', name: 'API Mesh', description: 'Mesh', check: { command: 'aio plugins' }, install: { steps: [] } }],
        };

        const status = await manager.checkPrerequisite(withPlugin);

        expect(status.plugins).toBeUndefined();
        expect(mocks.executor.execute).not.toHaveBeenCalled();
    });

    it('does not check plugins for a tool that declares none', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 20', major: '20', component: '10.0.0', installed: true }],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        expect((await manager.checkPrerequisite(AIO)).plugins).toBeUndefined();
    });

    it('hands over a debug logger whose four levels reach the real logger', async () => {
        mockGetInstalledNodeVersions.mockResolvedValue(['20']);
        mockCheckPerNodeVersionStatus.mockResolvedValue({
            perNodeVersionStatus: [],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        });

        await manager.checkPrerequisite(AIO);

        const handedOver = mockCheckPerNodeVersionStatus.mock.calls[0][2] as {
            debugLogger: { debug: (m: string) => void; info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
        };
        handedOver.debugLogger.debug('d');
        handedOver.debugLogger.info('i');
        handedOver.debugLogger.warn('w');
        handedOver.debugLogger.error('e');

        // Counts, not wording: a debugLogger whose `debug` were bound to `info` would
        // show two info calls and none for debug.
        expect(mocks.logger.info).toHaveBeenCalledTimes(1);
        expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
        expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    });
});
