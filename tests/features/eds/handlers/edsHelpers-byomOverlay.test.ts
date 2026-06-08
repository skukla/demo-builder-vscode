/**
 * edsHelpers — BYOM overlay tests
 *
 * The BYOM overlay URL stamps each storefront's `org` and `site` query params
 * onto a base URL drawn from the `demoBuilder.byom.overlayUrl` VS Code
 * setting (or a fallback fromConfig).
 *
 * No shared secret. The shared `render-pdp` action is multi-tenant and serves
 * a generic template, so no per-request auth is needed. See the BYOM design
 * note for the threat-model rationale.
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
                get: jest.fn((_key: string, defaultValue?: unknown) => {
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
    resolveByomOverlayUrl,
} from '@/features/eds/handlers/edsHelpers';
import * as vscode from 'vscode';

describe('resolveByomOverlayUrl', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSettingValue = '';
    });

    it('returns the setting value when non-empty and valid', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';

        const result = resolveByomOverlayUrl();

        expect(result).toBe('https://overlay.example.com/render-pdp');
    });

    it('trims leading and trailing whitespace', () => {
        mockSettingValue = '  https://overlay.example.com/render-pdp  ';

        const result = resolveByomOverlayUrl();

        expect(result).toBe('https://overlay.example.com/render-pdp');
    });

    it('falls back to fromConfig when the setting is empty', () => {
        mockSettingValue = '';

        const result = resolveByomOverlayUrl('https://fallback.example.com/render-pdp');

        expect(result).toBe('https://fallback.example.com/render-pdp');
    });

    it('returns undefined when neither setting nor fromConfig provides a URL', () => {
        mockSettingValue = '';

        const result = resolveByomOverlayUrl();

        expect(result).toBeUndefined();
    });

    it('accepts http://localhost URLs (for local dev)', () => {
        mockSettingValue = 'http://localhost:9080/render-pdp';

        const result = resolveByomOverlayUrl();

        expect(result).toBe('http://localhost:9080/render-pdp');
    });

    it('rejects http:// URLs that are not localhost', () => {
        mockSettingValue = 'http://overlay.example.com/render-pdp';

        const result = resolveByomOverlayUrl('https://fallback.example.com/render-pdp');

        expect(result).toBe('https://fallback.example.com/render-pdp');
        expect(mockWarn).toHaveBeenCalledWith(
            expect.stringContaining('demoBuilder.byom.overlayUrl'),
        );
    });

    it('rejects URLs longer than the safety cap', () => {
        const tooLong = 'https://overlay.example.com/' + 'a'.repeat(2100);
        mockSettingValue = tooLong;

        const result = resolveByomOverlayUrl('https://fallback.example.com/render-pdp');

        expect(result).toBe('https://fallback.example.com/render-pdp');
        expect(mockWarn).toHaveBeenCalled();
    });

    it('rejects unparseable URLs', () => {
        mockSettingValue = 'not a url';

        const result = resolveByomOverlayUrl('https://fallback.example.com/render-pdp');

        expect(result).toBe('https://fallback.example.com/render-pdp');
        expect(mockWarn).toHaveBeenCalled();
    });

    it('returns undefined for non-string values (defensive against corrupted settings.json)', () => {
        mockSettingValue = null;

        expect(resolveByomOverlayUrl()).toBeUndefined();

        mockSettingValue = 42;

        expect(resolveByomOverlayUrl()).toBeUndefined();
    });

    it('reads from the demoBuilder.byom configuration section', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';

        resolveByomOverlayUrl();

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.byom');
    });
});

describe('appendOverlayParams', () => {
    it('appends org and site as query parameters to a URL with no existing query string', () => {
        const result = appendOverlayParams(
            'https://overlay.example.com/render-pdp',
            'adobe-commerce',
            'boilerplate-b2b',
        );

        expect(result).toBe(
            'https://overlay.example.com/render-pdp?org=adobe-commerce&site=boilerplate-b2b',
        );
    });

    it('preserves and extends an existing query string', () => {
        const result = appendOverlayParams(
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
        const result = appendOverlayParams(
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
        const result = appendOverlayParams(
            'https://overlay.example.com/render-pdp',
            'org with spaces',
            'site&with=specials',
        );

        // URLSearchParams encodes space as '+', not '%20', but both forms are valid
        expect(result).toMatch(/org=org(\+|%20)with(\+|%20)spaces/);
        expect(result).toContain('site=site%26with%3Dspecials');
    });

    it('preserves the URL path and fragment when present', () => {
        const result = appendOverlayParams(
            'https://overlay.example.com/api/v1/web/accs-discovery/render-pdp#anchor',
            'adobe-commerce',
            'b2b',
        );

        expect(result).toContain('/api/v1/web/accs-discovery/render-pdp');
        expect(result).toContain('#anchor');
    });

    it('throws when org is empty', () => {
        expect(() =>
            appendOverlayParams('https://overlay.example.com/render-pdp', '', 'b2b'),
        ).toThrow();
    });

    it('throws when site is empty', () => {
        expect(() =>
            appendOverlayParams('https://overlay.example.com/render-pdp', 'adobe-commerce', ''),
        ).toThrow();
    });

    it('throws on malformed URL input', () => {
        expect(() =>
            appendOverlayParams('not-a-url', 'org', 'site'),
        ).toThrow();
    });

    it('returns the same shape regardless of input port or trailing slash', () => {
        const a = appendOverlayParams('https://overlay.example.com/path', 'o', 's');
        const b = appendOverlayParams('https://overlay.example.com/path/', 'o', 's');

        expect(a).toContain('org=o&site=s');
        expect(b).toContain('org=o&site=s');
    });
});

describe('resolveByomOverlayConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSettingValue = '';
    });

    it('returns a fully-stamped URL when the overlay URL is configured', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';

        const result = resolveByomOverlayConfig(undefined, 'adobe-commerce', 'b2b');

        expect(result).toBe('https://overlay.example.com/render-pdp?org=adobe-commerce&site=b2b');
    });

    it('returns undefined when no URL is available (neither setting nor fromConfigUrl)', () => {
        mockSettingValue = '';

        const result = resolveByomOverlayConfig(undefined, 'adobe-commerce', 'b2b');

        expect(result).toBeUndefined();
    });

    it('falls back to fromConfigUrl when the setting is empty', () => {
        mockSettingValue = '';

        const result = resolveByomOverlayConfig('https://fallback.example.com/render-pdp', 'org', 'site');

        expect(result).toBe('https://fallback.example.com/render-pdp?org=org&site=site');
    });

    it('throws if org is empty (propagates from appendOverlayParams)', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';

        expect(() => resolveByomOverlayConfig(undefined, '', 'site')).toThrow();
    });

    it('throws if site is empty (propagates from appendOverlayParams)', () => {
        mockSettingValue = 'https://overlay.example.com/render-pdp';

        expect(() => resolveByomOverlayConfig(undefined, 'org', '')).toThrow();
    });
});
