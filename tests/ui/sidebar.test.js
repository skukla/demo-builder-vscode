/**
 * The first REAL user action, driven through the VS Code UI.
 *
 * PL-46 rung two. Rung one (`npm run test:electron`) proves the extension
 * activates and registers what it promises. It cannot prove a user sees anything:
 * a webview that mounts and renders nothing passes every check in this repo.
 *
 * That gap is what prompted the item. The owner hit a React component fault in a
 * webview while testing project creation by hand, and on 2026-09-08 the sidebar
 * rendered eleven elements and no text in the visual harness with nothing
 * flagging it. So the assertion here is deliberately about CONTENT, not presence.
 *
 * WHY WORDS AND NOT ELEMENTS. A spinner is elements. A failed render is elements.
 * The thing that distinguishes "loaded" from "loading forever" is text a person
 * could read, so that is what this counts.
 *
 * Run with `npm run test:ui`. ExTester downloads a VS Code and a matching
 * ChromeDriver on first use into `.test-extensions/` and `test-resources/`.
 */

const assert = require('node:assert');
const { ActivityBar, WebviewView, By, VSBrowser } = require('vscode-extension-tester');

// The activity-bar container title, read from package.json contributes rather
// than guessed: contributes.viewsContainers.activitybar[0].title.
const CONTAINER_TITLE = 'Demo Builder';

describe('the Demo Builder sidebar, opened the way a user opens it', function () {
    // Generous: this launches a real editor and waits on a webview bundle.
    this.timeout(180000);

    it('opens from the activity bar and shows readable content', async function () {
        const control = await new ActivityBar().getViewControl(CONTAINER_TITLE);
        assert.ok(control, `no "${CONTAINER_TITLE}" icon in the activity bar`);

        const view = await control.openView();
        assert.ok(view, 'the view container did not open');

        // `WebviewView`, NOT `WebView`. The latter is for a webview open as an
        // EDITOR and looks for `.editor-instance`; against a sidebar it fails with
        // "Unable to locate element: .editor-instance", which reads like a broken
        // test rather than the wrong page object. `WebviewView` finds the frame
        // that best fits the view's own rectangle instead.
        const webview = new WebviewView();
        await webview.switchToFrame();

        try {
            await VSBrowser.instance.driver.wait(async () => {
                const body = await webview.findWebElement(By.css('body'));
                const text = (await body.getText()).trim();
                return text.length > 0;
            }, 60000, 'the sidebar webview rendered no text within 60s');

            const body = await webview.findWebElement(By.css('body'));
            const text = (await body.getText()).trim();
            const words = text.split(/\s+/).filter(Boolean);

            // eslint-disable-next-line no-console
            console.log(`sidebar rendered ${words.length} words: ${text.replace(/\n/g, ' | ').slice(0, 80)}`);

            assert.ok(
                words.length > 0,
                'the sidebar opened but rendered no readable text — the failure mode this test exists for'
            );
        } finally {
            // Leaving the driver inside the frame breaks every later test.
            await webview.switchBack();
        }
    });
});
