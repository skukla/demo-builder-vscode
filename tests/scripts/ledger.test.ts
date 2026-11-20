/**
 * scripts/ledger.py (reflect proposal 5, 2026-11-16): the tool that edits the three line-keyed
 * ledgers. Driven for real against a throwaway copy (LEDGER_ROOT), so a change that broke a
 * subcommand, or rewrote a file in another format, fails here.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'ledger.py');

interface Run {
    code: number;
    out: string;
}

function ledger(root: string, ...args: string[]): Run {
    try {
        const out = execFileSync('python3', [SCRIPT, ...args], {
            env: { ...process.env, LEDGER_ROOT: root },
            encoding: 'utf-8',
        });
        return { code: 0, out };
    } catch (error) {
        const failed = error as { status: number; stdout: string };
        return { code: failed.status, out: failed.stdout };
    }
}

function write(root: string, rel: string, text: string): void {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
}

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), 'utf-8');
const ERRORS = 'tests/sop/user-facing-errors.ledger.json';
const PROGRESS = 'tests/sop/progress-surface.ledger.json';
const MUTATION = 'scripts/mutation-equivalents.ledger.json';

let root: string;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
    write(root, 'src/a.ts', 'const x = 1;\nif (x) {\n    run();\n}\n');
    // The errors ledger keeps non-ASCII text raw; the other two escape it. Each round-trips.
    write(
        root,
        ERRORS,
        `${JSON.stringify({ _what: 'w', rawMessageToUser: { 'src/a.ts:2': 'Predates the rule — kept' } }, null, 4)}\n`
    );
    write(
        root,
        PROGRESS,
        `${JSON.stringify({ _what: 'w', directProgress: {}, blockingDialogs: { 'src/a.ts:1': 'one', 'src/a.ts:3': 'two' } }, null, 4)}\n`
    );
    write(
        root,
        MUTATION,
        `${JSON.stringify({ _what: 'w', entries: [{ module: 'src/a.ts', anchors: ['run();'], mutants: 1 }] }, null, 4)}\n`
    );
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('scripts/ledger.py', () => {
    it('lists and checks clean ledgers', () => {
        expect(ledger(root, 'list', 'progress')).toEqual({
            code: 0,
            out: expect.stringContaining('2 row(s)'),
        });
        expect(ledger(root, 'check', 'mutation').code).toBe(0);
        expect(ledger(root, 'check', 'errors').code).toBe(0);
    });

    it('moves a row to its new line, keeping its place and the file format', () => {
        const before = read(root, PROGRESS);

        expect(
            ledger(root, 'move', 'progress', 'blockingDialogs:src/a.ts:1', 'src/a.ts:2').code
        ).toBe(0);

        expect(Object.keys(JSON.parse(read(root, PROGRESS)).blockingDialogs)).toEqual([
            'src/a.ts:2',
            'src/a.ts:3',
        ]);
        expect(read(root, PROGRESS)).toBe(before.replace('"src/a.ts:1"', '"src/a.ts:2"'));
    });

    it('keeps the errors ledger in its own format: non-ASCII text stays raw', () => {
        ledger(
            root,
            'add',
            'errors',
            JSON.stringify({ section: 'rawMessageToUser', key: 'src/a.ts:3', reason: 'r' })
        );

        expect(read(root, ERRORS)).toContain('Predates the rule — kept');
    });

    it('refuses a duplicate, and writes nothing on a dry run', () => {
        const before = read(root, ERRORS);

        expect(
            ledger(
                root,
                'add',
                'errors',
                JSON.stringify({ section: 'rawMessageToUser', key: 'src/a.ts:2', reason: 'r' })
            )
        ).toEqual({
            code: 2,
            out: expect.stringContaining('already there'),
        });
        expect(
            ledger(root, 'remove', 'errors', 'rawMessageToUser:src/a.ts:2', '--dry-run').code
        ).toBe(0);
        expect(read(root, ERRORS)).toBe(before);
    });

    it('CONTROL: check names a stale row', () => {
        ledger(root, 'move', 'progress', 'blockingDialogs:src/a.ts:3', 'src/a.ts:99');
        ledger(root, 'remove', 'mutation', '0');
        ledger(
            root,
            'add',
            'mutation',
            JSON.stringify({ module: 'src/a.ts', anchors: ['run();'], line: 1, mutants: 1 })
        );

        expect(ledger(root, 'check', 'progress')).toEqual({
            code: 1,
            out: expect.stringContaining('past the end of the file'),
        });
        expect(ledger(root, 'check', 'mutation')).toEqual({
            code: 1,
            out: expect.stringContaining('line 1 is not the anchor'),
        });
    });
});
