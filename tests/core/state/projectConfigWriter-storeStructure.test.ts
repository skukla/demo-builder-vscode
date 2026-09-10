/**
 * The discovered store structure must survive a save → reload round trip.
 *
 * It is what turns a store CODE back into the NAME the user picked it by, and it
 * is fetched from Commerce — so if it does not persist, every surface is back to
 * codes on the next window reload and the fetch was for nothing.
 *
 * Both the manifest writer and the loader WHITELIST fields, so a new key on the
 * Project type is silently dropped by EACH unless it is named in both.
 */

import {
    ProjectConfigWriter,
    createTestProject,
    mockLogger,
    resetFsMocks,
    writtenManifest,
} from './projectConfigWriter.testUtils';

const STRUCTURE = {
    websites: [{ id: 2, code: 'citisignal', name: 'CitiSignal' }],
    storeGroups: [
        {
            id: 2,
            code: 'citisignal_store',
            name: 'CitiSignal Store',
            website_id: 2,
            root_category_id: 3,
        },
    ],
    storeViews: [
        {
            id: 3,
            code: 'citisignal_us',
            name: 'CitiSignal US',
            store_group_id: 2,
            website_id: 2,
            is_active: true,
        },
    ],
};

beforeEach(resetFsMocks);

describe('manifest carries commerceStoreStructure', () => {
    it('writes the structure when the project has one', async () => {
        const writer = new ProjectConfigWriter(mockLogger) as unknown as {
            writeManifest(project: unknown): Promise<void>;
        };

        await writer.writeManifest(
            createTestProject({ commerceStoreStructure: STRUCTURE }),
        );

        expect(writtenManifest().commerceStoreStructure).toEqual(STRUCTURE);
    });

    it('omits the key entirely when there is none — control', async () => {
        // Every project predating this. The manifest must not gain a null key.
        const writer = new ProjectConfigWriter(mockLogger) as unknown as {
            writeManifest(project: unknown): Promise<void>;
        };

        await writer.writeManifest(createTestProject());

        expect('commerceStoreStructure' in writtenManifest()).toBe(false);
    });
});
