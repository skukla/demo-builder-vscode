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
var mockSettingValue: unknown;       // value for `overlayUrl` (and any other key)
var mockSecretValue: unknown;        // value for `overlaySharedSecret`
var mockWarn: jest.Mock;
/* eslint-enable no-var */

jest.mock('vscode', () => {
    mockSettingValue = '';
    mockSecretValue = '';
    return {
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn((key: string, defaultValue?: unknown) => {
                    if (key === 'overlaySharedSecret') {
                        return mockSecretValue === undefined ? defaultValue : mockSecretValue;
                    }
                    return mockSettingValue === undefined ? defaultValue : mockSettingValue;
                }),
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

import {
    appendOverlayParams,
    resolveByomOverlayConfig,
    resolveByomOverlaySharedSecret,
    resolveByomOverlayUrl,
} from '@/features/eds/handlers/edsHelpers';
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

describe('appendOverlayParams', () => {
    const SECRET = 'a1b2c3d4e5f6';

    it('appends org, site, and key as query parameters to a URL with no existing query string', () => {
        const result = appendOverlayParams(
            'https://overlay.example.com/render-pdp',
            'adobe-commerce',
            'boilerplate-b2b',
            SECRET,
        );

        expect(result).toBe(
            `https://overlay.example.com/render-pdp?org=adobe-commerce&site=boilerplate-b2b&key=${SECRET}`,
        );
    });

    it('preserves and extends an existing query string', () => {
        const result = appendOverlayParams(
            'https://overlay.example.com/render-pdp?env=prod',
            'adobe-commerce',
            'boilerplate-b2b',
            SECRET,
        );

        expect(result).toMatch(/^https:\/\/overlay\.example\.com\/render-pdp\?/);
        expect(result).toContain('env=prod');
        expect(result).toContain('org=adobe-commerce');
        expect(result).toContain('site=boilerplate-b2b');
        expect(result).toContain(`key=${SECRET}`);
    });

    it('overwrites pre-existing org/site/key query params (idempotent stamping)', () => {
        const result = appendOverlayParams(
            'https://overlay.example.com/render-pdp?org=old&site=stale&key=old-secret',
            'fresh-org',
            'fresh-site',
            'fresh-secret',
        );

        expect(result).toContain('org=fresh-org');
        expect(result).toContain('site=fresh-site');
        expect(result).toContain('key=fresh-secret');
        expect(result).not.toContain('org=old');
        expect(result).not.toContain('site=stale');
        expect(result).not.toContain('key=old-secret');
    });

    it('URL-encodes special characters in org, site, and key values', () => {
        const result = appendOverlayParams(
            'https://overlay.example.com/render-pdp',
            'org with spaces',
            'site&with=specials',
            'key+with/special=chars',
        );

        // URLSearchParams encodes space as '+', not '%20', but both forms are valid
        expect(result).toMatch(/org=org(\+|%20)with(\+|%20)spaces/);
        expect(result).toContain('site=site%26with%3Dspecials');
        expect(result).toContain('key=key%2Bwith%2Fspecial%3Dchars');
    });

    it('preserves the URL path and fragment when present', () => {
        const result = appendOverlayParams(
            'https://overlay.example.com/api/v1/web/accs-discovery/render-pdp#anchor',
            'adobe-commerce',
            'b2b',
            SECRET,
        );

        expect(result).toContain('/api/v1/web/accs-discovery/render-pdp');
        expect(result).toContain('#anchor');
    });

    it('throws when org is empty', () => {
        expect(() =>
            appendOverlayParams('https://overlay.example.com/render-pdp', '', 'b2b', SECRET),
        ).toThrow();
    });

    it('throws when site is empty', () => {
        expect(() =>
            appendOverlayParams('https://overlay.example.com/render-pdp', 'adobe-commerce', '', SECRET),
        ).toThrow();
    });

    it('throws when key is empty', () => {
        expect(() =>
            appendOverlayParams('https://overlay.example.com/render-pdp', 'adobe-commerce', 'b2b', ''),
        ).toThrow();
    });

    it('throws on malformed URL input', () => {
        expect(() =>
            appendOverlayParams('not-a-url', 'org', 'site', SECRET),
        ).toThrow();
    });

    it('returns the same shape regardless of input port or trailing slash', () => {
        const a = appendOverlayParams('https://overlay.example.com/path', 'o', 's', SECRET);
        const b = appendOverlayParams('https://overlay.example.com/path/', 'o', 's', SECRET);

        expect(a).toContain(`org=o&site=s&key=${SECRET}`);
        expect(b).toContain(`org=o&site=s&key=${SECRET}`);
    });
});

describe('resolveByomOverlaySharedSecret', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSecretValue = '';
    });

    it('returns the trimmed secret when configured', () => {
        mockSecretValue = 'sample-secret-value-not-real';

        const result = resolveByomOverlaySharedSecret();

        expect(result).toBe('sample-secret-value-not-real');
    });

    it('trims leading and trailing whitespace', () => {
        mockSecretValue = '  abc123  ';

        const result = resolveByomOverlaySharedSecret();

        expect(result).toBe('abc123');
    });

    it('returns undefined when the secret is empty', () => {
        mockSecretValue = '';

        const result = resolveByomOverlaySharedSecret();

        expect(result).toBeUndefined();
    });

    it('returns undefined for whitespace-only values', () => {
        mockSecretValue = '   \t\n  ';

        const result = resolveByomOverlaySharedSecret();

        expect(result).toBeUndefined();
    });

    it('returns undefined for non-string values (defensive against corrupted settings.json)', () => {
        mockSecretValue = null;

        expect(resolveByomOverlaySharedSecret()).toBeUndefined();

        mockSecretValue = 42;

        expect(resolveByomOverlaySharedSecret()).toBeUndefined();
    });

    it('reads from the demoBuilder.byom configuration section', () => {
        mockSecretValue = 'a-secret';

        resolveByomOverlaySharedSecret();

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.byom');
    });
});

describe('resolveByomOverlayConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSettingValue = '';
        mockSecretValue = '';
    });

    it('returns a fully-stamped URL when both URL and secret are configured', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';
        mockSecretValue = 'secret-value';

        const result = resolveByomOverlayConfig(undefined, 'adobe-commerce', 'b2b');

        expect(result).toBe('https://overlay.example.com/render-pdp?org=adobe-commerce&site=b2b&key=secret-value');
    });

    it('returns undefined when the URL is not configured (neither setting nor fromConfigUrl)', () => {
        mockSettingValue = '';
        mockSecretValue = 'secret-value';

        const result = resolveByomOverlayConfig(undefined, 'adobe-commerce', 'b2b');

        expect(result).toBeUndefined();
    });

    it('falls back to fromConfigUrl when the setting is empty', () => {
        mockSettingValue = '';
        mockSecretValue = 'secret-value';

        const result = resolveByomOverlayConfig('https://fallback.example.com/render-pdp', 'org', 'site');

        expect(result).toBe('https://fallback.example.com/render-pdp?org=org&site=site&key=secret-value');
    });

    it('returns undefined and warns when the URL is configured but the secret is not', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';
        mockSecretValue = '';

        const result = resolveByomOverlayConfig(undefined, 'org', 'site');

        expect(result).toBeUndefined();
        expect(mockWarn).toHaveBeenCalledWith(
            expect.stringContaining('overlaySharedSecret'),
        );
    });

    it('does not warn when the URL is also missing (silently returns undefined)', () => {
        mockSettingValue = '';
        mockSecretValue = '';

        resolveByomOverlayConfig(undefined, 'org', 'site');

        expect(mockWarn).not.toHaveBeenCalled();
    });

    it('throws if org is empty (propagates from appendOverlayParams)', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';
        mockSecretValue = 'secret-value';

        expect(() => resolveByomOverlayConfig(undefined, '', 'site')).toThrow();
    });

    it('throws if site is empty (propagates from appendOverlayParams)', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';
        mockSecretValue = 'secret-value';

        expect(() => resolveByomOverlayConfig(undefined, 'org', '')).toThrow();
    });
});
