/**
 * envVarExtraction — the parsing decisions
 *
 * Split from `envVarExtraction.test.ts`, which covers the shapes a well-formed
 * .env file takes. This suite covers the lines where the parser has to CHOOSE:
 * what counts as a comment, where a key starts, and when a quote is a wrapper
 * rather than a character in the value.
 *
 * Everything here goes through `extractEnvVars`; `extractEnvVarsSync` reads the
 * file differently and then runs the same parser, so proving these twice would
 * prove nothing twice.
 */

import {
    ENV_PATH,
    parseEnv,
    parseEnvSync,
    readFileMock,
    readFileSyncMock,
} from './envVarExtraction.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('reading the file', () => {
    // A .env holds URLs, passwords and, in demo projects, non-ASCII sample
    // data. Decoded as anything but utf8 those come back mangled.
    it('reads the file as utf8', async () => {
        await parseEnv('KEY=value');

        expect(readFileMock).toHaveBeenCalledWith(ENV_PATH, 'utf8');
    });

    it('reads the file as utf8 synchronously too', () => {
        parseEnvSync('KEY=value');

        expect(readFileSyncMock).toHaveBeenCalledWith(ENV_PATH, 'utf8');
    });
});

describe('what counts as a comment', () => {
    // The `#` has to be the FIRST character, and a comment stays a comment even
    // when it carries an `=` — which the commented-out settings people leave in
    // a .env almost always do.
    it('ignores a commented-out setting', async () => {
        const result = await parseEnv(['# DB_PORT=3306', 'DB_PORT=5432'].join('\n'));

        expect(result).toStrictEqual({ DB_PORT: '5432' });
    });

    it('ignores a commented-out setting that is indented', async () => {
        const result = await parseEnv(['    # DB_PORT=3306', 'DB_PORT=5432'].join('\n'));

        expect(result).toStrictEqual({ DB_PORT: '5432' });
    });

    // A `#` anywhere else is data — a URL fragment, a password character.
    it('keeps a hash that is not the first character', async () => {
        const result = await parseEnv(
            ['ANCHOR=https://example.com/docs#install', 'PASSWORD=p#ssword'].join('\n')
        );

        expect(result).toStrictEqual({
            ANCHOR: 'https://example.com/docs#install',
            PASSWORD: 'p#ssword',
        });
    });
});

describe('where a key starts', () => {
    // A line whose first character is `=` has no key. Reading one out of the
    // middle of it invents a variable the file never declared.
    it('yields nothing for a line that starts with an equals sign', async () => {
        const result = await parseEnv(['=LEADING_EQUALS=value', 'REAL_KEY=value'].join('\n'));

        expect(result).toStrictEqual({ REAL_KEY: 'value' });
    });

    it('yields nothing for a line with no equals sign at all', async () => {
        const result = await parseEnv(['MALFORMED LINE', 'REAL_KEY=value'].join('\n'));

        expect(result).toStrictEqual({ REAL_KEY: 'value' });
    });

    it('trims the space around both halves', async () => {
        const result = await parseEnv('   SPACED_KEY   =   spaced value   ');

        expect(result).toStrictEqual({ SPACED_KEY: 'spaced value' });
    });
});

describe('when a quote is a wrapper', () => {
    it('unwraps a value quoted at both ends', async () => {
        const result = await parseEnv(['DOUBLE="wrapped"', "SINGLE='wrapped'"].join('\n'));

        expect(result).toStrictEqual({ DOUBLE: 'wrapped', SINGLE: 'wrapped' });
    });

    // Only a MATCHING pair is a wrapper. A lone quote at one end is a character
    // in the value — dropping it would silently rewrite a password or a regex.
    it('keeps a double quote that opens but never closes', async () => {
        const result = await parseEnv('OPENING="unterminated');

        expect(result).toStrictEqual({ OPENING: '"unterminated' });
    });

    it('keeps a double quote that closes but never opens', async () => {
        const result = await parseEnv('CLOSING=unterminated"');

        expect(result).toStrictEqual({ CLOSING: 'unterminated"' });
    });

    it('keeps a single quote that opens but never closes', async () => {
        const result = await parseEnv("OPENING='unterminated");

        expect(result).toStrictEqual({ OPENING: "'unterminated" });
    });

    it('keeps a single quote that closes but never opens', async () => {
        const result = await parseEnv("CLOSING=unterminated'");

        expect(result).toStrictEqual({ CLOSING: "unterminated'" });
    });

    // Mismatched ends are not a pair either.
    it('keeps quotes that do not match each other', async () => {
        const result = await parseEnv(['MIXED="value\'', 'ALSO_MIXED=\'value"'].join('\n'));

        expect(result).toStrictEqual({ MIXED: '"value\'', ALSO_MIXED: '\'value"' });
    });
});
