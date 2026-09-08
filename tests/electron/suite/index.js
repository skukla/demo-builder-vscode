/**
 * Activation test — runs INSIDE a real VS Code instance.
 *
 * PL-46 step one. The owner's goal for that item is "as close to automated user
 * testing of the extension as possible"; this is the first rung, and the one that
 * earns its place on its own merits.
 *
 * WHY ACTIVATION FIRST. `src/extension.ts` is 864 lines and no test had ever
 * entered it. It aborts at line 318 — `if (!vscode.workspace.isTrusted) return;`
 * — so a test that launches VS Code without dealing with workspace trust runs
 * about a third of the file and then quietly stops. Everything after that line,
 * including every command registration, was unexercised.
 *
 * THE TRUST ASSERTION IS THE CONTROL, NOT A FORMALITY. Without it this suite
 * would pass against an activation that returned early: the extension would still
 * report as active, and the command assertions would be the only thing failing —
 * or not, if VS Code had registered them from the manifest. Asserting trust first
 * means a green run cannot be a vacuous one. `--disable-workspace-trust` in
 * `runTest.js` is what makes it true.
 *
 * No mocha. `run()` is the whole contract `--extensionTestsPath` asks for, and
 * plain assertions keep this at zero new dependencies — `@vscode/test-electron`
 * was already installed and unused.
 */

const assert = require('node:assert');
const vscode = require('vscode');

const EXTENSION_ID = 'skukla.adobe-demo-builder';

/**
 * Commands the manifest promises AND that should exist in this run.
 *
 * Read at run time so the list cannot go stale — and filtered, because two of the
 * twenty-two are gated on `extensionMode === Development` in commandManager.ts.
 * Passing `--extensionTestsPath` puts VS Code in **Test** mode, not Development,
 * so those two correctly do not register here.
 *
 * The filter reads the manifest's own "(Dev Only)" title convention rather than
 * hardcoding the two ids, so a third dev command added later is handled without
 * touching this file. That mattered on the first successful run of this suite:
 * `resetAll` and `resetAiOnboarding` were reported as missing, which read as a
 * product bug until the guard was found.
 */
function expectedCommands() {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const contributes = (ext && ext.packageJSON && ext.packageJSON.contributes) || {};
    return (contributes.commands || [])
        .filter((c) => !/\(dev only\)/i.test(c.title || ''))
        .map((c) => c.command);
}

async function run() {
    // 1. The workspace must be trusted, or activation returns at line 318 and
    //    everything below is measuring a shell.
    assert.strictEqual(
        vscode.workspace.isTrusted,
        true,
        'workspace is NOT trusted — activation aborts early and this suite would pass vacuously. ' +
            'runTest.js must pass --disable-workspace-trust.'
    );

    // 2. The extension is installed and activates without throwing.
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found in the test instance`);

    await ext.activate();
    assert.strictEqual(ext.isActive, true, 'extension did not become active');

    // 3. Every command the manifest contributes is really registered. This is the
    //    part that only runs if activation got past the trust gate.
    // NOTE FOR ANYONE HITTING A "missing command" FAILURE HERE: the run is in
    // ExtensionMode.Test, not Development, so the two commands guarded on
    // Development in commandManager.ts are absent by design. That mode is NOT
    // readable from here — `extensionMode` lives on ExtensionContext, which only
    // the extension itself holds; `vscode.extensions.getExtension()` returns an
    // Extension, which has no such property. Asserting it was tried and returned
    // undefined. The "(Dev Only)" title filter is the check that does work.
    const promised = expectedCommands();
    assert.ok(promised.length > 0, 'manifest contributes no commands — wrong extension?');

    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = promised.filter((c) => !registered.has(c));
    assert.deepStrictEqual(
        missing,
        [],
        `commands contributed by the manifest but never registered: ${missing.join(', ')}`
    );

    // 4. The sidebar view container the manifest declares must exist. Opening it
    //    is what a user does first, and a missing view id fails silently in the UI.
    const view = ((ext.packageJSON.contributes || {}).views || {}).demoBuilder || [];
    assert.ok(view.length > 0, 'no demoBuilder views contributed');

    // eslint-disable-next-line no-console
    console.log(
        `activation OK — trusted, ${promised.length} commands registered, ${view.length} view(s)`
    );
}

module.exports = { run };
