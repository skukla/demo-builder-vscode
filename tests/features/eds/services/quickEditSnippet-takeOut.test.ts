/**
 * Taking Demo Builder's Quick Edit wiring back out of `scripts/scripts.js`, so an update can
 * apply Adobe's change to Adobe's own lines and the wiring is put back after
 * (`withoutQuickEditWiring`, the inverse of `buildQuickEditScriptsJs`).
 *
 * JustRite's Adobe boilerplate update stopped on scripts.js because Adobe changed the
 * `loadHeader(...)` line our Sidekick listener sits right above (2026-10-30). Only text that
 * is exactly ours comes out, and only when putting it back gives the same file again.
 */

import {
    QUICK_EDIT_BRANCH_MARKER,
    QUICK_EDIT_FIRSTIMAGE_MARKER,
    QUICK_EDIT_LOAD_PAGE_EXPORTED,
    QUICK_EDIT_SIDEKICK_MARKER,
    buildQuickEditScriptsJs,
    withoutQuickEditWiring,
} from '@/features/eds/services/quickEditSnippet';
import { CANONICAL_SCRIPTS_JS } from './quickEditScriptsFixture';

const WIRED = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);

describe('withoutQuickEditWiring', () => {
    it('takes out the three marked blocks, leaving the export, so wiring again gives the same file', () => {
        const out = withoutQuickEditWiring(WIRED);

        expect(out).toBeDefined();
        expect(out).not.toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(out).not.toContain(QUICK_EDIT_BRANCH_MARKER);
        expect(out).not.toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);
        // `export` is not marked as ours, so it stays.
        expect(out).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
        expect(buildQuickEditScriptsJs(out as string)).toBe(WIRED);
    });

    it('answers undefined for a file with no wiring', () => {
        expect(withoutQuickEditWiring(CANONICAL_SCRIPTS_JS)).toBeUndefined();
    });

    it('leaves a block someone edited, and takes out the ones that are exactly ours', () => {
        const edited = WIRED.replace("sk.addEventListener('custom:quick-edit', loadQuickEdit);", 'sk.addEventListener("x", f);');

        const out = withoutQuickEditWiring(edited) as string;

        expect(out).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(out).not.toContain(QUICK_EDIT_BRANCH_MARKER);
        expect(buildQuickEditScriptsJs(out)).toBe(edited);
    });

    it('takes nothing out when wiring again would not give the same file back', () => {
        // The un-exported anchor is back, so wiring again would also add `export`.
        const unexported = WIRED.replace(QUICK_EDIT_LOAD_PAGE_EXPORTED, 'async function loadPage() {');

        expect(withoutQuickEditWiring(unexported)).toBeUndefined();
    });
});
