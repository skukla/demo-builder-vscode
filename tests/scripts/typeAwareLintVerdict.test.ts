/**
 * The verdict `npm run lint:types` gives (PL-113): clean, findings, or a run that proves
 * nothing. The module is ESM `.mjs`, which this repo's jest transform does not parse, so it
 * is asked from a node child process, as `moduleSuites.test.ts` does.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

interface Message {
    ruleId: string | null;
    line: number;
    fatal?: boolean;
    message: string;
}
interface Result {
    filePath: string;
    messages: Message[];
}
interface Verdict {
    code: 0 | 1 | 2;
    lines: string[];
}

function ask(results: Result[]): Verdict {
    const script =
        "import { verdict } from './scripts/lib/typeAwareLintVerdict.mjs';" +
        `process.stdout.write(JSON.stringify(verdict(${JSON.stringify(results)}, '/repo')));`;
    const stdout = execFileSync('node', ['--input-type=module', '-e', script], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60_000,
    });
    return JSON.parse(stdout) as Verdict;
}

/** A tree of clean files large enough to count as the whole test tree. */
const cleanTree = (): Result[] =>
    Array.from({ length: 1000 }, (_, i) => ({ filePath: `/repo/tests/f${i}.test.ts`, messages: [] }));

describe('lint:types verdict', () => {
    it('is clean when no file has one of the four rules', () => {
        const tree = cleanTree();
        tree[0].messages.push({ ruleId: 'jest/valid-expect', line: 3, message: 'not one of the four' });

        expect(ask(tree)).toEqual({ code: 0, lines: ['clean (1000 test files, 4 rules).'] });
    });

    it('fails on each of the four rules, naming the file and line', () => {
        const tree = cleanTree();
        tree[1].messages.push({ ruleId: '@typescript-eslint/no-base-to-string', line: 7, message: 'x' });
        tree[2].messages.push({ ruleId: '@typescript-eslint/await-thenable', line: 9, message: 'x' });

        expect(ask(tree)).toEqual({
            code: 1,
            lines: [
                'tests/f1.test.ts:7  @typescript-eslint/no-base-to-string',
                'tests/f2.test.ts:9  @typescript-eslint/await-thenable',
            ],
        });
    });

    it('proves nothing, and says so, when a file could not be read', () => {
        const tree = cleanTree();
        tree[3].messages.push({ ruleId: null, line: 1, fatal: true, message: 'Parsing error' });

        expect(ask(tree)).toEqual({ code: 2, lines: ['tests/f3.test.ts:1  could not be read: Parsing error'] });
    });

    it('proves nothing when it did not read the whole test tree', () => {
        expect(ask(cleanTree().slice(0, 10)).code).toBe(2);
    });
});

describe('lint:types positive control', () => {
    function notOn(rules: Record<string, unknown>): string[] {
        const script =
            "import { rulesNotOn } from './scripts/lib/typeAwareLintVerdict.mjs';" +
            `process.stdout.write(JSON.stringify(rulesNotOn(${JSON.stringify(rules)})));`;
        return JSON.parse(
            execFileSync('node', ['--input-type=module', '-e', script], { cwd: repoRoot, encoding: 'utf8' }),
        ) as string[];
    }

    it('names a rule switched off or missing, and passes when all four are errors', () => {
        expect(
            notOn({
                '@typescript-eslint/no-unnecessary-type-assertion': [2],
                '@typescript-eslint/no-base-to-string': 'error',
                '@typescript-eslint/only-throw-error': [0],
            }),
        ).toEqual(['@typescript-eslint/only-throw-error', '@typescript-eslint/await-thenable']);
        expect(
            notOn({
                '@typescript-eslint/no-unnecessary-type-assertion': 2,
                '@typescript-eslint/no-base-to-string': [2],
                '@typescript-eslint/only-throw-error': ['error'],
                '@typescript-eslint/await-thenable': [2, {}],
            }),
        ).toStrictEqual([]);
    });

    it('reads the four rules as on in the real eslint.casts.mjs', () => {
        const script =
            "import { ESLint } from 'eslint';" +
            "import { rulesNotOn } from './scripts/lib/typeAwareLintVerdict.mjs';" +
            "const e = new ESLint({ overrideConfigFile: 'eslint.casts.mjs' });" +
            "const c = await e.calculateConfigForFile('tests/setup/consoleGate.ts');" +
            'process.stdout.write(JSON.stringify(rulesNotOn(c.rules)));';
        const out = execFileSync('node', ['--input-type=module', '-e', script], {
            cwd: repoRoot,
            encoding: 'utf8',
            timeout: 120_000,
        });
        expect(JSON.parse(out)).toStrictEqual([]);
    });
});
