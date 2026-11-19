/**
 * preservedFiles — what a template sync keeps from the SC's repository. A folder is kept whole (an
 * installed block library's `blocks/<id>`, owner walk 2026-11-19), and every file comes back byte
 * for byte, an image included.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { backupPreservedFiles, restorePreservedFiles } from '@/features/updates/services/preservedFiles';
import { createMockLogger } from '../../../helpers/loggerFake';

let dir = '';

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preserved-'));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('a preserved folder', () => {
    it('is backed up whole and written back byte for byte', async () => {
        const icon = Buffer.from([0xff, 0x00, 0xfe, 0x89]);
        fs.mkdirSync(path.join(dir, 'blocks/catalog-menu/icons'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'blocks/catalog-menu/catalog-menu.js'), 'menu\n');
        fs.writeFileSync(path.join(dir, 'blocks/catalog-menu/icons/arrow.png'), icon);
        fs.writeFileSync(path.join(dir, 'fstab.yaml'), 'mountpoints: {}\n');
        const logger = createMockLogger();

        const backups = await backupPreservedFiles(dir, ['fstab.yaml', 'blocks/catalog-menu', 'missing.json'], logger);
        fs.rmSync(path.join(dir, 'blocks'), { recursive: true });
        await restorePreservedFiles(dir, backups, logger);

        expect([...backups.keys()].sort()).toEqual([
            'blocks/catalog-menu/catalog-menu.js',
            'blocks/catalog-menu/icons/arrow.png',
            'fstab.yaml',
        ]);
        expect(fs.readFileSync(path.join(dir, 'blocks/catalog-menu/icons/arrow.png')).equals(icon)).toBe(true);
        expect(fs.readFileSync(path.join(dir, 'blocks/catalog-menu/catalog-menu.js'), 'utf8')).toBe('menu\n');
    });
});
