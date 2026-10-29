/**
 * `npm run test:ui` — build the extension into ITS OWN folder, then drive it in a
 * real VS Code with ExTester.
 *
 * WHY NOT `extest setup-and-run` ANY MORE (PL-66). With no VSIX given, ExTester
 * packages the repo with vsce, and vsce runs `vscode:prepublish` = `npm run
 * compile` — which rewrites THIS checkout's `dist/`. That is the build the
 * owner's Extension Dev Host loads, so every UI run silently replaced it. Here
 * the tracked tree is copied to a staging folder, packaged THERE (so the compile
 * writes the staging `dist/`), and the VSIX handed to ExTester explicitly.
 *
 * Steps, each an ExTester command so a failure names its own stage:
 *   1. stage   copy tracked + untracked-not-ignored files (minus test/docs trees),
 *              link node_modules, `vsce package` in the stage
 *   2. get-vscode, get-chromedriver   (network on first run; cached after)
 *   3. install-vsix                   the staged VSIX into .test-extensions/
 *   4. run-tests                      tests/ui/*.test.js
 *
 * Paths are short on purpose: VS Code opens a unix socket under its storage
 * folder and refuses to start when that path passes ~103 bytes (see
 * tests/electron/runTest.js).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK = '/tmp/dbv-ui';
const STAGE = path.join(WORK, 'stage');
const VSIX = path.join(WORK, 'demo-builder-ui.vsix');
// The VS Code the locator set is pinned to — see the header of sidebar.test.js.
const CODE_VERSION = '1.136.1';
// Not packaged and not needed to build; copying them only slows the stage.
const SKIP_PREFIXES = ['tests/', '.rptc/', '.claude/', 'docs/', 'reports/', '.githooks/'];

function run(cmd, args, cwd) {
    const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed (exit ${result.status}) in ${cwd}`);
    }
}

function trackedFiles() {
    const out = spawnSync(
        'git',
        ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        { cwd: REPO, encoding: 'utf-8' },
    );
    if (out.status !== 0) {
        throw new Error(`git ls-files failed: ${out.stderr}`);
    }
    return out.stdout
        .split('\0')
        .filter(Boolean)
        .filter((f) => !SKIP_PREFIXES.some((p) => f.startsWith(p)))
        // A tracked file deleted in the working tree is listed but absent.
        .filter((f) => fs.existsSync(path.join(REPO, f)));
}

function stage() {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(STAGE, { recursive: true });
    for (const file of trackedFiles()) {
        const dest = path.join(STAGE, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(REPO, file), dest);
    }
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(STAGE, 'node_modules'), 'dir');
    // vsce runs `vscode:prepublish` (npm run compile) with cwd = STAGE.
    run('npx', ['vsce', 'package', '--out', VSIX], STAGE);
}

function extest(command, ...args) {
    run('npx', ['extest', command, ...args], REPO);
}

function main() {
    const buildOnly = process.argv.includes('--build-only');
    stage();
    if (buildOnly) {
        console.log(`built ${VSIX}; --build-only, so no VS Code was launched`);
        return;
    }
    extest('get-vscode', '--code_version', CODE_VERSION);
    extest('get-chromedriver', '--code_version', CODE_VERSION);
    extest('install-vsix', '--vsix_file', VSIX, '--extensions_dir', '.test-extensions');
    extest(
        'run-tests',
        'tests/ui/*.test.js',
        '--code_version', CODE_VERSION,
        '--code_settings', 'tests/ui/settings.json',
        '--extensions_dir', '.test-extensions',
    );
}

main();
