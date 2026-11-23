/**
 * Nothing reads or saves a pack's store from the wrong Commerce instance (step-07 D6): when the
 * project's pack is recorded on another instance, the changes read (Uninstall's question), the
 * preview and the save all stop at `openProjectStore`, before Commerce is opened. The record is on
 * disk; the store reads are mocked and asserted never asked.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({
    orgGuard: jest.fn(async () => undefined),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/storeChanges', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/storeChanges'),
    previewChanges: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
        resolveDataInstallerAccess,
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeImportHarness } from './importHandlers.testUtils';
import {
    type InstanceRecordFixture,
    recordOnInstance,
} from '../../../helpers/installRecordFixtures';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { removalChangesHandlers } from '@/features/data-installer/handlers/removalChanges';
import { storeChangesHandlers } from '@/features/data-installer/handlers/storeChangesHandlers';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import {
    nodeRecordFiles,
    writeInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { PACK_NAMES_KEY } from '@/features/data-installer/services/packNames';
import type { Project } from '@/types/base';

const mockedAccess = resolveDataInstallerAccess as jest.MockedFunction<
    typeof resolveDataInstallerAccess
>;
const mockedPreview = previewChanges as jest.MockedFunction<typeof previewChanges>;
const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const NOW_TENANT = 'NowTenant0123456789AB';
const OTHER =
    'Bodea is installed on another Commerce instance. Switch the project back to remove it.';
const ID = { datapackName: 'bodea', version: 'main', source: 'library' };

let dir: string;

beforeEach(() => {
    jest.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-instance-'));
    mockedAccess.mockResolvedValue({
        ok: true,
        baseUrl: BASE,
        getToken: async () => 'tok',
        client: new DataInstallerClient({ baseUrl: BASE, getToken: async () => 'tok' }),
    });
    mockedPreview.mockResolvedValue({ installed: true, kinds: [] });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** The open project, pointed at NOW_TENANT, its pack recorded where `record` says. */
async function contextWith(record: InstanceRecordFixture) {
    await writeInstallRecord(nodeRecordFiles, dir, recordOnInstance(record));
    const project: Partial<Project> = {
        name: 'acme',
        path: dir,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: `https://na1-sandbox.api.commerce.adobe.com/${NOW_TENANT}/graphql`,
                ACCS_WEBSITE_CODE: 'acme',
                ACCS_STORE_VIEW_CODE: 'acme_en',
            },
        },
        datapack: { name: 'bodea', version: 'main', store: 'library' },
    };
    const { context, stores } = makeImportHarness(project);
    await stores.globalState.update(PACK_NAMES_KEY, { bodea: 'Bodea' });
    return context;
}

describe('a pack recorded on another Commerce instance', () => {
    it('the preview stops before Commerce is read', async () => {
        const context = await contextWith({ instance: 'OldTenant0123456789AB' });

        await expect(
            storeChangesHandlers['preview-datapack-changes'](context, ID)
        ).resolves.toMatchObject({
            success: false,
            error: OTHER,
        });
        expect(mockedPreview).not.toHaveBeenCalled();
    });

    it("Uninstall's changes read stops the same way", async () => {
        const context = await contextWith({ instance: 'OldTenant0123456789AB' });

        await expect(
            removalChangesHandlers['get-datapack-removal-changes'](context, ID)
        ).resolves.toMatchObject({
            success: false,
            error: OTHER,
        });
        expect(mockedPreview).not.toHaveBeenCalled();
    });

    it('the save stops before anything is read or written', async () => {
        const context = await contextWith({ instance: 'OldTenant0123456789AB' });

        await expect(
            storeChangesHandlers['save-store-changes-to-pack'](context, { ...ID, confirm: true })
        ).resolves.toMatchObject({ success: false, error: OTHER });
    });
});

describe('CONTROL: a pack recorded on this instance, or before instances were kept', () => {
    it.each([
        ['this instance', { instance: NOW_TENANT }],
        ['no instance (rule 3)', {}],
    ])('%s: the preview reads the store', async (_label, record: InstanceRecordFixture) => {
        const context = await contextWith(record);

        await expect(
            storeChangesHandlers['preview-datapack-changes'](context, ID)
        ).resolves.toMatchObject({
            success: true,
        });
        expect(mockedPreview).toHaveBeenCalledTimes(1);
    });
});
