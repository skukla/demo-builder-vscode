/**
 * Driving more than one VS Code surface in one run, without reading the wrong one.
 *
 * PL-66. PL-46's first multi-surface attempt (2026-09-08) stopped on three traps,
 * each of which produced a PASSING test that read the wrong thing. Every helper
 * here exists for one of them:
 *
 * 1. FRAMES ARE PICKED BY GEOMETRY, NOT NAME. `WebviewView`/`WebView` keep the
 *    iframe that best overlaps their own rectangle; this extension also sets
 *    `retainContextWhenHidden`, so hidden webviews stay in the DOM as candidates.
 *    → `readSurface` never trusts the pick: it checks the text against the surface
 *      it names (`tests/helpers/uiSurfaceText.js`) and fails at once on another surface's marker.
 * 2. `EditorView.closeAllEditors()` threw "no such element" on 1.136.
 *    → `closeAllEditors` runs the palette command a user would run instead.
 * 3. READING A FRAME TRAPS THE KEYBOARD. `switchBack()` moves the driver, not the
 *    focus, so the next palette command failed "element not interactable".
 *    → `leaveFrame` returns the driver to the top document AND blurs the iframe
 *      element there, so keystrokes land on the workbench again.
 *
 * Plus the spinner trap: "assert some text" passes on "Loading…". The marker wait
 * in `readSurface` is what waits past it.
 */

const assert = require('node:assert');
const {
    ActivityBar,
    InputBox,
    SideBarView,
    VSBrowser,
    WebView,
    WebviewView,
    Workbench,
    By,
} = require('vscode-extension-tester');
const { surfaceVerdict } = require('../helpers/uiSurfaceText');

// contributes.viewsContainers.activitybar[0].title in package.json.
const CONTAINER_TITLE = 'Demo Builder';
const POLL_MS = 500;
const RENDER_TIMEOUT_MS = 60000;

function driver() {
    return VSBrowser.instance.driver;
}

/** Return the driver to the workbench document and give it the keyboard back (trap 3). */
async function leaveFrame(webview) {
    await webview.switchBack();
    await driver().switchTo().defaultContent();
    await driver().executeScript(
        'if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }',
    );
}

/** Run a command through the palette, by the title a user sees. */
async function runCommand(title) {
    await new Workbench().executeCommand(title);
}

/** `View: Close All Editors` — the command, not the broken page-object method (trap 2). */
async function closeAllEditors() {
    await runCommand('View: Close All Editors');
}

/** Open the Demo Builder view container the way a user does: its activity-bar icon. */
async function openSidebar() {
    const control = await new ActivityBar().getViewControl(CONTAINER_TITLE);
    assert.ok(control, `no "${CONTAINER_TITLE}" icon in the activity bar`);
    const view = await control.openView();
    assert.ok(view, 'the view container did not open');
}

/** The sidebar's webview — scoped to the SideBarView's rectangle, never the workbench's. */
function sidebarWebview() {
    return new WebviewView(new SideBarView());
}

/** The webview of the ACTIVE editor. Close other editors first so it is the only one. */
function editorWebview() {
    return new WebView();
}

async function bodyText() {
    const body = await driver().findElement(By.css('body'));
    return (await body.getText()).trim();
}

/**
 * Switch into `webview`, wait until it shows `surface`'s marker, return its text.
 * Fails at once if the frame turns out to be a different surface.
 */
async function readSurface(webview, surface) {
    await webview.switchToFrame(RENDER_TIMEOUT_MS);
    try {
        let last = { state: 'not-ready', reason: 'nothing read yet' };
        let text = '';
        const deadline = Date.now() + RENDER_TIMEOUT_MS;
        while (Date.now() < deadline) {
            text = await bodyText();
            last = surfaceVerdict(text, surface);
            if (last.state !== 'not-ready') {
                break;
            }
            await driver().sleep(POLL_MS);
        }
        // eslint-disable-next-line no-console
        console.log(`${surface} frame read: ${text.replace(/\s*\n\s*/g, ' | ').slice(0, 100)}`);
        assert.strictEqual(last.state, 'ready', last.reason);
        return text;
    } finally {
        await leaveFrame(webview);
    }
}

/** Press a button inside `webview`, found by its accessible name. */
async function pressInFrame(webview, ariaLabel) {
    await webview.switchToFrame(RENDER_TIMEOUT_MS);
    try {
        const button = await driver().findElement(By.css(`[aria-label="${ariaLabel}"]`));
        await button.click();
    } finally {
        await leaveFrame(webview);
    }
}

/** The quick-input box currently open (the command palette, after Tools). */
async function openInputBox() {
    return InputBox.create(RENDER_TIMEOUT_MS);
}

module.exports = {
    closeAllEditors,
    editorWebview,
    openInputBox,
    openSidebar,
    pressInFrame,
    readSurface,
    runCommand,
    sidebarWebview,
};
