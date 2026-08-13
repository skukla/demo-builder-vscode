/**
 * Stop hook: backlog-claim-drift.
 *
 * The sibling `rptc-record-drift.sh` watches the record's STRUCTURE. This one watches
 * its TRUTH — it fires when a turn changes code that a live backlog item describes,
 * because on 2026-08-13 five of fourteen actionable items turned out to describe
 * defects that no longer existed, and the hygiene scan structurally cannot see that
 * class (a shipped item's links resolve perfectly).
 *
 * Every test drives a SYNTHETIC .rptc/backlog tree in a temp dir and passes changed
 * files as arguments, for the reason router.test.ts pins a synthetic `ps`: a hook test
 * that reads the real repo starts depending on what the backlog happens to contain
 * that week, and would rot exactly like the record it guards.
 *
 * Contract: advisory only. ALWAYS exit 0 — a stale item is worth a question, never
 * worth halting a turn. Silence means nothing to report.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOOK = path.join(__dirname, '../../.claude/hooks/backlog-claim-drift.sh');

interface Result {
    code: number;
    stderr: string;
}

let root: string;

/** Build a synthetic project with a backlog whose items cite the given files. */
function seedBacklog(items: Record<string, string>): void {
    const dir = path.join(root, '.rptc', 'backlog');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(items)) {
        const target = path.join(dir, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, body);
    }
}

function run(...files: string[]): Result {
    try {
        execFileSync('bash', [HOOK, ...files], {
            cwd: root,
            env: { ...process.env, CLAUDE_PROJECT_DIR: root },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, stderr: '' };
    } catch (e) {
        const err = e as { status?: number; stderr?: string };
        return { code: err.status ?? -1, stderr: err.stderr ?? '' };
    }
}

/**
 * execFileSync only throws on nonzero exit, and this hook always exits 0, so stderr
 * has to be captured on the success path too.
 */
function runCapture(...files: string[]): string {
    const out = execFileSync(
        'bash',
        ['-c', `bash "${HOOK}" ${files.map((f) => `'${f}'`).join(' ')} 2>&1 1>/dev/null`],
        { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' }
    );
    return out;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbv-claim-drift-'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('backlog-claim-drift', () => {
    it('fires when a changed file is cited by a live backlog item', () => {
        seedBacklog({
            'a-real-item.md': 'The bug is in `settingsSerializer.ts` at the emit site.',
        });
        const out = runCapture('src/features/projects-dashboard/services/settingsSerializer.ts');
        expect(out).toContain('backlog-claim-drift');
        expect(out).toContain('a-real-item.md');
    });

    it('is silent when no item cites the changed file', () => {
        seedBacklog({ 'unrelated.md': 'This item is about `somethingElse.ts` entirely.' });
        expect(runCapture('src/core/utils/sleep.ts')).toBe('');
    });

    it('always exits 0, including when it reports', () => {
        seedBacklog({ 'item.md': 'concerns `foo.ts`' });
        expect(run('src/features/x/foo.ts').code).toBe(0);
        expect(run('src/core/untouched.ts').code).toBe(0);
    });

    it('ignores test files, so fixing a test does not read as closing an item', () => {
        seedBacklog({ 'item.md': 'concerns `foo.ts`' });
        expect(runCapture('src/features/x/foo.test.ts')).toBe('');
    });

    it('ignores generic basenames that appear in items as prose', () => {
        seedBacklog({ 'item.md': 'the registry lives in `index.ts` and `types.ts`' });
        expect(runCapture('src/features/x/index.ts', 'src/features/x/types.ts')).toBe('');
    });

    it('suppresses a HUB file cited by more than three items', () => {
        seedBacklog({
            'one.md': 'see `dashboardHandlers.ts`',
            'two.md': 'see `dashboardHandlers.ts`',
            'three.md': 'see `dashboardHandlers.ts`',
            'four.md': 'see `dashboardHandlers.ts`',
        });
        // Four items name it, so the mention is vocabulary rather than a claim.
        expect(runCapture('src/features/dashboard/handlers/dashboardHandlers.ts')).toBe('');
    });

    it('reports a file cited by exactly three items (the hub boundary)', () => {
        seedBacklog({
            'one.md': 'see `narrowFile.ts`',
            'two.md': 'see `narrowFile.ts`',
            'three.md': 'see `narrowFile.ts`',
        });
        expect(runCapture('src/features/x/narrowFile.ts')).toContain('narrowFile.ts');
    });

    it('suppresses a CHATTY item that names code as context rather than claim', () => {
        // >15 distinct source files makes it a broad plan, not a claim about any one.
        const many = Array.from({ length: 20 }, (_, i) => `\`mod${i}.ts\``).join(', ');
        seedBacklog({ 'broad-plan.md': `This plan touches ${many} and \`target.ts\`.` });
        expect(runCapture('src/features/x/target.ts')).toBe('');
    });

    it('does not read the index itself, which would double-report every hit', () => {
        seedBacklog({ 'README.md': 'index entry naming `soloFile.ts`' });
        expect(runCapture('src/features/x/soloFile.ts')).toBe('');
    });

    it('matches generated skill templates, not just .ts', () => {
        // The diagnose-demo replay fired on the right commit and named the WRONG items,
        // because its only precise link was the template path — its .ts sibling
        // skillsWriter.ts is cited by five items and correctly suppressed as a hub.
        seedBacklog({ 'skill-item.md': 'adds `templates/skills/diagnose-demo.md`' });
        const out = runCapture('src/features/project-creation/templates/skills/diagnose-demo.md');
        expect(out).toContain('skill-item.md');
    });

    it('fails open when there is no backlog at all', () => {
        // No .rptc/ — a fresh checkout or an unrelated repo must not be disrupted.
        expect(run('src/features/x/foo.ts').code).toBe(0);
        expect(runCapture('src/features/x/foo.ts')).toBe('');
    });

    it('caps total output so a wide refactor cannot produce a wall of text', () => {
        const items: Record<string, string> = {};
        for (let i = 0; i < 10; i++) items[`item-${i}.md`] = `concerns \`file${i}.ts\``;
        seedBacklog(items);
        const files = Array.from({ length: 10 }, (_, i) => `src/features/x/file${i}.ts`);
        const reported = runCapture(...files)
            .split('\n')
            .filter((l) => l.includes('cited by')).length;
        expect(reported).toBeLessThanOrEqual(6);
    });
});
