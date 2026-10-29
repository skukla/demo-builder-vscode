/**
 * The Demo Builder sidebar, opened the way a user opens it — and read correctly
 * whatever else is open.
 *
 * PL-46 rung two, made order-independent by PL-66. Rung one (`npm run
 * test:electron`) proves the extension activates. It cannot prove a user sees
 * anything: a webview that mounts and renders nothing passes every other check in
 * this repo. So the assertion is about CONTENT — and, since PL-66, about WHOSE
 * content: the shipped version asked only for "some readable text", and with the
 * wizard open it had read the wizard's 62 words and passed.
 *
 * ORDER INDEPENDENCE IS PROVEN, NOT HOPED FOR. Each case sets up its own
 * precondition — one closes every editor, the other opens the wizard as an editor
 * webview first and reads the sidebar after it — so neither depends on what an
 * earlier test left open. The journey file (`journey-*.test.js`) runs in the same
 * VS Code and leaves the wizard open; ExTester's glob does not promise which file
 * runs first, which is exactly why each case owns its precondition.
 *
 * Run with `npm run test:ui` (see `run.mjs` for what it builds and where).
 *
 * WHY `run.mjs` PINS THE VS CODE VERSION. ExTester ships a set of element locators
 * per VS Code release and applies the newest set at or below the version it is
 * driving. Left unpinned it downloads whatever VS Code is current, which can be
 * newer than any locator set the installed tester knows — and the failure is not
 * "unsupported version", it is a stray "no such element" on some unrelated call.
 * That is exactly how this tier broke on 2026-09-08 (tester 8.24.0, VS Code 1.134
 * renamed the editor tab's close button). When either moves, move the pin
 * deliberately.
 */

const {
    closeAllEditors,
    editorWebview,
    openSidebar,
    readSurface,
    runCommand,
    sidebarWebview,
} = require('./surfaces');

describe('the Demo Builder sidebar, opened the way a user opens it', function () {
    // Generous: this launches a real editor and waits on webview bundles.
    this.timeout(180000);

    it('shows its own content with no editor open', async function () {
        await closeAllEditors();
        await openSidebar();
        await readSurface(sidebarWebview(), 'sidebar');
    });

    it('still reads the SIDEBAR, not the editor, while an editor webview is open', async function () {
        await closeAllEditors();
        // Reading the wizard first proves the precondition: an editor webview
        // really is open and loaded, not still spinning, when the sidebar is read.
        await runCommand('Demo Builder: Create Project');
        await readSurface(editorWebview(), 'wizard');

        await openSidebar();
        await readSurface(sidebarWebview(), 'sidebar');
    });
});
