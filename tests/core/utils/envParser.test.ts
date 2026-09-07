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

        expect(result).toStrictEqual({});
    });

    describe('which lines it decides to parse', () => {
        it('trims each line before deciding, so an indented comment is still a comment', () => {
            const result = parseEnvFile('  # SECRET=hidden\nKEY=value');

            expect(result).toStrictEqual({ KEY: 'value' });
        });

        it('skips a comment even when it contains an equals sign', () => {
            const result = parseEnvFile('# SECRET=hidden\nKEY=value');

            expect(result).toStrictEqual({ KEY: 'value' });
        });

        it('parses a value that merely ends with a hash', () => {
            const result = parseEnvFile('KEY=value#');

            expect(result).toStrictEqual({ KEY: 'value#' });
        });

        it('skips a line with no equals sign', () => {
            const result = parseEnvFile('NOEQUALS\nKEY=value');

            expect(result).toStrictEqual({ KEY: 'value' });
        });

        it('skips a line whose equals sign is first, since that names no key', () => {
            const result = parseEnvFile('=leadingEquals\nKEY=value');

            expect(result).toStrictEqual({ KEY: 'value' });
        });

        it('trims the key and the value around the equals sign separately', () => {
            const result = parseEnvFile('KEY_A = spaced value ');

            expect(result).toStrictEqual({ KEY_A: 'spaced value' });
        });
    });

    describe('which values it decides to unquote', () => {
        it('leaves a value that only opens with a double quote', () => {
            const result = parseEnvFile('KEY="unterminated');

            expect(result).toStrictEqual({ KEY: '"unterminated' });
        });

        it('leaves a value that only closes with a double quote', () => {
            const result = parseEnvFile('KEY=trailing"');

            expect(result).toStrictEqual({ KEY: 'trailing"' });
        });

        it('leaves a value that only opens with a single quote', () => {
            const result = parseEnvFile("KEY='unterminated");

            expect(result).toStrictEqual({ KEY: "'unterminated" });
        });

        it('leaves a value that only closes with a single quote', () => {
            const result = parseEnvFile("KEY=trailing'");

            expect(result).toStrictEqual({ KEY: "trailing'" });
        });

        it('leaves a value quoted with one of each, since the pair must match', () => {
            const result = parseEnvFile('KEY="mismatched\'');

            expect(result).toStrictEqual({ KEY: '"mismatched\'' });
        });
    });
});
