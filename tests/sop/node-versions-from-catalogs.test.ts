/**
 * A Node version is stated only in the catalogs (PR-1a).
 *
 * Before PR-1a, versions were declared in four files, copied into two constants
 * and backed by five hardcoded "20"s in code, and the mesh's two lookups never
 * found their file, so mesh ran on the fallback for months with nothing failing.
 * The register (`nodeRequirements.ts`) now reads every answer from a catalog's
 * `nodeVersion` field, and this suite fails the build when a source file spells a
 * Node version of its own again: a quoted version on a line that talks about
 * Node, or a version written straight into an fnm command. No other enforcer here
 * looks at Node versions; `magic-timeouts` is the nearest in shape (a banned
 * literal) and covers durations only.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT, workingTreeFiles } from './architectureScan';

/** A quoted major or full version, e.g. '24' or "20.11.0". */
const QUOTED_VERSION = /['"`]\d{1,2}(?:\.\d+\.\d+)?['"`]/;
/** A line that is about Node. */
const ABOUT_NODE = /node|fnm|nvm/i;
/** A version written into an fnm command. */
const FNM_LITERAL = /(?:--using=|fnm (?:use|install) )\d/;

/**
 * Comments removed, line count kept, so a reported line is the file's real line
 * (the shared `stripComments` collapses block comments and shifts every line after).
 */
function codeOnly(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
        .replace(/^\s*\/\/.*$/gm, '')
        // A trailing comment; the leading space keeps `https://` in a string intact.
        .replace(/\s\/\/\s.*$/gm, '');
}

/** Each `file:line` that states a Node version in code. */
function literalsIn(file: string, source: string): string[] {
    return codeOnly(source)
        .split('\n')
        .flatMap((line, i) => {
            const quoted = QUOTED_VERSION.test(line) && ABOUT_NODE.test(line);
            return quoted || FNM_LITERAL.test(line) ? [`${file}:${i + 1}`] : [];
        });
}

const SOURCES = workingTreeFiles('src/**/*.ts', 'src/**/*.tsx');

describe('a Node version is stated only in the catalogs', () => {
    it('CONTROL: the scan sees a planted literal of each shape', () => {
        expect(literalsIn('planted.ts', "const nodeVersion = '20';")).toStrictEqual(['planted.ts:1']);
        expect(literalsIn('planted.ts', 'run(`fnm use 18 && npm start`);')).toStrictEqual(['planted.ts:1']);
        expect(literalsIn('planted.ts', "// a comment naming '20' for Node")).toStrictEqual([]);
        expect(literalsIn('planted.ts', "let v: string; // Node major, e.g. '20'")).toStrictEqual([]);
        expect(SOURCES.length).toBeGreaterThan(500);
    });

    it('no source file states a Node version of its own', () => {
        const offenders = SOURCES.flatMap((file) =>
            literalsIn(file, readFileSync(join(ROOT, file), 'utf8')),
        );
        expect(offenders).toStrictEqual([]);
    });
});
