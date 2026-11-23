/**
 * `.pipeline.yaml` declares exactly the toolbox tools the instrument registry implies.
 *
 * Every instrument with a command is a dev-pipeline toolbox tool (`toolboxTools.ts`),
 * so an agent reaches it through `run_tool` or `job_start` instead of typing it into a
 * shell. This suite fails in BOTH directions: an instrument whose tool is missing, and
 * a tool line nothing in the registry backs. On a mismatch it prints the lines to paste.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LISTED_BY_HAND, toolboxTools, yamlLine } from './toolboxTools';

const PIPELINE = path.join(__dirname, '..', '..', '.pipeline.yaml');

/** The `name: {...}` lines directly under `tools:`. */
function declaredToolLines(): string[] {
    const lines = fs.readFileSync(PIPELINE, 'utf8').split('\n');
    const start = lines.findIndex((l) => l === 'tools:');
    const out: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (/^\S/.test(line)) break;
        if (/^ {2}[a-z][a-z0-9_]*:\s*\{/.test(line)) out.push(line);
    }
    return out;
}

const nameOf = (line: string) => line.trim().split(':')[0];

describe('the toolbox tools in .pipeline.yaml', () => {
    const declared = declaredToolLines();
    const expected = toolboxTools();

    it('CONTROL: the tools section was found and read', () => {
        expect(declared.length).toBeGreaterThan(LISTED_BY_HAND.length);
        expect(expected.length).toBeGreaterThan(20);
    });

    it('declares every tool the registry implies, exactly as generated', () => {
        const missing = expected.map(yamlLine).filter((line) => !declared.includes(line));
        expect({ pasteUnderTools: missing }).toStrictEqual({ pasteUnderTools: [] });
    });

    it('declares nothing the registry does not back, apart from the hand-listed tools', () => {
        const known = new Set([...expected.map((t) => t.name), ...LISTED_BY_HAND]);
        expect(declared.map(nameOf).filter((name) => !known.has(name))).toStrictEqual([]);
    });

    it('gives every tool a name and a command the toolbox accepts', () => {
        const names = expected.map((t) => t.name);
        expect(names.filter((n) => !/^[a-z][a-z0-9_]{0,40}$/.test(n))).toStrictEqual([]);
        expect(names.filter((n, i) => names.indexOf(n) !== i)).toStrictEqual([]);
        // No shell runs these: a pipe, redirect, `&&`, `$VAR` or glob would reach the
        // command as a literal word and fail at call time.
        expect(expected.filter((t) => /[|&;<>$*`]/.test(t.run)).map((t) => t.name)).toStrictEqual(
            []
        );
    });

    it('writes lines the settings parser reads back unchanged', () => {
        // `run` is unquoted inside a flow mapping, so a comma, a bracket or ` #` would
        // split or cut the entry; `about` is double-quoted, so a quote or a backslash
        // would end or escape it. Either way the parsed tool would differ from this list
        // while the equality test above still passed.
        expect(expected.filter((t) => /[,{}[\]]|\s#/.test(t.run)).map((t) => t.name)).toStrictEqual(
            []
        );
        expect(expected.filter((t) => /["\\]/.test(t.about)).map((t) => t.name)).toStrictEqual([]);
    });
});
