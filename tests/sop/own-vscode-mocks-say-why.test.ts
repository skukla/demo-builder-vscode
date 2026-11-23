/**
 * SOP Compliance Test: a suite's own `jest.mock('vscode', factory)` says why.
 *
 * `tests/__mocks__/vscode.ts` is the shared vscode mock and `jest.config.js` maps
 * `^vscode$` to it. A factory mock in a test file REPLACES it, so every file that
 * has one is a second description of the vscode API that can drift. Some need to
 * (a different return value, a missing member on purpose). Those say so, in a
 * comment within three lines above the call, with the reason after the colon:
 *
 *   // Own vscode mock: showQuickPick must resolve the second item, not undefined.
 *
 * The call is matched on the WHOLE file, so the formatter's multi-line form
 * (`jest.mock(` at the end of a line, `'vscode',` on the next) and `jest.doMock`
 * are caught too. A new one without the comment fails here.
 *
 * @see .rptc/backlog (PL-114)
 */

import * as fs from 'fs';
import * as path from 'path';
import { workingTreeFiles } from './architectureScan';

const repoRoot = path.resolve(__dirname, '..', '..');
const MARKER = /^\/\/ Own vscode mock:\s*\S/;
const FACTORY_MOCK = /jest\.(?:do)?[mM]ock\(\s*(['"`])vscode\1\s*,/g;
const LOOKBACK = 3;

/** 1-based lines of factory vscode mocks with no reasoned marker comment above them. */
export function unexplainedVscodeMocks(src: string): number[] {
    const lines = src.split('\n');
    const flagged: number[] = [];
    for (const m of src.matchAll(FACTORY_MOCK)) {
        const line = src.slice(0, m.index).split('\n').length; // 1-based
        const trimmed = lines[line - 1].trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue; // prose, not a call
        const above = lines.slice(Math.max(0, line - 1 - LOOKBACK), line - 1);
        if (!above.some((l) => MARKER.test(l.trim()))) flagged.push(line);
    }
    return flagged;
}

describe('own vscode mocks say why (PL-114)', () => {
    const files = workingTreeFiles('tests/**/*.ts', 'tests/**/*.tsx').filter(
        (f) => !f.startsWith('tests/sop/') && !f.startsWith('tests/__mocks__/'),
    );

    it('every factory jest.mock("vscode") carries an "Own vscode mock: <reason>" comment', () => {
        const offenders: string[] = [];
        for (const f of files) {
            const src = fs.readFileSync(path.join(repoRoot, f), 'utf-8');
            for (const line of unexplainedVscodeMocks(src)) offenders.push(`${f}:${line}`);
        }
        expect(offenders).toStrictEqual([]);
    });

    it('CONTROL: flags every spelling of an unexplained factory mock, passes one explained', () => {
        const bare = "import x from 'y';\njest.mock('vscode', () => ({ window: {} }));\n";
        expect(unexplainedVscodeMocks(bare)).toEqual([2]);
        expect(unexplainedVscodeMocks(bare.replace(/'vscode'/, '"vscode"'))).toEqual([2]);
        expect(unexplainedVscodeMocks(bare.replace('jest.mock', 'jest.doMock'))).toEqual([2]);

        const multiLine =
            "x;\njest.mock(\n    'vscode',\n    () => ({}),\n    { virtual: true },\n);\n";
        expect(unexplainedVscodeMocks(multiLine)).toEqual([2]);

        const reason = '// Own vscode mock: showQuickPick must resolve the second item.\n';
        expect(unexplainedVscodeMocks(reason + bare.split('\n')[1])).toStrictEqual([]);
        expect(unexplainedVscodeMocks(reason + multiLine.slice(3))).toStrictEqual([]);

        // A marker with no reason does not count; prose about the rule is not a call.
        expect(unexplainedVscodeMocks('// Own vscode mock:\n' + bare.split('\n')[1])).toEqual([2]);
        expect(unexplainedVscodeMocks(" * jest.mock('vscode', () => ({}))")).toStrictEqual([]);
    });

    it('CONTROL: it read the tree and found factory mocks at all', () => {
        expect(files.length).toBeGreaterThan(1000);
        const withFactory = files.filter((f) =>
            new RegExp(FACTORY_MOCK.source).test(fs.readFileSync(path.join(repoRoot, f), 'utf-8')),
        );
        expect(withFactory.length).toBeGreaterThan(40);
    });
});
