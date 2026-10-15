/**
 * The store-change marker survives a window restart (EDS-44).
 *
 * `edsStorefrontState.catalogPagesPending` says the storefront's product and category
 * pages are still the previous store's. An SC who answers "Later" and reloads the
 * window must still get them rebuilt by the next Republish, so the marker has to make
 * the save → reload round trip through the REAL writer and loader, both of which list
 * the fields they carry.
 */

import * as fs from 'fs/promises';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockProject } from '../../helpers/projectFake';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;
const PROJECT_PATH = '/tmp/store-change-demo';

it('round-trips catalogPagesPending through the real writer and loader', async () => {
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    const state = {
        envVars: { ACCS_WEBSITE_CODE: 'citisignal' },
        lastPublished: '2026-10-15T00:00:00.000Z',
        catalogPagesPending: {
            fromWebsiteCode: 'base',
            fromStoreCode: 'main_website_store',
            fromStoreViewCode: 'default',
        },
    };
    const project = createMockProject({
        name: 'store-change',
        path: PROJECT_PATH,
        created: new Date('2026-10-01T00:00:00Z'),
        componentSelections: {},
        componentInstances: {},
        componentConfigs: {},
        componentVersions: {},
        edsStorefrontState: state,
        edsStorefrontStatusSummary: 'stale',
    });

    await new ProjectConfigWriter(createMockLogger()).saveProjectConfig(project, PROJECT_PATH);
    const manifestWrite = mockedFs.writeFile.mock.calls.find((call) => call[0].toString().endsWith('.tmp'));
    expect(manifestWrite).toBeDefined();
    mockedFs.readFile.mockResolvedValue(manifestWrite![1] as string);
    mockedFs.readdir.mockRejectedValue(new Error('no components dir'));

    const reloaded = await new ProjectFileLoader(createMockLogger()).loadProject(PROJECT_PATH, () => []);

    expect(reloaded!.edsStorefrontState).toEqual(state);
    expect(reloaded!.edsStorefrontStatusSummary).toBe('stale');
});
