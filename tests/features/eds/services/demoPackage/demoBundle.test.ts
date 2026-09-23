/**
 * The demo bundle: one root folder, the setup file and the storefront folder
 * with the description file inside, built from an archive made in the test in
 * the shape GitHub serves (one root folder).
 */

import AdmZip from 'adm-zip';
import { buildDemoBundle, defaultBundleName } from '@/features/eds/services/demoPackage/demoBundle';
import type { SharedDemoDescription } from '@/types/projectFile';
import type { SettingsFile } from '@/types/settingsFile';

const DESCRIPTION: SharedDemoDescription = { kind: 'demo', version: 1, name: 'Bodea' };
const SETTINGS = { version: 1, exportedAt: 'x', source: { project: 'bodea' }, includesSecrets: false, selections: {}, configs: {} } as unknown as SettingsFile;

function archive(entries: Record<string, string>, root = 'skukla-kukla-bodea-abc1234/'): Buffer {
    const zip = new AdmZip();
    zip.addFile(root, Buffer.alloc(0));
    for (const [name, content] of Object.entries(entries)) zip.addFile(`${root}${name}`, Buffer.from(content, 'utf-8'));
    return zip.toBuffer();
}

function names(bytes: Buffer): string[] {
    return new AdmZip(bytes).getEntries().filter((e) => !e.isDirectory).map((e) => e.entryName).sort();
}

describe('buildDemoBundle', () => {
    it('puts the setup file and the storefront folder (root stripped, description inside) under one root', () => {
        const out = buildDemoBundle('bodea', {
            settings: SETTINGS,
            storefront: { archive: archive({ 'head.html': '<meta>', 'scripts/scripts.js': 'x' }), description: DESCRIPTION },
        });
        expect(names(out.bytes)).toEqual([
            'bodea-demo-bundle/setup.demo-builder.json',
            'bodea-demo-bundle/storefront/demo.demo-builder.json',
            'bodea-demo-bundle/storefront/head.html',
            'bodea-demo-bundle/storefront/scripts/scripts.js',
        ]);
        expect(JSON.parse(new AdmZip(out.bytes).readAsText('bodea-demo-bundle/storefront/demo.demo-builder.json'))).toEqual(DESCRIPTION);
        expect(out).toMatchObject({ fileCount: 4, parts: ['setup', 'storefront'] });
    });

    it('carries only the ticked parts, and replaces a description file the repository already has', () => {
        const storefrontOnly = buildDemoBundle('bodea', {
            storefront: { archive: archive({ 'demo.demo-builder.json': '{"kind":"demo","version":1,"name":"Old"}', 'head.html': 'x' }), description: DESCRIPTION },
        });
        expect(names(storefrontOnly.bytes)).toEqual(['bodea-demo-bundle/storefront/demo.demo-builder.json', 'bodea-demo-bundle/storefront/head.html']);
        expect(JSON.parse(new AdmZip(storefrontOnly.bytes).readAsText('bodea-demo-bundle/storefront/demo.demo-builder.json')).name).toBe('Bodea');
        expect(storefrontOnly.parts).toEqual(['storefront']);

        const setupOnly = buildDemoBundle('bodea', { settings: SETTINGS });
        expect(names(setupOnly.bytes)).toEqual(['bodea-demo-bundle/setup.demo-builder.json']);
        expect(setupOnly.parts).toEqual(['setup']);
    });

    it('names the file after the project', () => {
        expect(defaultBundleName('bodea')).toBe('bodea-demo-bundle.zip');
    });
});
