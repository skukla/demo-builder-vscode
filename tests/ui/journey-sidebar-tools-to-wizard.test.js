/**
 * One journey across two surfaces: the sidebar's Tools tile → the wizard.
 *
 * PL-66. An SC's way to a Demo Builder command from the sidebar is the Tools
 * tile: it opens the command palette pre-filled with "Demo Builder: "
 * (`SidebarProvider.handleOpenTools`). Picking "Create Project" there opens the
 * project wizard as an editor webview. So this crosses three things a person
 * sees — sidebar webview, VS Code palette, editor webview — and each hand-off is
 * asserted, not assumed:
 *
 *   1. the press reaches the extension: the palette opens with the prefix the
 *      handler sends (a dead button leaves no palette at all);
 *   2. the wizard that opens shows its own content past "Loading…".
 *
 * The journey stops at the wizard's first screen, before any step that would
 * create anything in Adobe, GitHub or DA.live.
 *
 * It leaves the wizard open. `sidebar.test.js` runs in the same VS Code, and
 * ExTester's glob does not promise an order, so the sidebar test sets up its own
 * state in each case rather than relying on what ran before it.
 */

const assert = require('node:assert');
const {
    closeAllEditors,
    editorWebview,
    openInputBox,
    openSidebar,
    pressInFrame,
    readSurface,
    sidebarWebview,
} = require('./surfaces');

// What `handleOpenTools` pre-fills (src/features/sidebar/providers/sidebarProvider.ts).
const TOOLS_PREFIX = '>Demo Builder: ';
// The palette label of `demoBuilder.createProject`: category + title in package.json.
const CREATE_PROJECT = 'Demo Builder: Create Project';

describe('journey: sidebar Tools → Create Project → the wizard', function () {
    this.timeout(180000);

    it('opens the wizard from the sidebar and shows its steps', async function () {
        await closeAllEditors();
        await openSidebar();
        await readSurface(sidebarWebview(), 'sidebar');

        // The UtilityBar tile's accessible name (src/features/sidebar/ui/views/UtilityBar.tsx).
        await pressInFrame(sidebarWebview(), 'Tools');

        const palette = await openInputBox();
        assert.strictEqual(
            await palette.getText(),
            TOOLS_PREFIX,
            'the Tools tile did not open the palette with the Demo Builder prefix',
        );
        await palette.setText(`>${CREATE_PROJECT}`);
        await palette.selectQuickPick(CREATE_PROJECT);

        await readSurface(editorWebview(), 'wizard');
    });
});
