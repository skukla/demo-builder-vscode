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

import * as fs from 'fs/promises';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../helpers/loggerFake';

jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

const mockLogger = createMockLogger();

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

function createTestProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/test/path',
        created: new Date('2026-01-01T00:00:00Z'),
        componentSelections: {},
        componentInstances: [],
        componentConfigs: {},
        componentVersions: {},
        ...overrides,
    } as Project;
}

/** The JSON the writer actually handed to disk. */
function writtenManifest(): Record<string, unknown> {
    const call = mockFs.writeFile.mock.calls.at(-1);
    return JSON.parse(String(call?.[1]));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
});

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
