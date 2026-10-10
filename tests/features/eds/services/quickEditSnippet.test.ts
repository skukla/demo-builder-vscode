/**
 * Quick Edit snippet tests — the pure `scripts/scripts.js` transform
 * (`buildQuickEditScriptsJs`). No mocks: the subject does no I/O.
 *
 * The anchors the transform searches for are pinned against the canonical
 * boilerplate by `quickEditSnippet-anchorMatch.test.ts`; the GitHub install
 * that applies it is covered by `quickEditPublisher.test.ts`.
 */

import {
    QUICK_EDIT_LOAD_PAGE_ANCHOR,
    QUICK_EDIT_LOAD_PAGE_EXPORTED,
    QUICK_EDIT_BRANCH_MARKER,
    QUICK_EDIT_LOADLAZY_ANCHOR,
    QUICK_EDIT_SIDEKICK_MARKER,
    QUICK_EDIT_FIRSTIMAGE_ANCHOR,
    QUICK_EDIT_FIRSTIMAGE_MARKER,
    buildQuickEditScriptsJs,
} from '@/features/eds/services/quickEditSnippet';
import { CANONICAL_SCRIPTS_JS } from './quickEditScriptsFixture';

describe('buildQuickEditScriptsJs', () => {
    it('adds the export keyword to the loadPage declaration', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        expect(out).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
        expect(out).not.toContain(`\n${QUICK_EDIT_LOAD_PAGE_ANCHOR}`);
    });

    it('appends the ?quick-edit dynamic-import branch (composes with the export edit)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // Branch marker present (idempotency anchor) ...
        expect(out).toContain(QUICK_EDIT_BRANCH_MARKER);
        // ... and it imports the net-new quick-edit module.
        expect(out).toContain("import('../tools/quick-edit/quick-edit.js')");
        // ... gated on the `quick-edit` query param.
        expect(out).toContain("searchParams.has('quick-edit')");
        // Both edits land in the same output string.
        expect(out).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
    });

    it('preserves the existing scripts.js content (additive transform)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        expect(out).toContain('await loadEager(document);');
        expect(out).toContain('async function loadDa()');
    });

    it('only transforms the first match of the loadPage declaration', () => {
        // Defensive: even if a second un-exported loadPage somehow appears,
        // the engine is first-match-only (mirrors the patch engine).
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const exportedCount = out.split(QUICK_EDIT_LOAD_PAGE_EXPORTED).length - 1;
        expect(exportedCount).toBe(1);
    });

    it('inserts the Sidekick custom:quick-edit listener at the top of loadLazy', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // Idempotency marker present ...
        expect(out).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        // ... it registers the custom:quick-edit Sidekick listener ...
        expect(out).toContain("addEventListener('custom:quick-edit'");
        // ... and it imports the net-new quick-edit module.
        expect(out).toContain("import('../tools/quick-edit/quick-edit.js')");
    });

    it('places the sidekick listener immediately after the loadLazy declaration', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const anchorIdx = out.indexOf(QUICK_EDIT_LOADLAZY_ANCHOR);
        const markerIdx = out.indexOf(QUICK_EDIT_SIDEKICK_MARKER);
        expect(anchorIdx).toBeGreaterThanOrEqual(0);
        expect(markerIdx).toBeGreaterThan(anchorIdx);
        // The marker is the first thing inside the loadLazy body (nothing of
        // the original body precedes it).
        const between = out.slice(anchorIdx + QUICK_EDIT_LOADLAZY_ANCHOR.length, markerIdx);
        expect(between.trim()).toBe('');
    });

    it('only inserts the sidekick listener once (first-match-only)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const markerCount = out.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('does not double-insert when the sidekick listener is already present', () => {
        const once = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const twice = buildQuickEditScriptsJs(once);
        const markerCount = twice.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('adds the sidekick listener to a partially-vendored file (IIFE present, listener missing)', () => {
        // The user's exact case: an earlier incomplete vendoring added the
        // export + the ?quick-edit IIFE branch but never the Sidekick listener.
        // Simulate that state: a fully-vendored file with the entire sidekick
        // block excised (everything from the marker to the end of loadLazy's
        // listener wiring), leaving the export + IIFE branch untouched.
        const partial = [
            '// ... eager/lazy/delayed helpers above ...',
            '',
            QUICK_EDIT_LOADLAZY_ANCHOR,
            '  loadHeader(doc.querySelector(\'header\'));',
            '  loadFooter(doc.querySelector(\'footer\'));',
            '}',
            '',
            QUICK_EDIT_LOAD_PAGE_EXPORTED,
            '  await loadEager(document);',
            '  await loadLazy(document);',
            '  loadDelayed();',
            '}',
            '',
            'loadPage();',
            '',
            QUICK_EDIT_BRANCH_MARKER,
            '(() => {',
            "  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');",
            "  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());",
            '})();',
            '// === end Quick Edit dynamic import ===',
            '',
        ].join('\n');
        // Guard: the partial really is missing the listener but keeps the IIFE.
        expect(partial).not.toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(partial).toContain(QUICK_EDIT_BRANCH_MARKER);

        const repaired = buildQuickEditScriptsJs(partial);
        expect(repaired).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(repaired).toContain("addEventListener('custom:quick-edit'");
        // No duplicate IIFE branch was added.
        expect(repaired.split(QUICK_EDIT_BRANCH_MARKER).length - 1).toBe(1);
    });

    it('replaces the waitForFirstImage anchor with the quick-edit first-paint guard', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // Guard marker present (idempotency anchor) ...
        expect(out).toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);
        // ... it gates on quick-edit mode ...
        expect(out).toContain("classList.contains('quick-edit')");
        // ... and skips the wait by resolving immediately.
        expect(out).toContain('return Promise.resolve();');
        // The bare anchor is gone — it was rewritten into the guarded callback.
        expect(out).not.toContain(QUICK_EDIT_FIRSTIMAGE_ANCHOR);
    });

    it('still calls waitForFirstImage in the guarded form (non-quick-edit path)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        // The guard wraps, not removes, the original behavior.
        expect(out).toContain('waitForFirstImage(section)');
    });

    it('only replaces the first-image anchor once (first-match-only)', () => {
        const out = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const markerCount = out.split(QUICK_EDIT_FIRSTIMAGE_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('does not double-apply the first-paint guard when the marker is already present', () => {
        const once = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
        const twice = buildQuickEditScriptsJs(once);
        const markerCount = twice.split(QUICK_EDIT_FIRSTIMAGE_MARKER).length - 1;
        expect(markerCount).toBe(1);
    });

    it('adds the first-paint guard to a partially-vendored file (export + IIFE + listener present, guard missing)', () => {
        // Every repo wired before this change is in this state: export, IIFE
        // branch and Sidekick listener present, but the first-paint guard
        // missing. Simulate it: a file carrying all three earlier markers plus
        // the bare waitForFirstImage anchor, with no firstimage marker yet.
        const partial = [
            'async function loadEager(doc) {',
            '    document.body.classList.add(\'appear\');',
            `    ${QUICK_EDIT_FIRSTIMAGE_ANCHOR}`,
            '  }',
            '',
            QUICK_EDIT_LOADLAZY_ANCHOR,
            `  ${QUICK_EDIT_SIDEKICK_MARKER}`,
            "  document.querySelector('aem-sidekick');",
            '}',
            '',
            QUICK_EDIT_LOAD_PAGE_EXPORTED,
            '  await loadEager(document);',
            '}',
            '',
            'loadPage();',
            '',
            QUICK_EDIT_BRANCH_MARKER,
            '(() => {})();',
            '// === end Quick Edit dynamic import ===',
            '',
        ].join('\n');
        // Guard: the partial has the first three markers but NOT the firstimage one.
        expect(partial).toContain(QUICK_EDIT_LOAD_PAGE_EXPORTED);
        expect(partial).toContain(QUICK_EDIT_BRANCH_MARKER);
        expect(partial).toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(partial).not.toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);

        const repaired = buildQuickEditScriptsJs(partial);
        expect(repaired).toContain(QUICK_EDIT_FIRSTIMAGE_MARKER);
        expect(repaired).toContain("classList.contains('quick-edit')");
        expect(repaired).not.toContain(QUICK_EDIT_FIRSTIMAGE_ANCHOR);
        // The earlier three edits were left untouched (not duplicated).
        expect(repaired.split(QUICK_EDIT_BRANCH_MARKER).length - 1).toBe(1);
        expect(repaired.split(QUICK_EDIT_SIDEKICK_MARKER).length - 1).toBe(1);
    });
});
