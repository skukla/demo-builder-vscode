/**
 * Tests for the Data Installer settings read, URL validation and action-URL builder.
 *
 * The module under test deliberately returns REASONS, never messages and never
 * log calls — the same contract as `selectDiscoveryService` in
 * `accsDiscoveryConfig.ts`. So these tests assert outcomes, not logging, and the
 * fingerprint helper is pinned as a pure function.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
    affectsDatapackList,
    dataInstallerEnabled,
    DATA_INSTALLER_MAX_URL_LENGTH,
    actionUrl,
    fingerprintUrl,
    resolveDataInstallerBaseUrl,
    resolveDatapackStoreBaseUrl,
} from '@/features/data-installer/services/dataInstallerConfig';

const STAGE_URL = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

/** Stub `getConfiguration` so both reads in the module see the given values. */
function setupConfig(values: { apiBaseUrl?: unknown }): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string, fallback?: unknown) => {
            if (key === 'apiBaseUrl') {
                return 'apiBaseUrl' in values ? values.apiBaseUrl : fallback;
            }
            return fallback;
        }),
    });
}

describe('dataInstallerConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // The Engine setting was deleted on 2026-11-06 with the service's engine (DI-12): no migration,
    // an old value in settings.json is simply not read.
    it('declares no Engine setting in package.json', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../package.json'), 'utf8')) as {
            contributes: { configuration: Array<{ properties?: Record<string, unknown> }> };
        };
        const declared = pkg.contributes.configuration.flatMap((c) => Object.keys(c.properties ?? {}));
        expect(declared).toContain('demoBuilder.dataInstaller.enabled');
        expect(declared).not.toContain('demoBuilder.dataInstaller.engine');
    });

    describe('resolveDataInstallerBaseUrl', () => {
        it('accepts a valid https URL — positive control, so the rejections below mean something', () => {
            setupConfig({ apiBaseUrl: STAGE_URL });
            expect(resolveDataInstallerBaseUrl()).toEqual({ ok: true, baseUrl: STAGE_URL });
        });

        it('trims surrounding whitespace before validating', () => {
            setupConfig({ apiBaseUrl: `  ${STAGE_URL}  ` });
            expect(resolveDataInstallerBaseUrl()).toEqual({ ok: true, baseUrl: STAGE_URL });
        });

        it('strips a trailing slash so action URLs never double up', () => {
            setupConfig({ apiBaseUrl: `${STAGE_URL}/` });
            expect(resolveDataInstallerBaseUrl()).toEqual({ ok: true, baseUrl: STAGE_URL });
        });

        it('rejects http — this is a remote service, not a local dev server', () => {
            setupConfig({ apiBaseUrl: 'http://example-namespace.adobeioruntime.net/api' });
            expect(resolveDataInstallerBaseUrl()).toMatchObject({
                ok: false,
                reason: 'invalid-url',
            });
        });

        it('rejects a URL longer than the cap', () => {
            setupConfig({
                apiBaseUrl: `https://example.invalid/${'a'.repeat(DATA_INSTALLER_MAX_URL_LENGTH)}`,
            });
            expect(resolveDataInstallerBaseUrl()).toMatchObject({
                ok: false,
                reason: 'invalid-url',
            });
        });

        // The cap is inclusive: a URL exactly at it is still usable. Pinned so the
        // boundary cannot drift by one and start rejecting a legal setting.
        it('accepts a URL exactly at the cap', () => {
            const prefix = 'https://example.invalid/';
            const atCap = prefix + 'a'.repeat(DATA_INSTALLER_MAX_URL_LENGTH - prefix.length);
            expect(atCap).toHaveLength(DATA_INSTALLER_MAX_URL_LENGTH);
            setupConfig({ apiBaseUrl: atCap });

            expect(resolveDataInstallerBaseUrl()).toEqual({ ok: true, baseUrl: atCap });
        });

        it('rejects a value that is not URL-shaped', () => {
            setupConfig({ apiBaseUrl: 'not a url' });
            expect(resolveDataInstallerBaseUrl()).toMatchObject({
                ok: false,
                reason: 'invalid-url',
            });
        });

        it('reports not-configured for an empty setting', () => {
            setupConfig({ apiBaseUrl: '   ' });
            expect(resolveDataInstallerBaseUrl()).toEqual({ ok: false, reason: 'not-configured' });
        });

        it('reports not-configured for a non-string setting', () => {
            setupConfig({ apiBaseUrl: 42 });
            expect(resolveDataInstallerBaseUrl()).toEqual({ ok: false, reason: 'not-configured' });
        });

        it('never returns a message — callers own the wording', () => {
            setupConfig({ apiBaseUrl: 'not a url' });
            const result = resolveDataInstallerBaseUrl();
            // `fingerprint` is diagnostic data, not prose: a caller logs it, and
            // it exists so nobody re-reads the setting just to describe it.
            expect(Object.keys(result).sort()).toEqual(['fingerprint', 'ok', 'reason']);
            expect(result.ok === false && result.fingerprint).not.toContain('not a url');
        });

        it('carries a fingerprint on rejection so the raw value never needs re-reading', () => {
            setupConfig({ apiBaseUrl: 'http://host.example.invalid/p?token=super-secret' });
            const result = resolveDataInstallerBaseUrl();
            expect(result.ok).toBe(false);
            const fp = result.ok === false ? result.fingerprint : undefined;
            expect(fp).toContain('host.example.invalid');
            expect(fp).not.toContain('super-secret');
        });
    });

    describe('actionUrl', () => {
        it('puts the action name in the LAST path segment', () => {
            // Runtime routes on the last segment; a wrong one is a 404.
            expect(actionUrl(STAGE_URL, 'find-datapacks')).toBe(`${STAGE_URL}/find-datapacks`);
        });

        it('does not double the slash when the base already ends in one', () => {
            expect(actionUrl(`${STAGE_URL}/`, 'find-datapacks')).toBe(
                `${STAGE_URL}/find-datapacks`
            );
        });

        it('appends a path parameter after the action, for the status endpoints', () => {
            expect(
                actionUrl(STAGE_URL, 'datapack-process-status', undefined, 'activation-01')
            ).toBe(`${STAGE_URL}/datapack-process-status/activation-01`);
        });

        it('serializes query values and encodes them', () => {
            const url = actionUrl(STAGE_URL, 'find-datapacks', {
                datapack_name: 'citisignal new',
                limit: 100,
                shared: true,
            });
            expect(url).toBe(
                `${STAGE_URL}/find-datapacks?datapack_name=citisignal+new&limit=100&shared=true`
            );
        });

        it('omits undefined, null and empty-string query keys entirely', () => {
            const url = actionUrl(STAGE_URL, 'logs', {
                datapack_name: undefined,
                version: '',
                commerce_instance: null as unknown as undefined,
                limit: 10,
            });
            expect(url).toBe(`${STAGE_URL}/logs?limit=10`);
        });

        it('keeps a false query value, which is meaningful for shared=false', () => {
            expect(actionUrl(STAGE_URL, 'find-datapacks', { shared: false })).toBe(
                `${STAGE_URL}/find-datapacks?shared=false`
            );
        });

        it('emits no query string when every value is omitted', () => {
            expect(actionUrl(STAGE_URL, 'health-check', { limit: undefined })).toBe(
                `${STAGE_URL}/health-check`
            );
        });
    });

    describe('fingerprintUrl', () => {
        const SECRET_URL = 'https://host.example.invalid/path?token=super-secret-value';

        it('never contains the raw value — this is the whole point', () => {
            const fp = fingerprintUrl(SECRET_URL);
            expect(fp).not.toContain(SECRET_URL);
            expect(fp).not.toContain('super-secret-value');
            expect(fp).not.toContain('/path');
        });

        it('reports scheme and host, which are safe and diagnostic', () => {
            expect(fingerprintUrl(SECRET_URL)).toBe('scheme="https", host="host.example.invalid"');
        });

        // Same inclusive boundary as the resolver's cap: at the limit the value is
        // still described, only past it is it reduced to a length.
        it('still reports scheme and host at exactly the length cap', () => {
            expect(fingerprintUrl(SECRET_URL, SECRET_URL.length)).toBe(
                'scheme="https", host="host.example.invalid"'
            );
        });

        it('reports length instead of content when the value is over-long', () => {
            const long = `https://example.invalid/${'a'.repeat(DATA_INSTALLER_MAX_URL_LENGTH)}`;
            const fp = fingerprintUrl(long);
            expect(fp).toContain(`length=${long.length}`);
            expect(fp).not.toContain('aaaa');
        });

        it('reports length and not-URL-shaped for garbage, without echoing it', () => {
            expect(fingerprintUrl('token=abc123')).toBe('length=12 chars, not URL-shaped');
        });
    });
});

describe('dataInstallerConfig, the datapack store', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('resolveDatapackStoreBaseUrl', () => {
        it('reads the library section, not the Data Installer one', () => {
            setupConfig({ apiBaseUrl: `${STAGE_URL}/` });

            expect(resolveDatapackStoreBaseUrl()).toEqual({ ok: true, baseUrl: STAGE_URL });
            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.datapackStore');
        });

        it('applies the same rule as the Data Installer URL: http is refused, empty is not configured', () => {
            setupConfig({ apiBaseUrl: 'http://insecure.example.test' });
            expect(resolveDatapackStoreBaseUrl()).toMatchObject({ ok: false, reason: 'invalid-url' });

            setupConfig({ apiBaseUrl: '  ' });
            expect(resolveDatapackStoreBaseUrl()).toEqual({ ok: false, reason: 'not-configured' });
        });
    });
});

// VS Code's settings screen refuses to save what fails a setting's check, and `format: uri` fails an
// empty box, so a setting whose default is empty could be set and never cleared there (owner,
// 2026-11-05: found clearing the Data Installer's address).
describe('a setting that defaults to empty', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const sections: Array<{ properties?: Record<string, { default?: unknown; format?: string; pattern?: string }> }> =
        [manifest.contributes.configuration].flat();
    const settings = sections.flatMap((section) => Object.entries(section.properties ?? {}));

    it('can be emptied again on the settings screen', () => {
        const unclearable = settings
            .filter(([, setting]) => setting.default === '' && setting.format === 'uri')
            .map(([key]) => key);

        expect(unclearable).toStrictEqual([]);
    });

    it('takes an https address or nothing, for the Data Installer', () => {
        const setting = settings.find(([key]) => key === 'demoBuilder.dataInstaller.apiBaseUrl')?.[1];
        const check = new RegExp(setting?.pattern ?? 'no pattern');

        expect(check.test('')).toBe(true);
        expect(check.test('https://example.test/api')).toBe(true);
        expect(check.test('http://example.test/api')).toBe(false);
    });
});

describe('affectsDatapackList', () => {
    const changing = (changed: string): vscode.ConfigurationChangeEvent => ({
        affectsConfiguration: (section: string) => section === changed,
    });

    it.each([
        'demoBuilder.dataInstaller.apiBaseUrl',
        'demoBuilder.datapackStore.apiBaseUrl',
    ])('follows %s', (setting) => {
        expect(affectsDatapackList(changing(setting))).toBe(true);
    });

    it('ignores a setting the list does not read', () => {
        expect(affectsDatapackList(changing('demoBuilder.dataInstaller.changesOnRemoval'))).toBe(false);
    });
});

// Owner, 2026-11-05: the address is pasted once, and `enabled` turns the Data Installer on and off.
describe('the Data Installer turned off', () => {
    const settings = (values: Record<string, unknown>): void => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback?: unknown) => (key in values ? values[key] : fallback)),
        });
    };
    const ADDRESS = 'https://example.test/api';

    it('is not asked, though its address is kept', () => {
        settings({ apiBaseUrl: ADDRESS, enabled: false });

        expect(resolveDataInstallerBaseUrl()).toEqual({ ok: false, reason: 'turned-off' });
    });

    it('is on when the setting was never touched', () => {
        settings({ apiBaseUrl: ADDRESS });

        expect(dataInstallerEnabled()).toBe(true);
        expect(resolveDataInstallerBaseUrl()).toEqual({ ok: true, baseUrl: ADDRESS });
    });

    it('is a setting the list follows', () => {
        expect(affectsDatapackList({ affectsConfiguration: (section: string) => section === 'demoBuilder.dataInstaller.enabled' })).toBe(true);
    });
});

/**
 * The setting that replaced the save question's "Always" box (step 03, S6; decisions J2-3): its
 * words in the glossary's terms, and nothing about a box that no longer exists.
 */
describe("changesOnRemoval's description", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const setting = (manifest.contributes.configuration as Array<{ properties: Record<string, { description: string; enumDescriptions: string[] }> }>)
        .map((group) => group.properties['demoBuilder.dataInstaller.changesOnRemoval'])
        .find((found) => found !== undefined)!;
    const words = [setting.description, ...setting.enumDescriptions].join(' ');

    it('names the question it answers and says datapack', () => {
        expect(words).toContain('Save Your Changes First?');
        expect(words).toContain('datapack');
    });

    it('says nothing of a box, a pack or a version', () => {
        expect(words).not.toMatch(/Always do this|stop asking|\bpack\b|\bversion\b/u);
    });
});
