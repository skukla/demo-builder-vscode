/**
 * edsHelpers — resolveByomOverlayUrl tests
 *
 * The helper resolves the BYOM overlay URL with this precedence:
 *   1. VS Code setting `demoBuilder.byom.overlayUrl` (trimmed, non-empty, valid URL)
 *   2. fromConfig parameter (a fallback usually sourced from demo-packages.json)
 *   3. undefined
 *
 * Invalid setting values are logged and skipped (fall through to fromConfig).
 *
 * Tests written BEFORE implementation (RED phase).
 */

// jest.mock factories are hoisted above any imports / const declarations.
// References inside the factory must be prefixed `mock` (Jest's hoist rule) and
// usually require `var` (hoisted decl) + assignment inside the factory.
/* eslint-disable no-var */
var mockSettingValue: unknown;
var mockWarn: jest.Mock;
/* eslint-enable no-var */

jest.mock('vscode', () => {
    mockSettingValue = '';
    return {
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn((_key: string, defaultValue?: unknown) =>
                    mockSettingValue === undefined ? defaultValue : mockSettingValue,
                ),
            }),
        },
    };
}, { virtual: true });

jest.mock('@/core/logging', () => {
    mockWarn = jest.fn();
    return {
        getLogger: jest.fn().mockReturnValue({
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: mockWarn,
        }),
        initializeLogger: jest.fn(),
    };
});

// Mock service imports required by edsHelpers module
jest.mock('@/features/eds/services/githubTokenService');
jest.mock('@/features/eds/services/githubRepoOperations');
jest.mock('@/features/eds/services/githubFileOperations');
jest.mock('@/features/eds/services/githubOAuthService');
jest.mock('@/features/eds/services/daLiveAuthService');
jest.mock('@/features/eds/handlers/edsDaLiveOrgHandlers', () => ({
    hasWriteAccess: jest.fn(),
}));

import { resolveByomOverlayUrl, appendOverlayCoords } from '@/features/eds/handlers/edsHelpers';
import * as vscode from 'vscode';

describe('resolveByomOverlayUrl', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSettingValue = '';
    });

    describe('VS Code setting takes precedence', () => {
        it('returns the setting value when it is non-empty', () => {
            mockSettingValue = 'https://byom.example.com/render-pdp';

            const result = resolveByomOverlayUrl();

            expect(result).toBe('https://byom.example.com/render-pdp');
        });

        it('returns the setting value when both setting and fromConfig are set (setting wins)', () => {
            mockSettingValue = 'https://setting.example.com/render-pdp';

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://setting.example.com/render-pdp');
        });

        it('reads from the demoBuilder.byom configuration section', () => {
            mockSettingValue = 'https://byom.example.com/render-pdp';

            resolveByomOverlayUrl();

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.byom');
        });
    });

    describe('falls back to fromConfig when the setting is empty', () => {
        it('returns fromConfig when the setting is empty', () => {
            mockSettingValue = '';

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://config.example.com/render-pdp');
        });

        it('returns undefined when both setting and fromConfig are empty', () => {
            mockSettingValue = '';

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
        });

        it('returns undefined when both setting and fromConfig are missing', () => {
            mockSettingValue = '';

            const result = resolveByomOverlayUrl(undefined);

            expect(result).toBeUndefined();
        });
    });

    describe('whitespace handling', () => {
        it('trims leading and trailing whitespace from the setting value', () => {
            mockSettingValue = '  https://byom.example.com/render-pdp  ';

            const result = resolveByomOverlayUrl();

            expect(result).toBe('https://byom.example.com/render-pdp');
        });

        it('treats a whitespace-only setting as empty and falls back to fromConfig', () => {
            mockSettingValue = '   ';

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://config.example.com/render-pdp');
        });

        it('treats a whitespace-only setting as empty and returns undefined when no fallback', () => {
            mockSettingValue = '\t\n  ';

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
        });
    });

    describe('URL validation', () => {
        it('logs a warning and falls back to fromConfig when the setting is not URL-shaped', () => {
            mockSettingValue = 'not-a-url';

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://config.example.com/render-pdp');
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining('demoBuilder.byom.overlayUrl'),
            );
        });

        it('logs a warning and returns undefined when invalid and no fallback exists', () => {
            mockSettingValue = 'not-a-url';

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining('demoBuilder.byom.overlayUrl'),
            );
        });

        it('does not log a warning when the setting is a valid https URL', () => {
            mockSettingValue = 'https://byom.example.com/render-pdp';

            resolveByomOverlayUrl();

            expect(mockWarn).not.toHaveBeenCalled();
        });

        it('accepts http://localhost for local development', () => {
            mockSettingValue = 'http://localhost:9080/render-pdp';

            const result = resolveByomOverlayUrl();

            expect(result).toBe('http://localhost:9080/render-pdp');
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it('accepts http://127.0.0.1 (loopback) for local development', () => {
            mockSettingValue = 'http://127.0.0.1:9080/render-pdp';

            const result = resolveByomOverlayUrl();

            expect(result).toBe('http://127.0.0.1:9080/render-pdp');
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it('accepts http://[::1] (IPv6 loopback) for local development', () => {
            mockSettingValue = 'http://[::1]:9080/render-pdp';

            const result = resolveByomOverlayUrl();

            expect(result).toBe('http://[::1]:9080/render-pdp');
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it('rejects non-loopback http:// URLs', () => {
            mockSettingValue = 'http://example.com/render-pdp';

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://config.example.com/render-pdp');
            expect(mockWarn).toHaveBeenCalledWith(
                expect.stringContaining('demoBuilder.byom.overlayUrl'),
            );
        });

        it('rejects javascript: scheme', () => {
            mockSettingValue = 'javascript:alert(1)';

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
            expect(mockWarn).toHaveBeenCalled();
        });

        it('rejects file: scheme', () => {
            mockSettingValue = 'file:///etc/passwd';

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
            expect(mockWarn).toHaveBeenCalled();
        });

        it('rejects data: scheme', () => {
            mockSettingValue = 'data:text/html,<script>alert(1)</script>';

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
            expect(mockWarn).toHaveBeenCalled();
        });

        it('rejects URLs longer than 2048 characters', () => {
            mockSettingValue = 'https://example.com/' + 'a'.repeat(2048);

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://config.example.com/render-pdp');
            expect(mockWarn).toHaveBeenCalled();
        });

        it('does not include the raw URL value in the warning message (redaction)', () => {
            const sensitive = 'https://byom.example.com/?token=SECRET_TOKEN_VALUE&other=foo';
            // make it invalid so it triggers the warning path
            mockSettingValue = 'ht!tp://invalid';

            resolveByomOverlayUrl();

            const allWarnArgs = mockWarn.mock.calls.flat().join(' ');
            expect(allWarnArgs).not.toContain('SECRET_TOKEN_VALUE');
            expect(allWarnArgs).not.toContain(sensitive);
        });
    });

    describe('non-string setting handling', () => {
        it('returns fromConfig when the setting value is null', () => {
            mockSettingValue = null;

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://config.example.com/render-pdp');
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it('returns fromConfig when the setting value is a number', () => {
            mockSettingValue = 42;

            const result = resolveByomOverlayUrl('https://config.example.com/render-pdp');

            expect(result).toBe('https://config.example.com/render-pdp');
        });

        it('returns undefined when setting is null and no fallback', () => {
            mockSettingValue = null;

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
        });
    });

    describe('return-type contract', () => {
        it('returns string when a value is resolved', () => {
            mockSettingValue = 'https://byom.example.com/render-pdp';

            const result = resolveByomOverlayUrl();

            expect(typeof result).toBe('string');
        });

        it('returns undefined (not empty string) when no value resolves', () => {
            mockSettingValue = '';

            const result = resolveByomOverlayUrl();

            expect(result).toBeUndefined();
        });
    });
});

describe('appendOverlayCoords', () => {
    it('appends org and site as query parameters to a URL with no existing query string', () => {
        const result = appendOverlayCoords(
            'https://overlay.example.com/render-pdp',
            'adobe-commerce',
            'boilerplate-b2b',
        );

        expect(result).toBe('https://overlay.example.com/render-pdp?org=adobe-commerce&site=boilerplate-b2b');
    });

    it('preserves and extends an existing query string', () => {
        const result = appendOverlayCoords(
            'https://overlay.example.com/render-pdp?env=prod',
            'adobe-commerce',
            'boilerplate-b2b',
        );

        expect(result).toMatch(/^https:\/\/overlay\.example\.com\/render-pdp\?/);
        expect(result).toContain('env=prod');
        expect(result).toContain('org=adobe-commerce');
        expect(result).toContain('site=boilerplate-b2b');
    });

    it('overwrites pre-existing org/site query params (idempotent stamping)', () => {
        const result = appendOverlayCoords(
            'https://overlay.example.com/render-pdp?org=old&site=stale',
            'fresh-org',
            'fresh-site',
        );

        expect(result).toContain('org=fresh-org');
        expect(result).toContain('site=fresh-site');
        expect(result).not.toContain('org=old');
        expect(result).not.toContain('site=stale');
    });

    it('URL-encodes special characters in org and site values', () => {
        const result = appendOverlayCoords(
            'https://overlay.example.com/render-pdp',
            'org with spaces',
            'site&with=specials',
        );

        // URLSearchParams encodes space as '+', not '%20', but both forms are valid
        expect(result).toMatch(/org=org(\+|%20)with(\+|%20)spaces/);
        expect(result).toContain('site=site%26with%3Dspecials');
    });

    it('preserves the URL path and fragment when present', () => {
        const result = appendOverlayCoords(
            'https://overlay.example.com/api/v1/web/accs-discovery/render-pdp#anchor',
            'adobe-commerce',
            'b2b',
        );

        expect(result).toContain('/api/v1/web/accs-discovery/render-pdp');
        expect(result).toContain('#anchor');
    });

    it('throws when org is empty', () => {
        expect(() =>
            appendOverlayCoords('https://overlay.example.com/render-pdp', '', 'b2b'),
        ).toThrow();
    });

    it('throws when site is empty', () => {
        expect(() =>
            appendOverlayCoords('https://overlay.example.com/render-pdp', 'adobe-commerce', ''),
        ).toThrow();
    });

    it('throws on malformed URL input', () => {
        expect(() =>
            appendOverlayCoords('not-a-url', 'org', 'site'),
        ).toThrow();
    });

    it('returns the same shape regardless of input port or trailing slash', () => {
        const a = appendOverlayCoords('https://overlay.example.com/path', 'o', 's');
        const b = appendOverlayCoords('https://overlay.example.com/path/', 'o', 's');

        expect(a).toContain('org=o&site=s');
        expect(b).toContain('org=o&site=s');
    });
});
