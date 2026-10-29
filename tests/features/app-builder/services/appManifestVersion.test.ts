/**
 * appManifestVersion — the version an App Management app declares, read from
 * the manifest lib-app generates. A real temp directory, so the path is
 * checked, not assumed.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    APP_MANIFEST_PATH,
    readAppManifestVersion,
} from '@/features/app-builder/services/appManifestVersion';

jest.unmock('fs');
jest.unmock('fs/promises');

describe('readAppManifestVersion', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-manifest-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    const write = (contents: string) => {
        const file = path.join(root, APP_MANIFEST_PATH);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, contents);
    };

    it('reads metadata.version from the generated manifest', async () => {
        write(JSON.stringify({ metadata: { id: 'commerce-erp-integration', version: '0.2.0' } }));

        await expect(readAppManifestVersion(root)).resolves.toBe('0.2.0');
        expect(APP_MANIFEST_PATH).toBe(
            path.join('src', 'commerce-extensibility-1', '.generated', 'app.commerce.manifest.json')
        );
    });

    it.each([
        ['no manifest', undefined],
        ['a manifest that is not JSON', '{not json'],
        ['a manifest without a version', JSON.stringify({ metadata: { id: 'x' } })],
        ['an empty version', JSON.stringify({ metadata: { version: '' } })],
        ['a version that is not a string', JSON.stringify({ metadata: { version: 2 } })],
    ])('answers undefined for %s', async (_label, contents) => {
        if (contents !== undefined) {
            write(contents);
        }
        await expect(readAppManifestVersion(root)).resolves.toBeUndefined();
    });
});
