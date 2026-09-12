/**
 * Reading a project file: v2 passes through, v1 migrates, anything else is
 * refused with a sentence an SC can act on. The migration is READ-SIDE, the
 * shape `projectFileLoader`'s manifest migrations use: the file on disk is
 * never rewritten. Distinct from `projectFileLoader*.test.ts`, which cover the
 * on-disk MANIFEST; this is the EXPORT file.
 */

import { UNATTRIBUTED_PICKS_KEY } from '@/core/state/componentApiPicks';
import { readProjectFile, readSharedDemoDescription } from '@/core/state/projectFileReader';
import { CATALOG_API_KEY, PAAS_ADMIN_PASSWORD } from '@/core/config/envVarKeys';
import { settingsFileV1WithSecrets } from '../../helpers/projectFileFixtures';

describe('readProjectFile', () => {
    it('refuses text that is not JSON, in plain words', () => {
        expect(readProjectFile('{not json')).toEqual({
            ok: false,
            error: expect.stringMatching(/couldn't be read/),
        });
    });

    it('refuses JSON that is neither a project file nor a v1 settings file', () => {
        expect(readProjectFile(JSON.stringify({ hello: 'world' }))).toEqual({
            ok: false,
            error: expect.stringMatching(/Demo Builder project file/),
        });
    });

    it('migrates a v1 settings file to v2: provenance, picks, and never a credential', () => {
        const v1 = settingsFileV1WithSecrets();
        const result = readProjectFile(JSON.stringify(v1));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const file = result.file;
        expect(file.kind).toBe('project');
        expect(file.version).toBe(2);
        expect(file.source).toEqual({
            project: 'bodea',
            extension: '1.0.0-beta.146',
            storefront: { githubRepo: 'someone/bodea-demo', daLiveOrg: 'someone', daLiveSite: 'bodea-demo' },
        });
        expect(file.selectedPackage).toBe('bodea');
        expect(file.selectedStack).toBe('eds-accs');
        // Credentials never travel (D24): stripped on the way in, whatever the v1 stamp said.
        expect(file.configs['adobe-commerce-accs']).not.toHaveProperty(CATALOG_API_KEY);
        expect(file.configs['adobe-commerce-paas']).not.toHaveProperty(PAAS_ADMIN_PASSWORD);
        expect(file.configs['adobe-commerce-accs'].ACCS_WEBSITE_CODE).toBe('bodea');
        // The flat legacy picks fold under the unattributed key; attributed picks stay.
        expect(file.componentApiPicks).toEqual({
            'someone-pricing-app': ['CommerceCloudService'],
            [UNATTRIBUTED_PICKS_KEY]: ['CommerceCloudService'],
        });
        // Fields that were exported and never read do not come along.
        expect(file).not.toHaveProperty('installedBlockLibraries');
        expect(file).not.toHaveProperty('includesSecrets');
        expect(file).not.toHaveProperty('additionalConsoleApis');
        expect(file).not.toHaveProperty('edsConfig');
        expect(result.migratedFrom).toBe(1);
    });

    it('passes a v2 file through and strips a credential that slipped in', () => {
        const v2 = {
            kind: 'project',
            version: 2,
            exportedAt: '2026-09-11T00:00:00.000Z',
            source: { project: 'x', extension: '1.0.0' },
            configs: {
                'adobe-commerce-paas': {
                    [PAAS_ADMIN_PASSWORD]: 'fake-test-pw-not-a-secret',
                    PAAS_URL: 'https://example.invalid',
                },
            },
        };
        const result = readProjectFile(JSON.stringify(v2));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.migratedFrom).toBeUndefined();
        expect(result.file.configs['adobe-commerce-paas']).toEqual({ PAAS_URL: 'https://example.invalid' });
    });

    it('reads a newer version than it knows and says so, rather than refusing', () => {
        const v9 = {
            kind: 'project',
            version: 9,
            exportedAt: 'x',
            source: { project: 'x', extension: 'x' },
            configs: {},
        };
        expect(readProjectFile(JSON.stringify(v9))).toEqual(
            expect.objectContaining({ ok: true, newerThanSupported: true }),
        );
    });
});

describe('readSharedDemoDescription', () => {
    const valid = { kind: 'demo', version: 1, name: 'Isle5 by Jen' };

    it('reads a minimal description with no warnings', () => {
        expect(readSharedDemoDescription(JSON.stringify(valid))).toEqual({
            ok: true,
            description: valid,
            warnings: [],
        });
    });

    it('warns on a field this build does not know, and keeps reading (never refuses)', () => {
        const result = readSharedDemoDescription(JSON.stringify({ ...valid, futureThing: 1 }));
        expect(result).toEqual({
            ok: true,
            description: { ...valid, futureThing: 1 },
            warnings: [expect.stringMatching(/futureThing/)],
        });
    });

    it('warns on a newer version and reads what it understands', () => {
        const result = readSharedDemoDescription(JSON.stringify({ ...valid, version: 9 }));
        expect(result).toEqual(expect.objectContaining({ ok: true, warnings: [expect.stringMatching(/newer/)] }));
    });

    it('refuses text that is not JSON, and JSON that is not a demo description', () => {
        expect(readSharedDemoDescription('{nope')).toEqual({ ok: false, error: expect.stringMatching(/couldn't be read/) });
        expect(readSharedDemoDescription(JSON.stringify({ kind: 'project', version: 2 }))).toEqual({
            ok: false,
            error: expect.stringMatching(/demo description/),
        });
        expect(readSharedDemoDescription(JSON.stringify({ kind: 'demo', version: 1 }))).toEqual({
            ok: false,
            error: expect.stringMatching(/demo description/),
        });
    });
});
