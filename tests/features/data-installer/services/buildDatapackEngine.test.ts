/**
 * The one place a datapack engine is chosen and built (DI-5): the setting's choice picks the
 * service's engine or Demo Builder's, and Demo Builder's reads a pack's rows from the service's
 * catalog and signs with the project's own Commerce access.
 */

import {
    buildDatapackEngine,
    engineThatInstalled,
    projectCommerce,
    type DatapackEngineAccess,
} from '@/features/data-installer/services/buildDatapackEngine';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { InstallRecordError, installRecordPath, openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine/demoBuilderEngine.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

const mockCommerceClientForProject = jest.fn();
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    commerceClientForProject: (...a: unknown[]) => mockCommerceClientForProject(...a),
}));

function access(overrides: Partial<DatapackEngineAccess> = {}): DatapackEngineAccess {
    return {
        baseUrl: 'https://installer.test/api',
        getToken: async () => 'tok',
        jobs: { getJobStatus: jest.fn(), getJobFailureReason: jest.fn() },
        catalog: { getDatapackDetail: jest.fn(), getDataItem: jest.fn() },
        project: createMockProject({ path: '/projects/frescopa' }),
        authManager: undefined,
        secrets: undefined,
        ...overrides,
    };
}

describe('buildDatapackEngine', () => {
    it('builds the service\'s engine when the service is chosen', () => {
        expect(buildDatapackEngine('service', access(), jest.fn()).id).toBe('service');
    });

    it('builds Demo Builder\'s engine when it is chosen', () => {
        expect(buildDatapackEngine('demo-builder', access(), jest.fn()).id).toBe('demo-builder');
    });

    it('says the store cannot be written without an Adobe sign-in, rather than trying', async () => {
        const engine = buildDatapackEngine('demo-builder', access(), jest.fn());

        await expect(
            engine.checkCredentials({
                id: { name: 'frescopa', version: 'main' },
                commerceInstance: 'unused',
                dataTypes: ['categories'],
            }),
        ).resolves.toEqual({ usable: false, reason: "Adobe sign-in is required to write to this project's store." });
    });
});

describe('projectCommerce', () => {
    // A pack lands on the website and store view the install names, which need not be the
    // project's own. Writing through the project's store view put a reinstall's price change on
    // JustRite's store view while the test website kept the old one (live, 2026-10-29). The
    // service writes store-wide too (catalog spec §0).
    it("writes store-wide, never through the project's own store view", async () => {
        mockCommerceClientForProject.mockResolvedValue({ get: jest.fn(), send: jest.fn() });
        const project = createMockProject({ path: '/projects/frescopa' });
        const authManager = {} as AuthenticationService;

        await projectCommerce({ project, authManager, secrets: undefined })();

        expect(mockCommerceClientForProject).toHaveBeenCalledWith(project, authManager, undefined, undefined, 'all');
    });
});

describe('engineThatInstalled', () => {
    it('is Demo Builder\'s when its install record is beside the project', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).record({ kind: 'categories', id: '40' });

        await expect(engineThatInstalled(PROJECT, PACK, files)).resolves.toBe('demo-builder');
    });

    it('is the service\'s when there is no record', async () => {
        await expect(engineThatInstalled(PROJECT, PACK, memoryFiles())).resolves.toBe('service');
    });

    it('refuses to guess when a record is there but cannot be read', async () => {
        const files = memoryFiles({ [installRecordPath(PROJECT, PACK)]: 'not json' });

        await expect(engineThatInstalled(PROJECT, PACK, files)).rejects.toThrow(InstallRecordError);
    });
});
