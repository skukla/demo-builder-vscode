/**
 * PostToolUse hook: format-on-edit.
 *
 * Prettier may rewrite only a file it already owned at HEAD, or a file new to git. On
 * 2026-11-07 one small edit to the data-installer engine, a file never prettier-formatted,
 * rewrapped all of it (382 to 513 lines) and failed the god-file limit.
 *
 * Each test drives a synthetic git repo with a fake `npx` first on PATH, which records its
 * calls and answers `prettier --check` from the content it is handed: text holding
 * UNFORMATTED fails the check. So the tests read what the hook DECIDED, without running
 * prettier or reading this repo's files.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOOK = path.join(__dirname, '../../.claude/hooks/format-on-edit.sh');

const FAKE_NPX = `#!/usr/bin/env bash
echo "$*" >> "$NPX_LOG"
if [ "$1" = prettier ] && [ "$2" = --check ]; then
  if grep -q UNFORMATTED; then exit 1; fi
fi
exit 0
`;

let root: string;
let log: string;
let env: NodeJS.ProcessEnv;

/** The environment without GIT_*: a pre-push run sets GIT_DIR, which would aim git here. */
function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
    const kept = Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'));
    return { ...Object.fromEntries(kept), ...extra };
}

function git(...args: string[]): void {
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
        cwd: root,
        env,
        stdio: 'ignore',
    });
}

function write(rel: string, text: string): string {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
}

/** Run the hook for one edited file; answers the npx calls it made. */
function edit(file: string): string[] {
    execFileSync('bash', [HOOK], {
        cwd: root,
        env,
        input: JSON.stringify({ tool_input: { file_path: file } }),
    });
    return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
}

const wrote = (calls: string[]) => calls.some((call) => call.startsWith('prettier --write'));

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'format-on-edit-')));
    const bin = path.join(root, '.bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'npx'), FAKE_NPX, { mode: 0o755 });
    log = path.join(root, 'npx.log');
    env = cleanEnv({ CLAUDE_PROJECT_DIR: root, NPX_LOG: log, PATH: `${bin}:${process.env.PATH}` });
    git('init', '-q');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('format-on-edit', () => {
    it('formats a file that was prettier-formatted at HEAD', () => {
        const file = write('src/a.ts', 'export const a = 1;\n');
        git('add', '.');
        git('commit', '-qm', 'base');
        fs.writeFileSync(file, 'export const a = 2;\n');

        const calls = edit(file);

        expect(wrote(calls)).toBe(true);
        expect(calls).toContain(`eslint --fix ${file}`);
    });

    it('leaves the layout of a file that was not prettier-formatted at HEAD, and still runs eslint --fix', () => {
        const file = write('src/engine.ts', '// UNFORMATTED long lines\n');
        git('add', '.');
        git('commit', '-qm', 'base');
        fs.writeFileSync(file, '// UNFORMATTED long lines, one edited\n');

        const calls = edit(file);

        expect(wrote(calls)).toBe(false);
        expect(calls).toContain(`eslint --fix ${file}`);
    });

    it('judges by HEAD, not by the edit: a clean edit to an unformatted file is still left alone', () => {
        const file = write('src/engine.ts', '// UNFORMATTED\n');
        git('add', '.');
        git('commit', '-qm', 'base');
        fs.writeFileSync(file, 'export const tidy = 1;\n');

        expect(wrote(edit(file))).toBe(false);
    });

    it('formats a file new to git', () => {
        write('src/seed.ts', 'export {};\n');
        git('add', '.');
        git('commit', '-qm', 'base');
        const file = write('tests/fresh.test.ts', '// UNFORMATTED\n');

        expect(wrote(edit(file))).toBe(true);
    });

    it('touches nothing outside src/ and tests/ .ts files', () => {
        const file = write('scripts/tool.ts', 'export {};\n');

        expect(edit(file)).toStrictEqual([]);
    });
});
