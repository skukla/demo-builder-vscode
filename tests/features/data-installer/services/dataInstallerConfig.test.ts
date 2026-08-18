/**
 * Tests for the Data Installer settings read, URL validation and action-URL builder.
 *
 * The module under test deliberately returns REASONS, never messages and never
 * log calls — the same contract as `selectDiscoveryService` in
 * `accsDiscoveryConfig.ts`. So these tests assert outcomes, not logging, and the
 * fingerprint helper is pinned as a pure function.
 */

import * as vscode from 'vscode';

import {
    DATA_INSTALLER_MAX_URL_LENGTH,
    actionUrl,
    fingerprintUrl,
    isDataInstallerConfigured,
    isDataInstallerEnabled,
    resolveDataInstallerBaseUrl,
} from '@/features/data-installer/services/dataInstallerConfig';

const STAGE_URL = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

/** Stub `getConfiguration` so both reads in the module see the given values. */
function setupConfig(values: { apiBaseUrl?: unknown; enabled?: unknown }): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string, fallback?: unknown) => {
            if (key === 'apiBaseUrl') {
                return 'apiBaseUrl' in values ? values.apiBaseUrl : fallback;
            }
            if (key === 'enabled') {
                return 'enabled' in values ? values.enabled : fallback;
            }
            return fallback;
        }),
    });
}

describe('dataInstallerConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('isDataInstallerEnabled', () => {
        it('defaults to enabled when the setting is absent', () => {
            setupConfig({});
            expect(isDataInstallerEnabled()).toBe(true);
        });

        it('is disabled when the setting is false', () => {
            setupConfig({ enabled: false });
            expect(isDataInstallerEnabled()).toBe(false);
        });

        it('treats a non-boolean setting as enabled rather than crashing', () => {
            // Corrupted settings.json — VS Code's typed get can hand back anything.
            setupConfig({ enabled: 'yes' });
            expect(isDataInstallerEnabled()).toBe(true);
        });
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
            expect(resolveDataInstallerBaseUrl()).toMatchObject({ ok: false, reason: 'invalid-url' });
        });

        it('rejects a URL longer than the cap', () => {
            setupConfig({ apiBaseUrl: `https://example.invalid/${'a'.repeat(DATA_INSTALLER_MAX_URL_LENGTH)}` });
            expect(resolveDataInstallerBaseUrl()).toMatchObject({ ok: false, reason: 'invalid-url' });
        });

        it('rejects a value that is not URL-shaped', () => {
            setupConfig({ apiBaseUrl: 'not a url' });
            expect(resolveDataInstallerBaseUrl()).toMatchObject({ ok: false, reason: 'invalid-url' });
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
            expect(actionUrl(`${STAGE_URL}/`, 'find-datapacks')).toBe(`${STAGE_URL}/find-datapacks`);
        });

        it('appends a path parameter after the action, for the status endpoints', () => {
            expect(actionUrl(STAGE_URL, 'datapack-process-status', undefined, 'activation-01')).toBe(
                `${STAGE_URL}/datapack-process-status/activation-01`,
            );
        });

        it('serializes query values and encodes them', () => {
            const url = actionUrl(STAGE_URL, 'find-datapacks', {
                datapack_name: 'citisignal new',
                limit: 100,
                shared: true,
            });
            expect(url).toBe(
                `${STAGE_URL}/find-datapacks?datapack_name=citisignal+new&limit=100&shared=true`,
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
                `${STAGE_URL}/find-datapacks?shared=false`,
            );
        });

        it('emits no query string when every value is omitted', () => {
            expect(actionUrl(STAGE_URL, 'health-check', { limit: undefined })).toBe(
                `${STAGE_URL}/health-check`,
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

/**
 * The OFFER question, as opposed to the SERVE question `resolveDataInstallerAccess`
 * answers. Both halves have to hold: the dashboard tile used to render on
 * neither, so a user with no API URL got an invitation to a surface that
 * refused them.
 */
describe('isDataInstallerConfigured', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('is true when enabled and pointed at a usable URL', () => {
        setupConfig({ enabled: true, apiBaseUrl: STAGE_URL });

        expect(isDataInstallerConfigured()).toBe(true);
    });

    it('is false when switched off, even with a good URL', () => {
        setupConfig({ enabled: false, apiBaseUrl: STAGE_URL });

        expect(isDataInstallerConfigured()).toBe(false);
    });

    it('is false when enabled but no URL is configured', () => {
        // The shipped default: `enabled` true, `apiBaseUrl` empty. This is the
        // exact combination every beta user has until they set one, and the
        // combination the ungated tile was wrong about.
        setupConfig({ enabled: true, apiBaseUrl: '' });

        expect(isDataInstallerConfigured()).toBe(false);
    });

    it('is false when the configured URL is not usable', () => {
        setupConfig({ enabled: true, apiBaseUrl: 'http://insecure.example.com' });

        expect(isDataInstallerConfigured()).toBe(false);
    });
});
