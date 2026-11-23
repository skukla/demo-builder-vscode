/**
 * build-datapack-from-export — through the panel's one handler map, with real files in a temp
 * project: the export read from inside the project, the pack written there, nothing sent anywhere.
 * The export is Luma's own, trimmed (tests/fixtures/data-installer/commerce-product-export-luma.csv).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { readDatapackZip } from '@/features/data-installer/services/datapackZip';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const FIXTURE = path.join(__dirname, '../../../fixtures/data-installer/commerce-product-export-luma.csv');
const build = importHandlers['build-datapack-from-export'];

let dir: string;

function context() {
    const ctx = createMockHandlerContext();
    (ctx.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(createMockProject({ path: dir }));
    return ctx;
}

const PAYLOAD = { exportPath: 'exports/products.csv', path: 'datapacks', datapackName: 'luma-from-export', version: 'main', displayName: 'Luma' };

beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'export-pack-')));
    fs.mkdirSync(path.join(dir, 'exports'));
    fs.copyFileSync(FIXTURE, path.join(dir, 'exports/products.csv'));
});

it('writes the pack inside the project and says what it holds and what it left out', async () => {
    const result = await build(context(), PAYLOAD);

    const written = path.join(dir, 'datapacks', 'luma-from-export-main.datapack.zip');
    expect(result).toMatchObject({
        success: true,
        data: { path: written, products: 6, giftCards: 1, dataTypes: ['categories', 'products', 'giftcards', 'source_items', 'stock_source_links'] },
    });
    expect((result.data as { leftOutAttributes: string[] }).leftOutAttributes).toContain('color');
    expect(readDatapackZip(fs.readFileSync(written)).id).toEqual({ name: 'luma-from-export', version: 'main' });
});

it('refuses a missing field, a name no store would take, and a path outside the project, writing nothing', async () => {
    const missing = await build(context(), { ...PAYLOAD, displayName: '' });
    const badName = await build(context(), { ...PAYLOAD, datapackName: 'luma from export' });
    const outside = await build(context(), { ...PAYLOAD, exportPath: '../elsewhere.csv' });

    expect(missing).toMatchObject({ success: false, error: expect.stringContaining('displayName') });
    expect(badName).toMatchObject({ success: false, error: expect.stringContaining('cannot be a datapack name') });
    expect(outside).toMatchObject({ success: false, error: expect.stringContaining('not in the open project') });
    expect(fs.existsSync(path.join(dir, 'datapacks'))).toBe(false);
});

it('writes to the project folder when no path is given, as the other file-writing tools do', async () => {
    const { path: _given, ...noPath } = PAYLOAD;

    const result = await build(context(), noPath);

    expect(result).toMatchObject({ success: true, data: { path: path.join(dir, 'luma-from-export-main.datapack.zip') } });
});

it('says a file that is not a product export is not one', async () => {
    fs.writeFileSync(path.join(dir, 'exports/products.csv'), 'email,firstname\na@b.c,A\n');

    const result = await build(context(), PAYLOAD);

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('no sku column') });
});
