/**
 * Demo Builder states no Node version of its own (PR-1a, owner 2026-10-07).
 *
 * Each component declares the Node it accepts in its own repo (`engines.node`);
 * `npm run node:resolve` reads them all at a release cut and writes the one Node
 * they accept to `node-version.generated.json`. Before, the same "24" was typed
 * into four catalogs and backed by five hardcoded "20"s, and the mesh's lookups
 * never found their file, so mesh ran on the fallback for months with nothing
 * failing.
 *
 * Two halves. No source file spells a Node version (a quoted version on a line that
 * talks about Node, or one written into an fnm command). And the generated file
 * covers exactly the sources the resolver reads today, offline: a component added
 * to a catalog without re-running the resolver fails here. No other enforcer looks
 * at Node versions; `magic-timeouts` is the nearest in shape and covers durations.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT, workingTreeFiles } from './architectureScan';
import generated from '@/core/shell/config/node-version.generated.json';
import { excludedNodeSources, listNodeSources } from '@/features/components/services/nodeResolution';

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

describe('Demo Builder states no Node version of its own', () => {
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

describe('the generated Node covers every component that ships', () => {
    it('reads exactly the sources the resolver would read from the catalogs today', async () => {
        const listed = (await listNodeSources()).map((s) => s.ref).sort();
        expect(listed.length).toBeGreaterThan(5);
        expect(generated.sources.map((s) => s.ref).sort()).toStrictEqual(listed);
    });

    it('excludes exactly what the resolver excludes', () => {
        expect(generated.excluded).toStrictEqual(excludedNodeSources());
    });
});
