/**
 * `scripts/mutationRedundancyCombine.mjs`, run as a subprocess against report files
 * written into a temp directory (the scripts are plain ESM `.mjs`, which this repo's
 * jest transform does not parse — the precedent is `traceSession.test.ts`).
 *
 * The reports here are the smallest Stryker JSON the script reads: `testFiles` naming
 * each test, and `files` naming each mutant with the tests that killed it. The shape
 * was read from a real report (reports/mutation/redundancy, 2026-10-10), not composed.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/mutationRedundancyCombine.mjs');

interface NamedTest {
    file: string;
    name: string;
}
interface Combined {
    modules: number;
    tests: number;
    killedMutants: number;
    cover: number;
    testsByFile: Record<string, number>;
    overlap: NamedTest[];
    idle: { judged: NamedTest[]; unjudged: NamedTest[] };
}
interface FixtureReport {
    module: string;
    /** test file → test names; ids are assigned in order, per report, as Stryker does. */
    suites: Record<string, string[]>;
    /** one entry per mutant: the test NAMES that killed it. */
    mutants: string[][];
}

let root: string;

function writeReport(name: string, report: FixtureReport): void {
    const ids = new Map<string, string>();
    const testFiles: Record<string, { tests: { id: string; name: string }[] }> = {};
    let next = 0;
    for (const [file, names] of Object.entries(report.suites)) {
        testFiles[file] = {
            tests: names.map((testName) => {
                const id = String(next++);
                ids.set(testName, id);
                return { id, name: testName };
            }),
        };
        fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), '');
    }
    const mutants = report.mutants.map((killers, i) => ({
        id: String(i),
        status: killers.length ? 'Killed' : 'Survived',
        killedBy: killers.map((testName) => ids.get(testName)),
    }));
    fs.writeFileSync(
        path.join(root, 'reports', name),
        JSON.stringify({ testFiles, files: { [report.module]: { mutants } } }),
    );
}

function combine(): Combined {
    const out = execFileSync('node', [SCRIPT, '--dir', 'reports', '--json'], { cwd: root, encoding: 'utf8' });
    return JSON.parse(out) as Combined;
}

const names = (tests: NamedTest[]): string[] => tests.map((test) => test.name).sort();

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'redundancy-combine-'));
    fs.mkdirSync(path.join(root, 'reports'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('judging a test across every module it ran for', () => {
    it('keeps a test that is idle for one module and the only killer in another', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['a works'], 'tests/shared.test.ts': ['shared holds b'] },
            mutants: [['a works']],
        });
        writeReport('b.json', {
            module: 'src/b.ts',
            suites: { 'tests/shared.test.ts': ['shared holds b'] },
            mutants: [['shared holds b']],
        });

        const result = combine();

        expect(result.cover).toBe(2);
        expect(result.idle.judged).toStrictEqual([]);
        expect(result.idle.unjudged).toStrictEqual([]);
        expect(result.overlap).toStrictEqual([]);
    });

    it('counts a test once however many reports it appears in', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['a works'] },
            mutants: [['a works']],
        });
        writeReport('b.json', {
            module: 'src/b.ts',
            suites: { 'tests/a.test.ts': ['a works'] },
            mutants: [['a works']],
        });

        const result = combine();

        expect(result.tests).toBe(1);
        expect(result.modules).toBe(2);
        expect(result.killedMutants).toBe(2);
        expect(result.testsByFile).toStrictEqual({ 'tests/a.test.ts': 1 });
    });

    it('tells two tests with the same name apart by their file', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['works'], 'tests/a-edges.test.ts': ['works'] },
            mutants: [['works']],
        });

        // Both ids resolve to the name "works", so the LAST suite's test is the killer.
        const result = combine();

        expect(result.tests).toBe(2);
        expect(result.cover).toBe(1);
        expect(result.idle.judged).toStrictEqual([{ file: 'tests/a.test.ts', name: 'works' }]);
    });
});

describe('the cover and what falls outside it', () => {
    it('reports a test as overlap when the cover already kills everything it kills', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['broad', 'narrow'] },
            mutants: [['broad', 'narrow'], ['broad']],
        });

        const result = combine();

        expect(result.cover).toBe(1);
        expect(names(result.overlap)).toStrictEqual(['narrow']);
    });

    it('keeps both of two tests that each hold a mutant the other misses', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['left', 'right'] },
            mutants: [['left', 'right'], ['left'], ['right']],
        });

        const result = combine();

        expect(result.cover).toBe(2);
        expect(result.overlap).toStrictEqual([]);
    });

    it('does not count a mutant nothing killed', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['a works'] },
            mutants: [['a works'], []],
        });

        expect(combine().killedMutants).toBe(1);
    });
});

describe('an idle test', () => {
    it('is a lead when its own module was measured', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['a works', 'a idles'] },
            mutants: [['a works']],
        });

        const result = combine();

        expect(result.idle.judged).toStrictEqual([{ file: 'tests/a.test.ts', name: 'a idles' }]);
        expect(result.idle.unjudged).toStrictEqual([]);
    });

    it('is unknown when it only ran for a module that is not its own', () => {
        writeReport('a.json', {
            module: 'src/a.ts',
            suites: { 'tests/a.test.ts': ['a works'], 'tests/other.test.ts': ['other idles'] },
            mutants: [['a works']],
        });

        const result = combine();

        expect(result.idle.judged).toStrictEqual([]);
        expect(result.idle.unjudged).toStrictEqual([{ file: 'tests/other.test.ts', name: 'other idles' }]);
    });
});

describe('the report file a module is written to', () => {
    function reportNameFor(modulePath: string): string {
        const code = `import(${JSON.stringify(SCRIPT)}).then((m) => console.log(m.reportNameFor(process.argv[1])))`;
        return execFileSync('node', ['-e', code, modulePath], { encoding: 'utf8' }).trim();
    }

    it('differs for two modules that share a basename', () => {
        const dashboard = reportNameFor('src/features/dashboard/handlers/consoleApiHandlers.ts');
        const appBuilder = reportNameFor('src/features/app-builder/handlers/consoleApiHandlers.ts');

        expect(dashboard).toBe('features__dashboard__handlers__consoleApiHandlers.json');
        expect(appBuilder).toBe('features__app-builder__handlers__consoleApiHandlers.json');
    });

    it('drops the extension of a component as well as a module', () => {
        expect(reportNameFor('src/core/ui/Card.tsx')).toBe('core__ui__Card.json');
    });
});

it('exits 2 and says where it looked when there are no reports', () => {
    let status = 0;
    let stderr = '';
    try {
        execFileSync('node', [SCRIPT, '--dir', 'nowhere'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
        const failure = error as { status: number; stderr: string };
        status = failure.status;
        stderr = failure.stderr;
    }

    expect(status).toBe(2);
    expect(stderr).toContain('no reports at nowhere');
});
