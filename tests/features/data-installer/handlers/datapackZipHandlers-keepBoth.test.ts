/**
 * Keep Both (step-07 F1, P4-Q10): a file whose datapack is already in My Datapacks can be added as a
 * new datapack under a new name, the original left as it is. `load-datapack-zip` takes `saveAs`: the
 * name the SC sees; the library's own name is made from it, so nothing already there is written.
 *
 * The access guard hands back a library client; the store's HTTP is a fetch fake that records each
 * write, asserted by route, pack and version. Files are real, in a temp project.
 */

import * as fs from 'fs';
import {
    contextFor,
    datapackZipHandlers,
    KEEP_BOTH_LIBRARY_ONLY,
    KEEP_BOTH_NAMES_UNREAD,
    mockAccess,
    storeFetch,
    tempProject,
    zipFile,
} from './datapackZipHandlers.testUtils';
import type { DatapackFile } from '@/features/data-installer/services/datapackZip';
import { createMockProject } from '../../../helpers/projectFake';
import { fileLayer, libraryRow } from '../../../helpers/settingsLayerFixtures';

const LIBRARY = 'https://library.example.test/api/v1/web/datapack-store';
const ID = { name: 'justrite', version: 'v1' };
const PACK: DatapackFile = {
    id: ID,
    displayName: 'My Justrite',
    items: [{ dataType: 'categories', records: [{ category: { name: 'Signs' } }] }],
};

const library = { findDatapacks: jest.fn(), getDatapackDetail: jest.fn(), getDataItem: jest.fn() };
const load = datapackZipHandlers['load-datapack-zip'];

let dir: string;
let fetchMock: jest.Mock;

const context = () => contextFor(createMockProject({ path: dir }));
const fileWith = (pack: DatapackFile): string => zipFile(dir, pack);

/** Each write, in order: route, then the pack and version it went to, and the name it shows. */
function writes(): Array<{ route: string; name: string; version: string; displayName?: string }> {
    return fetchMock.mock.calls.map(([url, init]) => {
        const body = JSON.parse(String((init as RequestInit).body)) as {
            datapack_name: string;
            version: string;
            display_name?: string;
        };
        const address = String(url);
        return {
            route: address.slice(address.lastIndexOf('/') + 1),
            name: body.datapack_name,
            version: body.version,
            ...(body.display_name ? { displayName: body.display_name } : {}),
        };
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    dir = tempProject('datapack-keep-both-');
    library.findDatapacks.mockResolvedValue({
        items: [
            libraryRow('justrite', 'v1', { displayName: 'My Justrite', dataTypes: ['categories'] }),
        ],
        count: 1,
    });
    mockAccess.mockResolvedValue({
        ok: true,
        client: library,
        baseUrl: LIBRARY,
        getToken: async () => 'tok',
    });
    fetchMock = storeFetch();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('load-datapack-zip with saveAs (Keep Both)', () => {
    it('adds the file as a new datapack under the new name, never writing the one already there', async () => {
        const result = await load(context(), { path: fileWith(PACK), saveAs: ' My Justrite 2 ' });

        const sent = writes();
        expect(sent.map((w) => w.route)).toEqual(['create-datapack', 'add-data-item']);
        expect(sent[0]).toMatchObject({ displayName: 'My Justrite 2', version: 'v1' });
        expect(sent[0].name).toMatch(/^my-justrite-2-/);
        expect(sent.every((w) => w.name === sent[0].name)).toBe(true);
        expect(sent.some((w) => w.name === 'justrite')).toBe(false);
        expect(result).toMatchObject({
            success: true,
            data: {
                datapackName: sent[0].name,
                version: 'v1',
                displayName: 'My Justrite 2',
                pack: 'created',
                stored: ['categories'],
            },
        });
    });

    it("puts the file's settings layer under the new datapack's name, leaving the original's", async () => {
        const result = await load(context(), {
            path: fileWith({ ...PACK, settingsLayer: fileLayer() }),
            saveAs: 'My Justrite 2',
        });

        const sent = writes();
        const newName = sent[0].name;
        expect(newName).toMatch(/^my-justrite-2-/);
        expect(sent.map((w) => `${w.route} ${w.name}@${w.version}`)).toEqual([
            `create-datapack ${newName}@v1`,
            `add-data-item ${newName}@v1`,
            `create-datapack ${newName}-settings@3`,
            `add-data-item ${newName}-settings@3`,
        ]);
        expect(result).toMatchObject({
            data: {
                settingsLayer: {
                    datapackName: `${newName}-settings`,
                    version: '3',
                    outcome: 'created',
                },
            },
        });
        // Named for the new datapack, as a save names the layer it writes (`layerWords`).
        expect(sent[2].displayName).toBe('My Justrite 2 settings');
        const layerBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body)) as { description?: string };
        expect(layerBody.description).toBe('Store configuration for My Justrite 2, applied after its data when Demo Builder installs it.');
    });

    it('refuses a name the SC already has, whatever its capitals, before anything is written', async () => {
        const result = await load(context(), { path: fileWith(PACK), saveAs: 'my justrite' });

        expect(result).toMatchObject({
            success: false,
            error: 'You already have a datapack named my justrite.',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // Review of F1: a library that cannot be read is never taken to mean the name is free.
    it('refuses, writing nothing, when My Datapacks cannot be read to check the name', async () => {
        library.findDatapacks.mockRejectedValue(new Error('unreachable'));

        const result = await load(context(), { path: fileWith(PACK), saveAs: 'My Justrite 2' });

        expect(result).toMatchObject({ success: false, error: KEEP_BOTH_NAMES_UNREAD });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an empty name, before anything is written', async () => {
        const result = await load(context(), { path: fileWith(PACK), saveAs: '  ' });

        expect(result).toMatchObject({ success: false, error: 'Give it a name.' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses Replace and Keep Both at once, and Keep Both into the Data Installer', async () => {
        const both = await load(context(), {
            path: fileWith(PACK),
            saveAs: 'My Justrite 2',
            update: true,
        });
        const installer = await load(context(), {
            path: fileWith(PACK),
            saveAs: 'My Justrite 2',
            target: 'installer',
            confirmName: 'justrite',
        });

        expect(both).toMatchObject({
            success: false,
            error: 'Choose Replace or Keep Both, not both.',
        });
        expect(installer).toMatchObject({ success: false, error: KEEP_BOTH_LIBRARY_ONLY });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // Live run 5 (2026-11-15): an agent adding a file it already had was told only "update" or
    // "change the version", so the Keep Both the screen offers was not named to it.
    it('answers a datapack already in My Datapacks with both choices, Replace and Keep Both', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 409, text: async () => '{"success":false}' });

        const result = await load(context(), { path: fileWith(PACK) });

        expect(result).toMatchObject({
            success: false,
            error: 'justrite@v1 is already in My Datapacks. Send update to replace the data types this file carries, or saveAs with a new name to keep both.',
        });
    });
});
