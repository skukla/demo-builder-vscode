/**
 * `parseEnvFile` — the shared .env parser.
 *
 * Moved out of `meshStatusResolver.test.ts` on 2026-09-07 (PL-45), where the block
 * was already labelled "(shared utility)". The function is declared in
 * `core/utils/envParser.ts` and nothing about it is mesh-specific, so its six tests
 * were scored against a module they never constrain — and `envParser.ts` had no
 * suite of its own at all.
 */

import { parseEnvFile } from '@/core/utils/envParser';

describe('parseEnvFile (shared utility)', () => {
    it('parses simple key=value pairs', () => {
        const content = 'KEY=value\nANOTHER=test';
        const result = parseEnvFile(content);

        expect(result).toEqual({ KEY: 'value', ANOTHER: 'test' });
    });

    it('skips comments and empty lines', () => {
        const content = '# Comment\nKEY=value\n\n# Another comment\nKEY2=value2';
        const result = parseEnvFile(content);

        expect(result).toEqual({ KEY: 'value', KEY2: 'value2' });
    });

    it('removes double quotes from values', () => {
        const content = 'KEY="quoted value"';
        const result = parseEnvFile(content);

        expect(result).toEqual({ KEY: 'quoted value' });
    });

    it('removes single quotes from values', () => {
        const content = "KEY='quoted value'";
        const result = parseEnvFile(content);

        expect(result).toEqual({ KEY: 'quoted value' });
    });

    it('handles values with equals signs', () => {
        const content = 'URL=https://example.com?foo=bar';
        const result = parseEnvFile(content);

        expect(result).toEqual({ URL: 'https://example.com?foo=bar' });
    });

    it('returns empty object for empty content', () => {
        const result = parseEnvFile('');

        expect(result).toEqual({});
    });
});
