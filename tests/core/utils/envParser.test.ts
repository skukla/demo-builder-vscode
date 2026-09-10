/**
 * `parseEnvFile` — the shared .env parser, and every decision it makes.
 *
 * Moved out of `meshStatusResolver.test.ts` on 2026-09-07 (PL-45), where the block
 * was already labelled "(shared utility)". The function is declared in
 * `core/utils/envParser.ts` and nothing about it is mesh-specific, so its six tests
 * were scored against a module they never constrain — and `envParser.ts` had no
 * suite of its own at all.
 *
 * It absorbed a SECOND set the same week (PL-48). `envVarExtraction.ts` carried its
 * own copy of this loop, so the parsing decisions had two suites between them
 * (`envVarExtraction.test.ts` and `envVarExtraction-parsing.test.ts`) and the loop
 * had two implementations. The copy is gone; both suites' cases live here, against
 * the function that now makes the decision.
 *
 * Rows are the INPUTS, and every expectation is the exact record — derived by
 * running the parser, not guessed. `toStrictEqual` because a key the parser
 * INVENTS is the failure that matters most: it is how a variable the file never
 * declared reaches a demo's environment.
 */

import { parseEnvFile } from '@/core/utils/envParser';
import { passwordShape } from '../../helpers/credentialShapes';

type Row = [label: string, content: string, expected: Record<string, string>];

describe('parseEnvFile — what counts as a comment', () => {
    // The `#` has to be the FIRST non-space character, and a comment stays a comment
    // even when it carries an `=` — which the commented-out settings people leave in a
    // .env almost always do.
    const rows: Row[] = [
        ['a commented-out setting', '# DB_PORT=3306\nDB_PORT=5432', { DB_PORT: '5432' }],
        [
            'a commented-out setting that is indented',
            '    # DB_PORT=3306\nDB_PORT=5432',
            { DB_PORT: '5432' },
        ],
        [
            'comments between settings',
            '# one\nKEY1=value1\n# two\nKEY2=value2',
            {
                KEY1: 'value1',
                KEY2: 'value2',
            },
        ],
        ['a file of nothing but comments', '# one\n# two', {}],
        [
            'blank lines between settings',
            '\nKEY1=value1\n\nKEY2=value2\n\n',
            {
                KEY1: 'value1',
                KEY2: 'value2',
            },
        ],
        ['a line of only whitespace', 'KEY=v\n   \t  ', { KEY: 'v' }],
        ['an empty file', '', {}],
    ];

    it.each(rows)('%s', (_label, content, expected) => {
        expect(parseEnvFile(content)).toStrictEqual(expected);
    });

    // A `#` anywhere else is data — a URL fragment, or a character inside a secret. The
    // second case matters most: truncating there would silently shorten a real password
    // and the failure would surface much later as a refused login.
    //
    // The value is BUILT rather than written. A literal beside a key called PASSWORD is
    // what a secret scanner matches, whatever it spells — this line raised a GitGuardian
    // alert on 2026-09-06 reading the word "password" with one letter swapped for the
    // character under test.
    it('keeps a hash that is not the first character', () => {
        const secret = passwordShape('#mid');

        const result = parseEnvFile(
            `ANCHOR=https://example.com/docs#install\nSECRET_VALUE=${secret}`
        );

        expect(result).toStrictEqual({
            ANCHOR: 'https://example.com/docs#install',
            SECRET_VALUE: secret,
        });
        expect(secret).toContain('#'); // the character this test exists for
    });
});

describe('parseEnvFile — where a key starts and ends', () => {
    // A line whose first character is `=` has no key. Reading one out of the middle of
    // it invents a variable the file never declared. A line with no `=` at all is not a
    // setting; both are skipped rather than thrown on, because one malformed line in a
    // demo's .env must not cost the caller the other forty.
    const rows: Row[] = [
        [
            'a line that starts with an equals sign yields nothing',
            '=LEADING_EQUALS=value\nREAL_KEY=value',
            { REAL_KEY: 'value' },
        ],
        [
            'a line with no equals sign at all yields nothing',
            'MALFORMED LINE\nREAL_KEY=value',
            { REAL_KEY: 'value' },
        ],
        [
            'the space around both halves is trimmed',
            '   SPACED_KEY   =   spaced value   ',
            { SPACED_KEY: 'spaced value' },
        ],
        [
            'everything after the FIRST equals belongs to the value',
            'CONNECTION_STRING=Server=localhost;Database=test\nBASE64_KEY=abc123==',
            {
                CONNECTION_STRING: 'Server=localhost;Database=test',
                BASE64_KEY: 'abc123==',
            },
        ],
        [
            'underscores and digits are ordinary key characters',
            'MY_KEY_1=v1\nMY_KEY_2=v2\nKEY123=v3',
            { MY_KEY_1: 'v1', MY_KEY_2: 'v2', KEY123: 'v3' },
        ],
        // Assignment, not accumulation. A .env that sets one variable twice — a base
        // file re-declared lower down — resolves to the LAST value, which is what a
        // shell would do with the same file.
        ['a repeated key takes its last value', 'K=first\nK=second', { K: 'second' }],
        [
            'simple pairs',
            'KEY1=value1\nKEY2=value2\nKEY3=value3',
            {
                KEY1: 'value1',
                KEY2: 'value2',
                KEY3: 'value3',
            },
        ],
    ];

    it.each(rows)('%s', (_label, content, expected) => {
        expect(parseEnvFile(content)).toStrictEqual(expected);
    });
});

describe('parseEnvFile — when a quote is a wrapper', () => {
    // Only a MATCHING pair is a wrapper. A lone quote at one end is a character in the
    // value, and dropping it would silently rewrite a password or a regex.
    const rows: Row[] = [
        [
            'a value quoted at both ends is unwrapped',
            'DOUBLE="wrapped"\nSINGLE=\'wrapped\'',
            {
                DOUBLE: 'wrapped',
                SINGLE: 'wrapped',
            },
        ],
        [
            'the spaces inside the quotes are kept',
            'DQ="quoted value"\nSQ=\'single quoted\'',
            {
                DQ: 'quoted value',
                SQ: 'single quoted',
            },
        ],
        [
            'a double quote that opens but never closes',
            'OPENING="unterminated',
            {
                OPENING: '"unterminated',
            },
        ],
        [
            'a double quote that closes but never opens',
            'CLOSING=unterminated"',
            {
                CLOSING: 'unterminated"',
            },
        ],
        [
            'a single quote that opens but never closes',
            "OPENING='unterminated",
            {
                OPENING: "'unterminated",
            },
        ],
        [
            'a single quote that closes but never opens',
            "CLOSING=unterminated'",
            {
                CLOSING: "unterminated'",
            },
        ],
        [
            'quotes that do not match each other',
            'MIXED="value\'\nALSO_MIXED=\'value"',
            {
                MIXED: '"value\'',
                ALSO_MIXED: '\'value"',
            },
        ],
        // The three ways a .env spells "this variable is set but empty". All three have
        // to reach the caller as the empty STRING — an absent key means something else
        // entirely to every consumer of this record.
        [
            'the three empty values',
            'KEY1=\nKEY2=""\nKEY3=\'\'',
            {
                KEY1: '',
                KEY2: '',
                KEY3: '',
            },
        ],
        ['a value of only spaces is empty', 'KEY=     ', { KEY: '' }],
        // A single quote character is its own opening AND closing quote, so it is read
        // as an empty pair. Pinned because it is surprising, not because it is wanted:
        // a value of one quote mark is indistinguishable from `""` here.
        ['a lone double quote is read as an empty pair', 'LONE="', { LONE: '' }],
        ['a lone single quote is read as an empty pair', "LONE='", { LONE: '' }],
    ];

    it.each(rows)('%s', (_label, content, expected) => {
        expect(parseEnvFile(content)).toStrictEqual(expected);
    });
});

describe('parseEnvFile — what a value may contain', () => {
    // A .env holds URLs, JSON, secrets and, in demo projects, non-ASCII sample data.
    // Anything the parser mangles here surfaces much later as a broken demo.
    const rows: Row[] = [
        [
            'a URL with a query string',
            'URL=https://example.com/path?param=value&other=123',
            { URL: 'https://example.com/path?param=value&other=123' },
        ],
        [
            'punctuation a password would use',
            'SPECIAL_CHARS=x@y0rd!#$%',
            {
                SPECIAL_CHARS: 'x@y0rd!#$%',
            },
        ],
        ['a JSON document', 'JSON_DATA={"key":"value"}', { JSON_DATA: '{"key":"value"}' }],
        [
            'non-ASCII text and an emoji',
            'MESSAGE=Hello 世界\nEMOJI=🚀',
            {
                MESSAGE: 'Hello 世界',
                EMOJI: '🚀',
            },
        ],
    ];

    it.each(rows)('%s', (_label, content, expected) => {
        expect(parseEnvFile(content)).toStrictEqual(expected);
    });

    it('does not truncate a very long value', () => {
        const longValue = 'a'.repeat(10000);

        expect(parseEnvFile(`LONG_KEY=${longValue}`)).toStrictEqual({ LONG_KEY: longValue });
    });
});

describe('parseEnvFile — line endings', () => {
    // Lines are split on `\n` and then trimmed, so a CR at the END of a line is
    // whitespace and disappears. A CR in the MIDDLE of one is not: it is part of the
    // value and stays there.
    //
    // That last row is why this parser is now the only one. `envVarExtraction.ts` used
    // to hold a regex copy whose `(.*)$` could not cross a line terminator, so the same
    // input dropped the whole variable — for two years, in the module that reads the
    // file a demo actually runs on.
    const rows: Row[] = [
        ['Windows endings', 'KEY1=value1\r\nKEY2=value2\r\n', { KEY1: 'value1', KEY2: 'value2' }],
        [
            'mixed endings',
            'KEY1=value1\nKEY2=value2\r\nKEY3=value3\r',
            {
                KEY1: 'value1',
                KEY2: 'value2',
                KEY3: 'value3',
            },
        ],
        [
            'a carriage return INSIDE a value is kept',
            'KEY=before\rafter',
            {
                KEY: 'before\rafter',
            },
        ],
    ];

    it.each(rows)('%s', (_label, content, expected) => {
        expect(parseEnvFile(content)).toStrictEqual(expected);
    });

    // There is no line continuation and no multi-line quoting: the first line keeps its
    // opening quote as data and the rest have no `=`, so they vanish. Asserted exactly,
    // because the test this replaced said only `toBeDefined()` — which passes for any
    // value the parser could possibly return, including a wrong one.
    it('has no multi-line quoted value: only the first line survives', () => {
        expect(parseEnvFile('KEY="line1\nline2\nline3"')).toStrictEqual({ KEY: '"line1' });
    });
});

describe('parseEnvFile — whole files', () => {
    it('parses an Adobe demo project .env', () => {
        const content = [
            '# Adobe Commerce Configuration',
            'MAGENTO_HOST=localhost',
            'MAGENTO_PORT=9080',
            'MAGENTO_ADMIN_URL=https://localhost:9080/admin',
            '',
            '# API Mesh',
            'MESH_ENDPOINT=https://graph.adobe.io/api',
            'MESH_CREDENTIAL="abc-123-def-456"',
            '',
            '# Component versions',
            'NODE_VERSION=18',
            'PHP_VERSION=8.1',
        ].join('\n');

        expect(parseEnvFile(content)).toStrictEqual({
            MAGENTO_HOST: 'localhost',
            MAGENTO_PORT: '9080',
            MAGENTO_ADMIN_URL: 'https://localhost:9080/admin',
            MESH_ENDPOINT: 'https://graph.adobe.io/api',
            MESH_CREDENTIAL: 'abc-123-def-456',
            NODE_VERSION: '18',
            PHP_VERSION: '8.1',
        });
    });

    it('parses a Docker compose .env', () => {
        const content = [
            'COMPOSE_PROJECT_NAME=adobe-demo',
            'MYSQL_DATABASE=magento',
            'MYSQL_USER=magento',
            'MYSQL_PW=fake-test-pw-not-a-secret',
        ].join('\n');

        expect(parseEnvFile(content)).toStrictEqual({
            COMPOSE_PROJECT_NAME: 'adobe-demo',
            MYSQL_DATABASE: 'magento',
            MYSQL_USER: 'magento',
            MYSQL_PW: 'fake-test-pw-not-a-secret',
        });
    });
});
