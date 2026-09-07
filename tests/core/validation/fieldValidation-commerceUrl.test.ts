/**
 * Field Validation Tests - Commerce URL
 *
 * Tests for validateCommerceUrlUI, which wraps `optional(url(...))`: a blank
 * value passes because the field is optional, and anything else must both start
 * with an http(s) scheme AND parse as a URL.
 *
 * The cases are DATA — every row below was its own `it` block asserting the
 * same pair of expectations against a different input. Each row still reports
 * as its own named test, so a failure names the URL that broke.
 *
 * EVERY rejection produces the same message, whichever of the two checks
 * failed: the scheme test and the `new URL()` catch arm both return it. That is
 * a property of the validator worth stating once here rather than repeating it
 * sixteen times.
 */

import { validateCommerceUrlUI } from '@/core/validation/fieldValidation';
import { credentialedUrlShape, passwordShape } from '../../helpers/credentialShapes';

const INVALID = 'Invalid URL format. Must start with http:// or https://';

const ACCEPTED: ReadonlyArray<readonly [string, string]> = [
    ['an https URL', 'https://example.com'],
    ['an http URL', 'http://example.com'],
    ['a path', 'https://example.com/store/path'],
    ['query parameters', 'https://example.com?key=value&other=param'],
    ['a port', 'https://example.com:8080'],
    ['the highest port', 'https://example.com:65535'],
    ['a subdomain', 'https://store.example.com'],
    ['a fragment', 'https://example.com/page#section'],
    ['an IPv6 host', 'https://[::1]'],
    // No SSRF protection here on purpose — this is UI shape validation, and the
    // extension legitimately points at local Commerce instances.
    ['localhost', 'https://localhost'],
    ['a loopback address', 'https://127.0.0.1'],
    ['a private IP range', 'https://192.168.1.1'],
    ['a very long path', `https://example.com/${'a'.repeat(1000)}`],
    [
        'many query parameters',
        `https://example.com?${Array.from({ length: 50 }, (_, i) => `k${i}=v${i}`).join('&')}`,
    ],
];

/** The field is optional, so blank input is accepted rather than demanded. */
const BLANK: ReadonlyArray<readonly [string, string]> = [
    ['an empty string', ''],
    ['spaces only', '   '],
    ['tabs only', '\t\t'],
];

const REJECTED: ReadonlyArray<readonly [string, string]> = [
    ['a bare host with no scheme', 'example.com'],
    ['a javascript: scheme', 'javascript:alert(1)'],
    ['a javascript: scheme with void', 'javascript:void(0)'],
    ['a file: scheme', 'file:///etc/passwd'],
    ['an ftp: scheme', 'ftp://example.com'],
    ['a data: scheme', 'data:text/html,<script>alert(1)</script>'],
    ['a mailto: scheme', 'mailto:test@example.com'],
    ['prose rather than a URL', 'not a url'],
    ['a script tag', '<script>alert("xss")</script>'],
    ['a typo in the scheme', 'htps://example.com'],
    ['a single slash after the scheme', 'https:/example.com'],
    ['a missing colon', 'https//example.com'],
    ['a truncated scheme', 'http:/'],
    ['a space before the TLD', 'https://example .com'],
    ['a space inside the host', 'https://exam ple.com'],
    ['no host at all', 'https://'],
];

describe('validateCommerceUrlUI', () => {
    it.each(ACCEPTED)('accepts %s', (_label, value) => {
        expect(validateCommerceUrlUI(value)).toEqual({ isValid: true, message: '' });
    });

    it.each(BLANK)('accepts %s, because the field is optional', (_label, value) => {
        expect(validateCommerceUrlUI(value)).toEqual({ isValid: true, message: '' });
    });

    it.each(REJECTED)('rejects %s', (_label, value) => {
        expect(validateCommerceUrlUI(value)).toEqual({ isValid: false, message: INVALID });
    });

    // Assembled rather than written out: a userinfo URL in test source is the
    // shape a secret scanner matches, and one raised an alert here on
    // 2026-09-03. See tests/helpers/credentialShapes.ts.
    it('accepts a URL carrying credentials in its userinfo', () => {
        const withAuth = credentialedUrlShape('https://example.com', 'user', passwordShape());

        expect(validateCommerceUrlUI(withAuth)).toEqual({ isValid: true, message: '' });
    });

    // This case previously asserted only that a result came back, on the
    // grounds that the behaviour was implementation-specific. It is not:
    // the scheme check passes and `new URL()` DROPS the null byte, so the
    // value is accepted. Pinning it means a change in that behaviour is a
    // failure rather than a silent shift.
    it('accepts a URL containing a null byte, which URL parsing discards', () => {
        const withNullByte = `https://example.com/test${String.fromCharCode(0)}`;

        expect(validateCommerceUrlUI(withNullByte)).toEqual({ isValid: true, message: '' });
    });
});
