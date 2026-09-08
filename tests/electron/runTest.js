/**
 * Launch a real VS Code and run the activation suite inside it.
 *
 * `npm run test:electron`. PL-46 step one.
 *
 * `@vscode/test-electron` has been a devDependency since before this file and was
 * never used — the whole integration tier was installed and inert. This is the
 * smallest thing that puts it to work.
 *
 * TWO LAUNCH ARGUMENTS, EACH LOAD-BEARING:
 *
 *   --disable-extensions       other installed extensions must not register
 *                              commands or throw into this run.
 *   a temp folder              VS Code opened with no folder behaves differently
 *                              from one with a workspace, and the extension reads
 *                              workspace state on activation.
 *
 * WORKSPACE TRUST IS NOT ONE OF THEM, and this file said it was until 2026-09-08.
 * `src/extension.ts` does return early when the workspace is untrusted, so the
 * trust assertion inside the suite is a real control. But `--disable-workspace-trust`
 * is passed by `@vscode/test-electron` ITSELF on every run — unconditionally, in its
 * own `runTest.js` arg list — so repeating it here changed nothing and the comment
 * claiming otherwise was a false explanation of why the suite passes.
 *
 * The first run downloads a VS Code build (~100MB) into `.vscode-test/`, which is
 * gitignored. Later runs reuse it.
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { runTests } = require('@vscode/test-electron');

/**
 * Reuse the VS Code already on this machine rather than downloading another.
 *
 * The download is ~1.1GB and, measured 2026-09-08, was byte-for-byte the same
 * release already installed here (1.136.1). Returning a path makes runTests skip
 * the download entirely.
 *
 * Returns undefined when there is nothing local, and then the download happens as
 * before — CI has no VS Code installed, so the fallback is the path that matters
 * there rather than an edge case.
 *
 * The executable is `Code` on current stable. It was `Electron` until the 1.110
 * rename, which is the same rename that made test-electron 2.5.2 unusable here,
 * so both spellings are tried rather than assuming either.
 */
function localVSCode() {
    const candidates =
        process.platform === 'darwin'
            ? [
                  '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
                  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
              ]
            : [];
    return candidates.find((c) => fs.existsSync(c));
}

async function main() {
    // The repo root: this file is tests/electron/runTest.js.
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');

    if (!fs.existsSync(path.join(extensionDevelopmentPath, 'dist', 'extension.js'))) {
        throw new Error('dist/extension.js is missing — run `npm run compile` first.');
    }

    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-builder-activation-'));

    // A SHORT user-data directory, and it has to be short for a real reason.
    // VS Code opens a unix socket inside it, and a sockaddr_un path is capped at
    // ~104 bytes. The default sits under `.vscode-test/` in the repo, and this
    // repo's path is long enough on its own that VS Code refuses to start:
    //   "is longer than 103 chars, try a shorter --user-data-dir"
    //   Error: listen EINVAL … /.vscode-test/user-data/1.13-main.sock
    // `/tmp` rather than the session scratchpad on purpose — macOS $TMPDIR is a
    // long /var/folders/... path and would hit the same wall.
    const userData = fs.mkdtempSync('/tmp/dbv-ud-');

    const vscodeExecutablePath = localVSCode();
    // eslint-disable-next-line no-console
    console.log(
        vscodeExecutablePath
            ? `using the installed VS Code: ${vscodeExecutablePath}`
            : 'no local VS Code found — downloading one'
    );

    try {
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            vscodeExecutablePath,
            launchArgs: [
                workspace,
                // No --disable-workspace-trust: runTests adds it to every launch.
                '--disable-extensions',
                `--user-data-dir=${userData}`,
            ],
        });
        // eslint-disable-next-line no-console
        console.log('electron activation suite: PASSED');
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
        fs.rmSync(userData, { recursive: true, force: true });
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('electron activation suite: FAILED\n', err);
    process.exit(1);
});
