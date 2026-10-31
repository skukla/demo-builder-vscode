/**
 * The one place a datapack engine is chosen and built (DI-5): the setting's choice picks the
 * service's engine or Demo Builder's, and Demo Builder's reads a pack's rows from the service's
 * catalog and signs with the project's own Commerce access.
 */

import {
    buildDatapackEngine,
    NO_ACO_CREDENTIAL,
    engineThatInstalled,
    projectAco,
    projectCommerce,
    type DatapackEngineAccess,
} from '@/features/data-installer/services/buildDatapackEngine';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { InstallRecordError, installRecordPath, openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine/demoBuilderEngine.testUtils';
import { nodeActivityFiles, readEngineActivity } from '@/features/data-installer/services/engineActivityLog';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { acoCredentialKey } from '@/features/components/services/acoCredentialStore';

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

describe('buildDatapackEngine activity log', () => {
    // Step 14, item 17: every job Demo Builder's engine finishes is appended beside the project,
    // so the Activity tab and get_datapack_activity can show it after the record is gone.
    it("appends each job Demo Builder's engine finishes to the project's activity log", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-engine-activity-'));
        try {
            const engine = buildDatapackEngine('demo-builder', access({ project: createMockProject({ path: dir }) }), jest.fn());

            // No target: the job stops at once, which is a job that ended all the same.
            await engine.startImport({ id: PACK, commerceInstance: 'unused', dataTypes: ['categories'] });
            let entries = await readEngineActivity(nodeActivityFiles, dir);
            for (let i = 0; i < 100 && entries.length === 0; i += 1) {
                await new Promise((resolve) => setImmediate(resolve));
                entries = await readEngineActivity(nodeActivityFiles, dir);
            }

            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({ pack: PACK, operation: 'import', outcome: 'failed' });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
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

describe('projectAco', () => {
    const ACO_VALUES = {
        ACO_TENANT_ID: 'TenantAbc123',
        ACO_REGION: 'na1',
        ACO_ENVIRONMENT: 'sandbox',
        ACO_CATALOG_VIEW_ID: 'view-1',
        ACO_LOCALE: 'en-US',
    };
    const acoProject = (values: Record<string, string> = ACO_VALUES, addons = ['adobe-commerce-aco']) =>
        createMockProject({ path: '/projects/frescopa', selectedAddons: addons, componentConfigs: { 'adobe-commerce-aco': values } });
    const kept = () => createMockSecretStorage({ [acoCredentialKey('/projects/frescopa')]: JSON.stringify({ clientId: 'c', clientSecret: 'fake-test-pw-not-a-secret' }) });

    it('refuses when the project does not use ACO', async () => {
        await expect(projectAco({ project: acoProject(ACO_VALUES, []), secrets: kept().secrets })()).resolves.toEqual({
            refusal: expect.stringMatching(/does not use Adobe Commerce Optimizer/u),
        });
    });

    it('names the settings still empty', async () => {
        await expect(projectAco({ project: acoProject({ ...ACO_VALUES, ACO_CATALOG_VIEW_ID: '' }), secrets: kept().secrets })()).resolves.toEqual({
            refusal: expect.stringMatching(/set ACO_CATALOG_VIEW_ID in Configure/u),
        });
    });

    it('refuses when Demo Builder holds no credential for the project', async () => {
        await expect(projectAco({ project: acoProject(), secrets: createMockSecretStorage().secrets })()).resolves.toEqual({ refusal: NO_ACO_CREDENTIAL });
        await expect(projectAco({ project: acoProject(), secrets: undefined })()).resolves.toEqual({ refusal: NO_ACO_CREDENTIAL });
    });

    it('answers the settings and a client for the instance asked', async () => {
        const answer = await projectAco({ project: acoProject(), secrets: kept().secrets })();
        if ('refusal' in answer) throw new Error(answer.refusal);
        expect(answer.settings).toEqual({ tenantId: 'TenantAbc123', region: 'na1', environment: 'sandbox', catalogViewId: 'view-1', locale: 'en-US' });
        expect(typeof answer.clientFor(answer.settings).post).toBe('function');
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
